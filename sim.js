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
  `, ctx);
  for (const s of SRC) s.runInContext(ctx);
  vm.runInContext(`
    game.fx = { rings: [], sparks: [] }; game.orbs = [];
    game.launch = (from, to, n, x, y, kind, ch) => { __launch.push({ from, to, n, kind }); };
  `, ctx);
  return ctx;
}

module.exports = { createEngine };
