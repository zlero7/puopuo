// 게임 상태 · 조작 키 · 판 배치 · 판 만들기/시작
'use strict';

/* ================= 게임 진행 ================= */
const game = { state: 'menu', vs: true, fields: [], orbs: [], overT: 0, lastMode: 'vs',
  inp: [{ left: false, right: false, down: false }, { left: false, right: false, down: false }] };
game.held = game.inp[0];
const ACTIONS = [['left', '왼쪽'], ['right', '오른쪽'], ['soft', '빠르게 내리기'], ['hard', '하드드롭'], ['cw', '시계 회전'], ['ccw', '반시계 회전'], ['hold', '홀드'], ['pause', '일시정지']];
const DEF_KEYS = { left: ['ArrowLeft', ''], right: ['ArrowRight', ''], soft: ['ArrowDown', ''], hard: [' ', ''], cw: ['x', 'ArrowUp'], ccw: ['z', ''], hold: ['c', 'Shift'], pause: ['Escape', 'p'] };
// 로컬 2인: 한 키보드를 나눠 씀
const LOCAL_KEYS = [
  { a: 'left', d: 'right', s: 'soft', w: 'hard', e: 'cw', q: 'ccw', r: 'hold' },
  { arrowleft: 'left', arrowright: 'right', arrowdown: 'soft', arrowup: 'hard', '/': 'cw', '.': 'ccw', ',': 'hold' },
];
const keyName = k => k === ' ' ? 'Space' : k === '' ? '—' : k.length === 1 ? k.toUpperCase() : k.replace('Arrow', '방향키 ').replace('Left', '←').replace('Right', '→').replace('Up', '↑').replace('Down', '↓');
function keyMap() {
  const b = { ...DEF_KEYS, ...(stats.keys || {}) }, m = {};
  for (const [a] of ACTIONS) for (const k of b[a] || []) if (k) m[k.toLowerCase()] = a;
  return m;
}
function playerAction(pi, action, down, repeat) {
  const inp = game.inp[pi];
  if (action === 'left' || action === 'right') { inp[action] = down; return; }
  if (action === 'soft') { inp.down = down; return; }
  if (!down || repeat) return;
  if (action === 'pause') { openPause(); return; }
  if (game.state !== 'play') return;
  const f = game.fields.find(x => x.human && (x.pi || 0) === pi); if (!f) return;
  if (action === 'hard') f.hardDrop();
  else if (action === 'cw') f.rotate(1);
  else if (action === 'ccw') f.rotate(-1);
  else if (action === 'hold' && f.hold) f.hold();
}
// 게임패드: 표준 배치(십자키 이동·↑하드드롭 / A 시계 · B 반시계 · X·LB 홀드 / Start 일시정지)
const PAD_MAP = { 14: 'left', 15: 'right', 13: 'soft', 12: 'hard', 0: 'cw', 1: 'ccw', 2: 'hold', 4: 'hold', 3: 'hard', 9: 'pause' };
const padPrev = [{}, {}];
function pollPads() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  pads.slice(0, 2).forEach((pad, idx) => {
    const pi = game.mode === 'local' ? idx : 0;
    if (game.mode !== 'local' && idx > 0) return;
    for (const [bi, action] of Object.entries(PAD_MAP)) {
      const on = !!(pad.buttons[bi] && pad.buttons[bi].pressed), was = !!padPrev[idx][bi];
      if (on !== was) {
        if (game.state === 'menu') { if (on) padMenu(action); }
        else if (!overlay.classList.contains('hidden')) { if (on) padOverlay(action); }
        else playerAction(pi, action, on, false);
      }
      padPrev[idx][bi] = on;
    }
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0, pa = padPrev[idx].ax || 0;
    const dir = Math.abs(ax) > 0.5 ? Math.sign(ax) : 0;
    if (dir !== pa && game.state === 'play' && overlay.classList.contains('hidden')) {
      playerAction(pi, 'left', dir < 0, false); playerAction(pi, 'right', dir > 0, false);
    }
    padPrev[idx].ax = dir;
    if (game.state === 'play') game.inp[pi].down = game.inp[pi].down || ay > 0.6;
  });
}
function padMenu(a) {
  const d = { left: [-1, 0], right: [1, 0], hard: [0, -1], soft: [0, 1] }[a];
  if (d) moveSel(d[0], d[1]);
  else if (a === 'cw') { const ae = document.activeElement; if (ae && ae.dataset && ae.dataset.act) ae.click(); }
  else if (a === 'ccw') menuBack();
}
function padOverlay(a) {
  const bs = [...overlay.querySelectorAll('.btn')].filter(b => !b.classList.contains('hidden'));
  const i = bs.indexOf(document.activeElement);
  if (a === 'left' || a === 'hard') bs[(i - 1 + bs.length) % bs.length].focus();
  else if (a === 'right' || a === 'soft') bs[(i + 1) % bs.length].focus();
  else if (a === 'cw') (document.activeElement && document.activeElement.click());
  else if (a === 'pause' || a === 'ccw') { if (game.ovKind === 'pause' || game.ovKind === 'forfeit') resume(); }
}

// 화면에 맞춰 키움(최대 1.6배). 확대해도 흐려지지 않게 내부 해상도도 함께 올림.
// 연습(1인)은 방해뿌요 칸이 필요 없어서 위쪽을 잘라 필드를 더 크게 보여줌
let LW = 840, VIEW_Y0 = 0;
const viewH = () => CANVAS_H - VIEW_Y0;
function fit() {
  const pad = document.getElementById('pad');
  const padH = getComputedStyle(pad).display === 'none' ? 0 : 84;
  const bands = document.querySelector('.band-top').offsetHeight + document.querySelector('.band-bot').offsetHeight + 24;
  const s = Math.max(0.3, Math.min(1.6, (window.innerWidth - 16) / LW, (window.innerHeight - bands - padH) / viewH()));
  const rs = DPR * Math.max(1, s);
  if (cv.width !== Math.round(LW * rs) || cv.height !== Math.round(viewH() * rs)) { cv.width = Math.round(LW * rs); cv.height = Math.round(viewH() * rs); }
  game.rs = rs;
  cv.style.width = (LW * s) + 'px'; cv.style.height = (viewH() * s) + 'px';
}
function setSize(W) { LW = W; VIEW_Y0 = game.vs ? 0 : 58; fit(); }

const mkField = (style, ox, human, name) => style === 'tetris' ? new TField(ox, OY, human, name) : new Field(ox, OY, human, name);
const STYLE_KO = { puyo: '뿌요뿌요', tetris: '테트리스' };
const SOLO_KO = { marathon: '마라톤', sprint: '스프린트', ultra: '울트라', endless: '끝없이' };
const fmtClock = ms => { const s = ms / 1000, m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`; };
const AI_PUYO = [
  { delay: 420, noise: 1500, pot: 0,    miss: 0.35, greedy: 1, atk: 0.35, soft: false }, // 쉬움
  { delay: 190, noise: 500,  pot: 0.45, miss: 0.12, greedy: 0, atk: 0.6,  soft: true },  // 보통
  { delay: 95,  noise: 60,   pot: 1.1,  miss: 0,    greedy: 0, atk: 0.85, soft: true },  // 어려움
];
const AI_TETRIS = [
  { delay: 380, noise: 3,   miss: 0.25, atk: 0.35, hard: false, holdUse: false, tspin: 0,   look: false },
  { delay: 190, noise: 0.8, miss: 0.06, atk: 0.6,  hard: true,  holdUse: true,  tspin: 0.6, look: false },
  { delay: 80,  noise: 0.1, miss: 0,    atk: 0.85, hard: true,  holdUse: true,  tspin: 1,   look: true },
];
// 판 배치: 내 판 · 가운데 패널 · 상대 판들(3~4인이면 오른쪽으로 이어 붙이고 화면 전체를 줄여서 맞춤)
const slotX = i => i === 0 ? OX1 : OX2 + (i - 1) * (SW + 20);
const PLAYER_TONES = [TONES.red, TONES.blue, TONES.green, TONES.orange];
const playersOf = mode => mode === 'vs' || mode === 'local' ? Math.max(2, Math.min(4, stats.players || 2)) : mode === 'solo' ? 1 : game.netN || 2;
function build(mode) {
  const vs = mode !== 'solo', n = playersOf(mode);
  game.vs = vs; game.mode = mode; seq = []; tseq = []; game.orbs = []; game.fx.rings = []; game.fx.sparks = []; for (const i of game.inp) i.left = i.right = i.down = false;
  setSize(vs ? slotX(n - 1) + SW + 20 : OX1 + SW + PANEL_W);
  const my = game.myStyle || 'puyo';
  const f1 = mkField(my, OX1, true, vs ? stats.name : '연습');
  f1.tone = vs ? TONES.red : TONES.green;
  game.fields = [f1];
  if (!vs) return;
  const lv = game.diff == null ? 1 : game.diff;
  for (let i = 1; i < n; i++) {
    const human = mode === 'local' && i === 1, st = i === 1 ? game.oppStyle || 'puyo' : game.cpuStyles[i - 2] || 'puyo';
    const cpuNo = mode === 'local' ? i - 1 : i;
    const f = mkField(st, slotX(i), human, mode === 'online' ? '상대' : human ? '2P' : n > 2 ? `CPU ${cpuNo}` : 'CPU');
    f.tone = PLAYER_TONES[i];
    if (human) f.pi = 1;
    else if (mode === 'online') f.remote = true;
    // 뿌요 CPU — delay: 조작 간격 · noise: 판단 흔들림 · pot: 연쇄 설계 의지 · miss: 실수 확률 · greedy: 작은 연쇄 즉시 발사 · atk: 공격 배율
    // 테트리스 CPU — hard: 하드드롭 사용 · holdUse: 홀드 사용 · tspin: T스핀 의지 · look: 다음 조각까지 내다보기
    else f.ai = { ...(st === 'tetris' ? AI_TETRIS : AI_PUYO)[lv] };
    game.fields.push(f);
  }
  if (mode === 'local') { f1.name = '1P'; f1.pi = 0; }
  for (const f of game.fields) f.opp = pickTarget(f);
  if (game.rule === 'swap') game.fields.forEach(f => makeSwapPair(f, lv));      // 스왑: 같은 자리에 다른 스타일 판도 하나씩
}
// 판 위 결과 띠 글자
const endLabel = f => f.won ? '승리!' : !game.vs ? '게임 오버' : game.fields.length > 2 && f.place ? `${f.place}위` : '패배';
// 공격 대상: 2명이면 상대. 3명 이상이면 나를 마지막으로 공격한 사람 → 없으면 점수가 가장 높은 사람.
// kind를 주면 그 스타일(뿌요/테트리스) 상대를 먼저 고름(공격 변환이 섞이지 않게)
function pickTarget(f, kind) {
  let alive = game.fields.filter(o => o !== f && !o.dead);
  if (!alive.length) return f.opp || null;
  if (kind && alive.some(o => o.kind === kind)) alive = alive.filter(o => o.kind === kind);
  if (alive.length === 1) return alive[0];
  if (f.lastHitBy && alive.includes(f.lastHitBy)) return f.lastHitBy;
  return alive.reduce((a, b) => (b.score > a.score ? b : a));
}
function start(mode, seed, styles, board, rule) {
  audio(); game.net = mode === 'online'; game.oppLeft = false;
  applyBoard(board || stats.board || 'wide');
  game.rule = mode === 'solo' ? (game.soloMode === 'efever' ? 'fever' : 'tsu') : RULES[rule] ? rule : RULES[stats.rule] ? stats.rule : 'tsu';
  game.myStyle = styles ? styles.me : stats.style || 'puyo';
  const cs = stats.cpuStyle || 'puyo';
  const cpuSt = () => cs === 'random' ? (Math.random() < 0.5 ? 'puyo' : 'tetris') : cs;
  game.oppStyle = styles ? styles.op : mode === 'local' ? stats.p2Style || 'puyo' : cpuSt();
  game.cpuStyles = styles && styles.ops ? styles.ops : [cpuSt(), cpuSt()];      // 3~4인일 때 나머지 CPU
  game.startArgs = [mode, null, styles, board, rule];
  if ((mode === 'vs' || mode === 'local') && playersOf(mode) > 2) game.series = null;      // 3~4인은 한 판 승부
  else if (mode === 'vs' || mode === 'local') { if (!game.keepSeries || !game.series) game.series = { me: 0, op: 0, to: stats.firstTo || 2 }; }
  else if (mode === 'online' && playersOf(mode) > 2) game.series = null;
  else if (mode === 'online') { if (!game.series || game.series.to !== 0 || game.resetOnline) game.series = { me: 0, op: 0, to: 0 }; game.resetOnline = false; }
  else game.series = null;
  game.keepSeries = false;
  const sd = seed == null ? (Math.random() * 2 ** 32) >>> 0 : seed;
  seedSeq(sd); game.replay = null;
  build(mode); game.lastMode = mode; game.stT = 0; game.t0 = performance.now(); game.el = 0; game.recorded = false;
  game.rec = newRecording(sd);           // 리플레이 녹화(판이 끝나면 저장)
  game.seed = sd; game.bb = null; game.party = null;
  if (game.rule === 'party' && game.vs) partyInit();
  if (game.rule === 'bigbang' && game.vs) { bbInit(); game.fields.forEach(f => { if (f.remote) f.spawn(); else f.phase = 'bbwait'; }); }   // 빅뱅: 첫 라운드에 퍼즐이 깔림
  else game.fields.forEach(f => f.spawn());
  game.marginLv = 0; game.state = 'intro'; game.introT = 2000; bgmPlay('game'); game.introGo = false; overlay.classList.add('hidden'); sfx.ready();
  showGame();
  if (game.net) gsend({ t: 'hi', name: stats.name });
}
const $ = id => document.getElementById(id);
const DIFF = ['쉬움', '보통', '어려움'];
const TITLES = { main: '메인 메뉴', ai: 'AI 대전', vs: '대전', stats: '내 정보', solo: '테트리스 연습', psolo: '뿌요뿌요 연습' };
