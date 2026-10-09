// 서버용 게임 엔진: 브라우저 게임 코드(public/js)를 그대로 불러와 화면·소리 없이 돌림
// 랭크전 검증(verify.js)과 서버에서 돌리는 AI 상대가 씀. 규칙 코드를 따로 베끼지 않으니 브라우저와 계산이 같음
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');

const DIR = path.join(__dirname, 'public', 'js');
// 규칙에 필요한 파일만(메뉴·입력·네트워크·기록 화면은 뺌)
const FILES = ['core.js', 'fever.js', 'puyo.js', 'tetris.js', 'game.js', 'chars.js', 'party.js', 'swap.js', 'bigbang.js', 'fusion.js'];
const SRC = FILES.map(f => new vm.Script(fs.readFileSync(path.join(DIR, f), 'utf8'), { filename: f }));

// 무엇이든 받아 주는 빈 객체(캔버스 그리기·DOM): 어떤 속성을 읽어도, 불러도 자기 자신
function hollow() {
  const fn = function () {};
  const p = new Proxy(fn, {
    get: (t, k) => k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : k === 'length' ? 0 : p,
    set: () => true, apply: () => p, construct: () => p, has: () => true,
  });
  return p;
}

// 엔진 하나 = 독립된 전역 공간 하나(대전 한 판마다 새로 만듦)
function createEngine() {
  const H = hollow();
  const sandbox = {
    console, Math, JSON, Date, Array, Object, Number, String, Boolean, Set, Map, Symbol, Error, Proxy, Reflect, Infinity, NaN, isFinite, parseInt, parseFloat,
    setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0,
    performance: { now: () => 0 },
    window: { devicePixelRatio: 1 },          // AudioContext 없음 → 소리는 조용히 꺼짐
    document: { getElementById: () => H, createElement: () => H, body: H, querySelectorAll: () => [], addEventListener: () => {} },
    getComputedStyle: () => ({ fontFamily: 'sans-serif' }),
    localStorage: { getItem: () => null, setItem: () => {} },
    navigator: { getGamepads: () => [] },
  };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  // 브라우저에서 play.js · replay.js · stats.js가 주는 것 중 규칙 코드가 부르는 것들
  vm.runInContext(`
    var __events = [], __launch = [];
    const stats = { name: 'AI', char: 'lumi', style: 'puyo', rule: 'tsu', board: 'classic', players: 2 };
    const ring = () => {}, burst = () => {};
    function emit(f, d) { __events.push([f, d]); }
    function recEv() {} function recState() {}
    function itemFx() {} function routeKind(f) { return f; }
    // play.js의 stateOf와 같음(서버에서 돌리는 AI 판의 조각 위치·점수를 상대 화면에 보냄)
    function stateOf(f) {
      if (f.kind === 'tetris') {
        const q = f.phase === 'drop' && f.cur ? { k: f.cur.k, x: f.cur.x, y: f.cur.y, r: f.cur.r } : null;
        return { t: 'st', k: 't', n: f.idx, pc: q, ho: f.holdK, gg: f.gauge, pe: f.pending, sc: f.score, mc: f.maxChain };
      }
      const p = f.piece; let pc = null;
      if (p && f.phase === 'drop') {
        const cf = f.fits({ ...p, y: p.y + 1 });
        pc = { x: p.x, y: p.y, o: p.o, a: p.a, b: p.b, p: cf ? Math.round(Math.min(1, f.acc / (f.soft ? 35 : f.fallIv())) * 100) / 100 : 0 };
      }
      return { t: 'st', k: 'p', n: f.idx, pc, hp: f.holdP, pe: f.pending, sc: f.score, mc: f.maxChain };
    }
  `, ctx);
  for (const s of SRC) s.runInContext(ctx);
  vm.runInContext(`
    game.fx = { rings: [], sparks: [] }; game.orbs = [];
    game.launch = (from, to, n, x, y, kind, ch) => { __launch.push({ from, to, n, kind }); };
  `, ctx);
  return ctx;
}

// 서버에서 돌리는 AI 상대 한 판: 내 판(AI)과 상대 자리(원격, 스타일만 맞춤)
function createBot({ seed, style, oppStyle, board = 'classic', rule = 'tsu', lv }) {
  const E = createEngine(), run = c => vm.runInContext(c, E);
  run(`applyBoard(${JSON.stringify(board)}); seedSeq(${seed >>> 0}); game.vs = true; game.rule = ${JSON.stringify(rule)};
    game.state = 'play'; game.mode = 'online'; game.el = 0; game.marginLv = 0;`);
  const f = run(`(st, ost, lv) => { const b = mkField(st, 0, false, 'AI'); b.ai = botAi(b.kind, lv);
    const o = mkField(ost, 0, false, 'P'); o.remote = true; b.opp = o; o.opp = b; game.fields = [b, o]; b.spawn(); return b; }`)(style, oppStyle, lv);
  const game = run('game'), stateOf = run('stateOf');
  return {
    f,
    step(dt, el) { game.el = el; f.update(dt, true); run('__launch.length = 0'); return run('__events.splice(0)').filter(e => e[0] === f).map(e => e[1]); },
    state: () => stateOf(f),
    hit(n) { f.pending += n; },               // 상대 공격이 도착함
  };
}

module.exports = { createEngine, createBot };
