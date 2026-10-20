// 서버 검증 테스트: 브라우저에서 CPU끼리 둔 랭크 규칙 경기 기록을 서버 검증기에 넣어
// ① 정상 경기는 모두 통과하고 탈락한 쪽이 지는지 ② 조작한 기록은 잡아내는지 확인
// 실행: node tests/verify.js   (playwright 필요)
const { spawn, execSync } = require('child_process');
const path = require('path');
const { newMatch } = require('../verify');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'))); }

const PORT = 5200 + Math.floor(Math.random() * 300);
const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) process.exitCode = 1; };

// 기록을 검증기에 넣기. mutate(ev, k)로 k번째 이벤트를 바꿔 볼 수 있음
function check(rp, mutate) {
  const m = newMatch({ seed: rp.seed, styles: rp.players.map(p => p.style), rule: rp.rule, board: rp.board });
  let k = 0;
  for (const [t, pi, d0] of rp.ev) {
    let d = { ...d0, at: t };
    if (mutate) { d = mutate(d, k, pi); if (!d) { k++; continue; } }
    k++;
    m.feed(pi, d, t + 40);
    if (m.loser != null) break;
  }
  return m;
}

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, REQUIRE_AUTH: '0', PORT, HOST: '127.0.0.1' }, stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 600));
  const browser = await chromium.launch(process.env.PLAYWRIGHT_BROWSERS_PATH ? {} : { executablePath: '/opt/pw-browsers/chromium' });
  const games = [];
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/`);
    const combos = [['puyo', 'puyo'], ['puyo', 'tetris'], ['tetris', 'puyo'], ['tetris', 'tetris']];
    for (const [a, b] of combos) for (let rep = 0; rep < (+process.env.REPS || 2); rep++) {
      const rp = await page.evaluate(([a, b]) => {
        stats.style = a; stats.cpuStyle = b; stats.board = 'classic'; stats.rule = 'tsu'; stats.players = 2; stats.firstTo = 1; game.diff = 2;
        start('vs');
        for (const f of game.fields) { f.human = false; f.ai = { ...aiPreset(f.kind, 2), delay: 40, atk: 1 }; if (f.phase === 'drop') f.planAI(); }
        let n = 0; while (n++ < 60000 && !(game.state === 'over' && game.recorded)) update(16);
        return findReplay(stats.history[0].rp);
      }, [a, b]);
      if (rp) games.push(rp);
    }
  } finally { await browser.close(); srv.kill(); }

  require('fs').writeFileSync(process.env.DUMP || '/dev/null', JSON.stringify(games));
  // ① 정상 경기
  for (const rp of games) {
    const m = check(rp), dead = rp.ev.find(e => e[2].t === 'dead'), st = rp.players.map(p => p.style).join(' vs ');
    const locks = rp.ev.filter(e => /lock/.test(e[2].t)).length, atks = rp.ev.filter(e => e[2].t === 'atk').length;
    ok(m.loser === (dead ? dead[1] : null) && !m.seats.some(s => s.bad), `정상 경기 통과(${st}): 놓기 ${locks} · 공격 ${atks} · 진 쪽 ${m.loser} ${m.seats.map(s => s.bad).filter(Boolean).join(' ')}`);
  }
  // ② 조작
  const P = games.find(g => g.players[0].style === 'puyo' && g.players[1].style === 'puyo');
  const T = games.find(g => g.players[0].style === 'tetris' && g.players[1].style === 'tetris');
  const firstK = (rp, fn) => rp.ev.findIndex(e => fn(e[2], e[1]));
  const tamper = (rp, name, fn, want) => { const m = check(rp, fn); ok(m.seats.some(s => s.bad && (!want || want.test(s.bad))), `조작 잡음: ${name} → ${m.seats.map(s => s.bad).filter(Boolean)[0] || '못 잡음'}`); };
  if (P) {
    const kl = firstK(P, d => d.t === 'lock');
    tamper(P, '뿌요를 갈 수 없는 자리에 놓기', (d, k) => k === kl ? { ...d, y: d.y - 4 } : d, /자리/);
    tamper(P, '받지 않은 색 조각 놓기', (d, k) => k === kl ? { ...d, a: d.a % 4 + 1 } : d, /조각/);
    const ka = firstK(P, d => d.t === 'atk');
    if (ka >= 0) tamper(P, '공격을 부풀리기', (d, k) => k === ka ? { ...d, n: d.n + 30 } : d, /공격|상쇄/);   // 한 연쇄로 낼 수 있는 양을 넘으면 그 자리에서, 아니면 남은 상쇄에서 걸림
    const kg = firstK(P, d => d.t === 'garb');
    if (kg >= 0) tamper(P, '방해뿌요 안 받기', d => d.t === 'garb' ? null : d, /방해|자리|판/);
    const dead = P.ev.find(e => e[2].t === 'dead');
    if (dead) {   // 탈락 기록을 빼고 버티거나 계속 둬도: 서버는 막힌 순간 그쪽을 탈락으로 봄
      const m = check({ ...P, ev: P.ev.filter(e => !(e[2].t === 'dead')).concat([[dead[0] + 500, dead[1], { t: 'lock', n: 999, x: 2, y: 5, o: 0, a: 1, b: 1 }]]) });
      ok(m.loser === dead[1], `조작 잡음: 탈락을 숨기고 버티기 → ${m.loser === dead[1] ? '막힌 순간 탈락' : '못 잡음'}`);
    }
    tamper({ ...P, ev: P.ev.map(([t, pi, d]) => [Math.round(t / 8), pi, d]) }, '8배 빠르게 두기(매크로)', d => d, /속도/);
    // 공격을 모아 두기: 어떤 공격을 그때 보내지 않고 있다가, 연쇄가 없는 다음 놓기 뒤에 보냄(그 사이 받은 방해가 없는 구간에서)
    {
      const E = P.ev, lockAfter = (k, pi) => E.findIndex((e, j) => j > k && e[1] === pi && e[2].t === 'lock');
      let pick = null;
      for (let k = 0; k < E.length && !pick; k++) {
        const [, pi, d] = E[k]; if (d.t !== 'atk') continue;
        for (let a = lockAfter(k, pi); a > 0 && !pick; a = lockAfter(a, pi)) {
          const b = lockAfter(a, pi); if (b < 0) break;
          if (E.slice(k + 1, b).some(e => e[1] === pi && e[2].t === 'garb')) break;
          if (!E.slice(a + 1, b).some(e => e[1] === pi && /atk|off/.test(e[2].t))) pick = { k, pi, a };
        }
      }
      if (pick) {
        const { k, pi, a } = pick, ev = E.slice(0, a + 1).filter((e, j) => j !== k && (j < k || e[1] === pi));
        ev.push([E[a][0] + 1, pi, E[k][2]]);
        const m = check({ ...P, ev });
        ok(m.seats[pi].bad && /공격|상쇄/.test(m.seats[pi].bad), `조작 잡음: 공격을 모아 뒀다 나중에 쓰기 → ${m.seats[pi].bad || '못 잡음'}`);
      }
    }
  }
  if (T) {
    const kl = firstK(T, d => d.t === 'tlock');
    tamper(T, '테트리스 블록을 공중에 놓기', (d, k) => k === kl ? { ...d, y: d.y - 5 } : d, /자리/);
    tamper(T, '받지 않은 블록 놓기', (d, k) => k === kl ? { ...d, k: d.k === 'I' ? 'O' : 'I' } : d, /조각/);
    const ka = firstK(T, d => d.t === 'atk');
    if (ka >= 0) tamper(T, '줄 공격 부풀리기', (d, k) => k === ka ? { ...d, n: d.n + 10 } : d, /공격/);
    const kg = firstK(T, d => d.t === 'tgarb');
    if (kg >= 0) tamper(T, '방해 줄 안 받기', d => d.t === 'tgarb' ? null : d, /방해|자리|판/);
  }
  ok(games.length >= 4, `경기 ${games.length}판 확인`);
})();
