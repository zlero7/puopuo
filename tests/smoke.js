// 스모크 테스트: 서버를 띄우고 브라우저에서 여러 모드를 CPU끼리 빠르게 돌려 오류가 없는지 확인
// 실행: npm test   (playwright 필요: 전역 설치 또는 npm i -D playwright)
const { spawn } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }

const PORT = 3999 + Math.floor(Math.random() * 500);

// 브라우저 안에서 실행: 한 판을 dt 단위로 시뮬레이션
const SIM = `
window.__sim = (cfg) => {
  stats.style = cfg.my; stats.cpuStyle = cfg.op; stats.p2Style = cfg.op;
  stats.board = cfg.board || 'wide'; stats.players = cfg.players || 2;
  stats.rule = cfg.rule || 'tsu';
  game.diff = cfg.diff == null ? 2 : cfg.diff; game.soloMode = cfg.solo || 'endless';
  if (cfg.adv) advPlay(cfg.adv[1], true, cfg.adv[0]); else start(cfg.mode);
  if (cfg.pre) eval(cfg.pre);
  for (const f of game.fields) {          // 사람 자리도 CPU로 바꿔 자동 진행
    if (!f.human) continue;
    f.human = false;
    f.ai = { ...aiPreset(f.kind, 2), delay: 30 };
  }
  for (const f of game.fields) if (f.phase === 'drop' && !f.human) f.planAI();
  let t = 0, steps = 0;
  const limit = cfg.steps || 20000;
  while (steps++ < limit) {
    t += 16; update(16);
    if (steps % 50 === 0) render(t);
    if (game.state === 'over' && game.recorded) break;
  }
  render(t);
  if (cfg.replay) {
    const orig = game.fields.map(f => ({ score: f.score, dead: f.dead, grid: f.encode() }));
    const rp = findReplay(stats.history[0].rp) || null;
    if (!rp) return { state: 'no-replay' };
    startReplay(JSON.parse(JSON.stringify(rp)));
    let k = 0; while (k++ < 60000 && !(game.state === 'over' && game.overT > 2000)) { t += 16; update(16); if (k % 50 === 0) render(t); }
    render(t);
    const now = game.fields.map(f => ({ score: f.score, dead: f.dead, grid: f.encode() }));
    return { state: game.state, steps: k, events: rp.ev.length, size: JSON.stringify(rp).length, same: orig.every((o, i) => o.score === now[i].score && o.dead === now[i].dead && (!o.dead || o.grid === now[i].grid)), orig, now };
    // 점수·탈락·탈락한 판의 격자가 같으면 같은 경기. 끝나는 순간 살아 있는 판은 연쇄 연출 단계가 몇 프레임 다를 수 있음
  }
  return { state: game.state, steps, kinds: game.fields.map(f => f.kind), dead: game.fields.map(f => f.dead),
    scores: game.fields.map(f => f.score), maxChain: game.fields.map(f => f.maxChain), extra: cfg.probe ? eval(cfg.probe) : null };
};`;

const CASES = [
  { name: '뿌요 vs 뿌요 CPU', mode: 'vs', my: 'puyo', op: 'puyo' },
  { name: '뿌요 vs 테트리스 CPU', mode: 'vs', my: 'puyo', op: 'tetris' },
  { name: '테트리스 vs 뿌요 CPU', mode: 'vs', my: 'tetris', op: 'puyo' },
  { name: '테트리스 vs 테트리스 CPU', mode: 'vs', my: 'tetris', op: 'tetris' },
  { name: '로컬 대전', mode: 'local', my: 'puyo', op: 'tetris' },
  { name: '연습 뿌요', mode: 'solo', my: 'puyo', op: 'puyo', steps: 6000 },
  { name: '연습 테트리스 스프린트', mode: 'solo', my: 'tetris', op: 'puyo', solo: 'sprint', steps: 8000 },
];
const extra = require('./cases');
CASES.push(...extra);
if (process.env.ONLY) CASES.splice(0, CASES.length, ...CASES.filter(c => new RegExp(process.env.ONLY).test(c.name)));   // ONLY=리플레이 npm test

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, HOST: '127.0.0.1' }, stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 600));
  const browser = await chromium.launch(process.env.PLAYWRIGHT_BROWSERS_PATH ? {} : { executablePath: '/opt/pw-browsers/chromium' });
  let fail = 0;
  try {
    for (const c of CASES) {
      const page = await browser.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push(e.message));
      page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR/.test(m.text())) errs.push(m.text()); });
      await page.goto(`http://127.0.0.1:${PORT}/`);
      await page.evaluate(SIM);
      let res = null;
      try { const { expect, ...cfg } = c; res = await page.evaluate(cfg => window.__sim(cfg), cfg); } catch (e) { errs.push(e.message); }
      const bad = errs.length || !res || (c.expect && !c.expect(res));
      if (bad) fail++;
      console.log(`${bad ? '✗' : '✓'} ${c.name}  ${res ? JSON.stringify(res) : ''}`);
      for (const e of errs) console.log('    ' + e);
      await page.close();
    }
  } finally {
    await browser.close(); srv.kill();
  }
  console.log(fail ? `\n${fail}개 실패` : '\n모두 통과');
  process.exit(fail ? 1 : 0);
})();
