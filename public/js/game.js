// 게임 상태 · 조작 키 · 판 배치 · 판 만들기/시작
'use strict';

/* ================= 게임 진행 ================= */
const game = { state: 'menu', vs: true, fields: [], orbs: [], overT: 0, lastMode: 'vs',
  inp: [{ left: false, right: false, down: false }, { left: false, right: false, down: false }] };
game.held = game.inp[0];
const ACTIONS = [['left', '왼쪽'], ['right', '오른쪽'], ['soft', '빠르게 내리기'], ['hard', '하드드롭'], ['cw', '시계 회전'], ['ccw', '반시계 회전'], ['180', '180도 회전(테트리스)'], ['hold', '홀드'], ['pause', '일시정지']];
const DEF_KEYS = { left: ['ArrowLeft', ''], right: ['ArrowRight', ''], soft: ['ArrowDown', ''], hard: [' ', ''], cw: ['x', 'ArrowUp'], ccw: ['z', ''], '180': ['a', ''], hold: ['c', 'Shift'], pause: ['Escape', 'p'] };
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
  if (f.kind === 'tetris' && f.phase !== 'drop' && (action === 'cw' || action === 'ccw' || action === '180' || action === 'hold')) {   // 조각이 나오기 전에 누른 회전·홀드는 모아 뒀다가 나오자마자 적용
    const b = f.ibuf || (f.ibuf = {}); if (action === 'hold') b.hold = true; else b.rot = action === 'cw' ? 1 : action === 'ccw' ? -1 : 2; return;
  }
  if (action === '180') { if (f.kind === 'tetris') f.rotate(2); return; }
  if (action === 'hard') f.hardDrop();
  else if (action === 'cw') f.rotate(1);
  else if (action === 'ccw') f.rotate(-1);
  else if (action === 'hold' && f.hold) f.hold();
}
// 게임패드: 표준 배치(십자키 이동·↑하드드롭 / A 시계 · B 반시계 · X·LB 홀드 / Start 일시정지)
const PAD_MAP = { 5: '180', 14: 'left', 15: 'right', 13: 'soft', 12: 'hard', 0: 'cw', 1: 'ccw', 2: 'hold', 4: 'hold', 3: 'hard', 9: 'pause' };
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
// 세로 폰(2~4인 · 통상/피버/퓨전): 내 판을 크게, 상대 판들은 오른쪽 칸(홀드 아래)에 작게(compact)
// 상대 1명은 한 칸 크게, 2~3명은 두 줄 두 칸에 나눠서
const MINI_Y = OY + 364, CTOP = 92;   // CTOP: 세로 폰 위쪽 초상 띠 높이
const isMini = f => !!game.compact && f !== game.fields[0];
function miniBox(f) {
  const ops = game.fields.length - 1, j = Math.max(0, game.fields.indexOf(f) - 1), H = CANVAS_H - MINI_Y - 4;
  if (ops <= 1) { const k = Math.min(140 / SW, H / CANVAS_H); return { k, x: PX - SW * k / 2, y: MINI_Y }; }
  const rows = Math.ceil(ops / 2), k = Math.min(68 / SW, (H / rows - 4) / CANVAS_H), w = SW * k;
  const inRow = Math.min(2, ops - Math.floor(j / 2) * 2), col = j % 2;
  return { k, x: PX - (inRow * w + (inRow - 1) * 6) / 2 + col * (w + 6), y: MINI_Y + Math.floor(j / 2) * (CANVAS_H * k + 4) };
}
const slotOx = f => f.sx != null ? f.sx : f.ox;   // 판 칸 왼쪽(뿌요는 판이 칸보다 좁으면 가운데 정렬이라 칸 기준으로)
function miniPt(f, x, y) { const b = miniBox(f); return [b.x + (x - slotOx(f)) * b.k, b.y + y * b.k]; }
function miniBoard(f) { const b = miniBox(f); return { x: b.x + (f.ox - slotOx(f)) * b.k, y: b.y + OY * b.k, w: f.fw * b.k, h: FH * b.k, k: b.k }; }   // 작은 판의 실제 판 영역
function inMini(c, f, fn) {
  if (!isMini(f)) { fn(); return; }
  const b = miniBox(f); c.save(); c.translate(b.x, b.y); c.scale(b.k, b.k); c.translate(-slotOx(f), 0); fn(); c.restore();
}
function fit() {
  // 화면 폭: 모바일에서 화면을 돌린 직후엔 이전(넓은) 캔버스 때문에 innerWidth가 넓게 남아서 문서 폭(clientWidth)과 비교
  const pad = document.getElementById('pad'), vw = Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth), vh = window.innerHeight, portrait = vh > vw;
  // 세로 화면(폰 · 태블릿): 내 판을 크게, 상대 판들은 오른쪽에 작게
  // (로컬 대전은 두 사람 판을 같은 크기로 두려고 제외)
  game.compact = game.vs && game.mode !== 'local' && game.fields.length >= 2 && ['tsu', 'fever', 'fusion', 'bigbang', 'party', 'swap'].includes(game.rule) && vw <= 1100 && portrait;
  if (game.vs) VIEW_Y0 = game.compact ? -CTOP : (game.baseY0 || 0);   // 세로 화면: 위쪽에 초상 띠
  game.narrow = vw <= 1100 && portrait;
  LW = game.compact ? OX1 + SW + PANEL_W : (game.fullLW || LW) - (game.narrow ? (game.side || 0) + (game.sideR || 0) : 0);
  const pcs = getComputedStyle(pad), padSide = pcs.display !== 'none' && pcs.position === 'fixed';   // 가로 폰: 버튼이 양옆에 떠 있음
  const pad2 = document.getElementById('pad2'), p2H = pad2 && getComputedStyle(pad2).display !== 'none' ? pad2.offsetHeight + 12 : 0;   // 로컬 대전 2P 버튼
  const padH = (pcs.display === 'none' || padSide ? 0 : pad.offsetHeight + 16) + p2H;
  const sideW = padSide ? 2 * ((pad.querySelector('button') || {}).offsetWidth || 0) * 2 + 60 : 0;   // 양옆 버튼 두 칸씩 + 여백
  const bands = document.querySelector('.band-top').offsetHeight + document.querySelector('.band-bot').offsetHeight + 24;
  const s = Math.max(0.2, Math.min(1.6, (vw - 16 - sideW) / LW, (vh - bands - padH) / viewH()));
  const rs = game.lowFx ? Math.max(1, s) : DPR * Math.max(1, s);   // 가볍게 모드: 내부 해상도 1배(느린 폰)
  if (cv.width !== Math.round(LW * rs) || cv.height !== Math.round(viewH() * rs)) { cv.width = Math.round(LW * rs); cv.height = Math.round(viewH() * rs); }
  game.rs = rs;
  cv.style.width = (LW * s) + 'px'; cv.style.height = (viewH() * s) + 'px';
}
// 초상 카드 자리: 2인은 양쪽 판 바깥(이름표 옆) · 연습은 판 왼쪽 · 3~4인은 판 위(이름표 대신).
// 그리기 좌표는 그대로 두고 화면만 밀어서 그림(왼쪽 side, 오른쪽 sideR, 위 top)
const SIDE_W = 196, TOP_H = 112, sideX = () => game.compact || game.narrow ? 0 : (game.side || 0);   // 세로 폰은 옆 카드 없이(판이 작아지지 않게)
const cardTop = () => !game.compact && game.top > 0;
const tagOff = f => !!game.compact || cardTop();     // 이름표를 초상 카드가 대신하는 판(세로 폰 · 3~4인)
function setSize(W, side = 0, sideR = side, top = 0) {
  game.side = side; game.sideR = sideR; game.top = top; LW = game.fullLW = W + side + sideR;
  game.baseY0 = game.vs ? -top : 58; VIEW_Y0 = game.baseY0; fit();
}
const sizeFor = (vs, n) => vs ? [slotX(n - 1) + SW + 20, n === 2 ? SIDE_W : 0, n === 2 ? SIDE_W : 0, n > 2 ? TOP_H : 0] : [OX1 + SW + PANEL_W, SIDE_W, 0, 0];

const mkField = (style, ox, human, name) => game.rule === 'fusion' ? new FField(ox, OY, human, name) : style === 'tetris' ? new TField(ox, OY, human, name) : new Field(ox, OY, human, name);
const STYLE_KO = { puyo: '뿌요뿌요', tetris: '테트리스', fusion: '퓨전' };
const SOLO_KO = { marathon: '마라톤', sprint: '스프린트', ultra: '울트라', endless: '끝없이' };
const fmtClock = ms => { const s = ms / 1000, m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`; };
const AI_PUYO = [
  { delay: 420, noise: 1500, pot: 0,    miss: 0.35, greedy: 1, soft: false }, // 쉬움
  { delay: 190, noise: 500,  pot: 0.45, miss: 0.12, greedy: 0, soft: true },  // 보통
  { delay: 95,  noise: 60,   pot: 1.1,  miss: 0,    greedy: 0, soft: true },  // 어려움
];
const AI_TETRIS = [
  { delay: 380, noise: 3,   miss: 0.25, atk: 0.35, hard: false, holdUse: false, tspin: 0,   look: false },
  { delay: 190, noise: 0.8, miss: 0.06, atk: 0.6,  hard: true,  holdUse: true,  tspin: 0.6, look: false },
  { delay: 80,  noise: 0.1, miss: 0,    atk: 0.85, hard: true,  holdUse: true,  tspin: 1,   look: true },
];
// 판 배치: 내 판 · 가운데 패널 · 상대 판들(3~4인이면 오른쪽으로 이어 붙이고 화면 전체를 줄여서 맞춤)
const slotX = i => i === 0 ? OX1 : OX2 + (i - 1) * (SW + 20);
const PLAYER_TONES = [TONES.red, TONES.blue, TONES.green, TONES.orange];
const playersOf = mode => mode === 'vs' && game.adv ? game.adv.st.players || 2 : mode === 'vs' || mode === 'local' ? Math.max(2, Math.min(4, stats.players || 2)) : mode === 'solo' ? 1 : game.netN || 2;
const AI_FUSION = [                     // 퓨전 CPU — noise: 평가 흔들림 · miss: 실수 확률 · atk: 공격 배율
  { delay: 420, noise: 6,   miss: 0.2,  atk: 0.4 },
  { delay: 220, noise: 2,   miss: 0.06, atk: 0.6 },
  { delay: 110, noise: 0.5, miss: 0,    atk: 0.85 },
];
const aiPreset = (kind, lv) => ({ ...(kind === 'fusion' ? AI_FUSION : kind === 'tetris' ? AI_TETRIS : AI_PUYO)[lv] });
// 랭크전 AI 상대: 세기 0~1(쉬움~어려움)을 두 단계 사이에서 이어 붙이고, 1을 넘으면 더 빠르게
function botAi(kind, lv) {
  const P = kind === 'fusion' ? AI_FUSION : kind === 'tetris' ? AI_TETRIS : AI_PUYO, x = Math.max(0, Math.min(1, lv)) * 2, i = Math.min(1, Math.floor(x)), k = x - i;
  const a = {};
  for (const key in P[i]) { const u = P[i][key], v = P[i + 1][key]; a[key] = typeof u === 'number' ? u + (v - u) * k : k < 0.5 ? u : v; }
  if (lv > 1) a.delay = Math.round(a.delay * (1 - (lv - 1) * 1.5));
  return a;
}
function build(mode) {
  const vs = mode !== 'solo', n = playersOf(mode);
  game.vs = vs; game.mode = mode; seq = []; tseq = []; game.orbs = []; game.fx.rings = []; game.fx.sparks = []; for (const i of game.inp) i.left = i.right = i.down = false;
  setSize(...sizeFor(vs, n));
  const my = game.myStyle || 'puyo';
  const f1 = mkField(my, OX1, true, vs ? stats.name : '연습');
  f1.tone = vs ? TONES.red : TONES.green; f1.char = stats.char || 'lumi';
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
    // 뿌요 CPU — delay: 조작 간격 · noise: 판단 흔들림 · pot: 연쇄 설계 의지 · miss: 실수 확률 · greedy: 작은 연쇄 즉시 발사 (공격량은 사람과 같음)
    // 테트리스 CPU — hard: 하드드롭 사용 · holdUse: 홀드 사용 · tspin: T스핀 의지 · look: 다음 조각까지 내다보기
    else f.ai = aiPreset(f.kind, lv);
    game.fields.push(f);
  }
  if (mode === 'local') { f1.name = '1P'; f1.pi = 0; }
  // 캐릭터: 나는 고른 캐릭터, 나머지는 겹치지 않게 무작위(어드벤처는 정해진 상대). CPU는 캐릭터 성격대로
  const pool = CHARS.map(c => c.id).filter(id => id !== f1.char).sort(() => Math.random() - 0.5);
  const prev = game.sameOpp && game.lastChars && game.lastChars.length === game.fields.length ? game.lastChars : null;
  game.fields.forEach((f, i) => { if (i) f.char = (game.cpuChars && game.cpuChars[i - 1]) || (prev && prev[i] !== f1.char && prev[i]) || pool[(i - 1) % pool.length]; if (f.ai && !f.human && !f.remote) f.ai = charAi(f.ai, charOf(f.char), f.kind); });
  game.fields.forEach((f, i) => { if (i && !f.human && !f.remote && mode !== 'online') f.name = `AI ${charOf(f.char).name}`; });   // AI 상대 이름: 'AI 핀'처럼 캐릭터 이름(랭크전 AI와 같게)
  game.lastChars = game.fields.map(f => f.char);
  if (mode === 'online' && game.botOpp) { const b = game.fields[1]; b.char = game.botOpp.char; b.name = game.botOpp.name; b.isBot = true; }   // 랭크전 AI 상대: 판은 서버가 돌리고 이름·캐릭터만 여기서
  for (const f of game.fields) f.opp = pickTarget(f);
  if (game.rule === 'swap') game.fields.forEach(f => makeSwapPair(f, lv));      // 스왑: 같은 자리에 다른 스타일 판도 하나씩
}
// 판 위 결과 띠 글자
const endLabel = f => f.won ? '승리!' : !game.vs ? '게임 오버' : game.fields.length > 2 && f.place ? `${f.place}위` : '패배';
// 공격 대상: 2명이면 상대. 3명 이상이면 직접 고른 사람(카드·작은 판을 눌러서) → 나를 마지막으로 공격한 사람 → 없으면 점수가 가장 높은 사람.
// kind를 주면 그 스타일(뿌요/테트리스) 상대를 먼저 고름(공격 변환이 섞이지 않게)
function pickTarget(f, kind) {
  let alive = game.fields.filter(o => o !== f && !o.dead);
  if (!alive.length) return f.opp || null;
  if (kind && alive.some(o => o.kind === kind)) alive = alive.filter(o => o.kind === kind);
  if (alive.length === 1) return alive[0];
  if (f.pick && alive.includes(f.pick)) return f.pick;
  if (f.lastHitBy && alive.includes(f.lastHitBy)) return f.lastHitBy;
  return alive.reduce((a, b) => (b.score > a.score ? b : a));
}
function start(mode, seed, styles, board, rule) {
  if (!game.advGo && !(game.keepSeries && game.adv)) { game.adv = null; game.cpuChars = null; }   // 어드벤처가 아니면 정리
  if (!(mode === 'solo' && game.soloMode === 'puzzle')) game.puzzle = null;                        // 튜토리얼·퍼즐이 아니면 정리
  game.advGo = false;
  audio(); game.net = mode === 'online'; game.oppLeft = false;
  if (mode !== 'online') game.ranked = false;      // 온라인이 아닌 게임. 기다리던 매칭·방은 그대로 두고, 상대가 잡히면 이 게임을 접고 대전으로('start' 처리, net.js)
  applyBoard(board || stats.board || 'wide');
  game.rule = mode === 'solo' ? (game.soloMode === 'efever' ? 'fever' : 'tsu') : RULES[rule] ? rule : RULES[stats.rule] ? stats.rule : 'tsu';
  game.myStyle = styles ? styles.me : stats.style || 'puyo';
  const cs = stats.cpuStyle || 'puyo';
  const cpuSt = () => cs === 'random' ? (Math.random() < 0.5 ? 'puyo' : 'tetris') : cs;
  game.oppStyle = styles ? styles.op : mode === 'local' ? stats.p2Style || 'puyo' : cpuSt();
  game.cpuStyles = styles && styles.ops ? styles.ops : [cpuSt(), cpuSt()];      // 3~4인일 때 나머지 CPU
  game.startArgs = [mode, null, styles, board, rule];
  if ((mode === 'vs' || mode === 'local') && playersOf(mode) > 2) game.series = null;      // 3~4인은 한 판 승부
  else if (mode === 'vs' || mode === 'local') { if (!game.keepSeries || !game.series) game.series = { me: 0, op: 0, to: game.adv ? game.adv.st.ft || 1 : stats.firstTo || 2 }; }
  else if (mode === 'online' && game.ranked) { if (!game.series || game.series.to !== 2) game.series = { me: 0, op: 0, to: 2 }; }   // 랭크전: 2선승
  else if (mode === 'online' && playersOf(mode) > 2) game.series = null;
  else if (mode === 'online') { if (!game.series || game.series.to !== 0 || game.resetOnline) game.series = { me: 0, op: 0, to: 0 }; game.resetOnline = false; }
  else game.series = null;
  game.sameOpp = game.keepSeries && !!game.series && !game.adv;   // 시리즈 다음 판: 같은 상대(캐릭터·이름 그대로)
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
  if (game.net) gsend({ t: 'hi', name: stats.name, char: stats.char || 'lumi' });
}
const $ = id => document.getElementById(id);
const DIFF = ['쉬움', '보통', '어려움'];
const TITLES = { main: '메인 메뉴', ai: 'AI 대전', vs: '대전', stats: '내 정보', solo: '테트리스 연습', psolo: '뿌요뿌요 연습', chars: '캐릭터', adv: '어드벤처' };
