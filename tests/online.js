// 온라인 테스트: 서버 + 브라우저 N개로 빠른 매칭 → 각자 CPU로 자동 진행 → 모두 같은 결과인지 확인
// 실행: node tests/online.js [인원=3] [ranked]
const { spawn, execSync } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'))); }
const N = +process.argv[2] || 3, RANKED = process.argv[3] === 'ranked', PORT = 4600 + Math.floor(Math.random() * 300);

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, HOST: '127.0.0.1', RANK_FILE: require('os').tmpdir() + `/ranks-${PORT}.json` }, stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 600));
  const browser = await chromium.launch();
  const pages = [], errs = [];
  try {
    for (let i = 0; i < N; i++) {
      const ctx = await browser.newContext(); const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(`[${i}] ${e.message}`));
      await p.goto(`http://127.0.0.1:${PORT}/`);
      await p.evaluate(([i, N]) => {
        stats.players = N; stats.name = 'P' + i; stats.style = i % 2 ? 'tetris' : 'puyo'; stats.board = 'wide'; saveStats();
        // 시작하면 내 판을 CPU로 바꿔 자동 진행
        const orig = window.onNetHook = true;
        setInterval(() => {
          const f = game.fields[0];
          if (game.mode === 'online' && f && f.human && game.state === 'play') {
            f.human = false; f.ai = { ...aiPreset(f.kind, 2), delay: 30 };
            if (f.phase === 'drop') f.planAI();
          }
        }, 50);
      }, [i, N]);
      pages.push(p);
    }
    for (const p of pages) { await p.evaluate(r => act(r ? 'ranked' : 'quick'), RANKED); await new Promise(r => setTimeout(r, 200)); }
    const t0 = Date.now();
    let res;
    for (;;) {
      await new Promise(r => setTimeout(r, 1000));
      res = await Promise.all(pages.map(p => p.evaluate(() => ({ state: game.state, mode: game.mode, n: game.fields.length,
        names: game.fields.map(f => f.name), dead: game.fields.map(f => f.dead), won: (game.fields.find(f => f.won) || {}).name || null,
        series: game.series, rank: game.rankRes, sub: $('ovSub').textContent }))));
      if (RANKED ? res.every(r => r.rank && /배치|RP/.test(r.sub)) : res.every(r => r.state === 'over' && r.won)) break;
      if (Date.now() - t0 > 240000) break;
    }
    for (const r of res) console.log(JSON.stringify(r));
    const ok = RANKED ? !errs.length && res.every(r => r.rank && /배치|RP/.test(r.sub)) && res.filter(r => r.rank.win).length === 1
      : !errs.length && res.every(r => r.mode === 'online' && r.n === N && r.state === 'over') && new Set(res.map(r => r.won)).size === 1;
    errs.forEach(e => console.log('  ' + e));
    console.log(ok ? (RANKED ? `✓ 랭크전: ${res.map(r => r.sub).join(' / ')}` : `✓ 온라인 ${N}인 대전: 모두 같은 승자 ${res[0].won}`) : `✗ 온라인 ${RANKED ? '랭크전' : N + '인 대전'} 실패`);
    process.exitCode = ok ? 0 : 1;
  } finally { await browser.close(); srv.kill(); }
})();
