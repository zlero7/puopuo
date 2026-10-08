// 뿌요뿌요 판(Field) · AI 시뮬레이션 · 뿌요 그리기
'use strict';

/* ================= 정수 격자 시뮬레이션(AI용) ================= */
function findGroupsInt(g) {
  const seen = Array.from({ length: ROWS }, () => Array(COLS).fill(false)), out = [];
  for (let r = 1; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const v = g[r][c]; if (!v || v === OJ || seen[r][c]) continue;
    const st = [[r, c]], cells = []; seen[r][c] = true;
    while (st.length) {
      const [y, x] = st.pop(); cells.push([y, x]);
      for (let d = 0; d < 4; d++) {
        const ny = y + DY[d], nx = x + DX[d];
        if (ny >= 1 && ny < ROWS && nx >= 0 && nx < COLS && !seen[ny][nx] && g[ny][nx] === v) { seen[ny][nx] = true; st.push([ny, nx]); }
      }
    }
    if (cells.length >= 4) out.push({ v, cells });
  }
  return out;
}
function collapse(g) {
  for (let c = 0; c < COLS; c++) {
    let w = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) if (g[r][c]) { const v = g[r][c]; g[r][c] = 0; g[w][c] = v; w--; }
  }
}
function simResolve(g) {
  let chain = 0, score = 0;
  for (;;) {
    const gs = findGroupsInt(g); if (!gs.length) break;
    chain++;
    let total = 0, bonus = CHAIN_POWER[Math.min(chain, CHAIN_POWER.length - 1)]; const cols = new Set(), cells = [];
    for (const gr of gs) { total += gr.cells.length; bonus += groupBonus(gr.cells.length); cols.add(gr.v); cells.push(...gr.cells); }
    bonus += COLOR_BONUS[Math.min(cols.size, 5)];
    score += 10 * total * clamp(bonus, 1, 999);
    for (const [y, x] of cells) g[y][x] = 0;
    for (const [y, x] of cells) for (let d = 0; d < 4; d++) {
      const ny = y + DY[d], nx = x + DX[d];
      if (ny >= 1 && ny < ROWS && nx >= 0 && nx < COLS && g[ny][nx] === OJ) g[ny][nx] = 0;
    }
    collapse(g);
  }
  return { chain, score };
}
function heightsOf(g) {
  const h = [];
  for (let c = 0; c < COLS; c++) { let r = 0; while (r < ROWS && !g[r][c]) r++; h.push(ROWS - r); }
  return h;
}
function potential(g) {
  const h = heightsOf(g); let best = 0;
  for (let c = 0; c < COLS; c++) {
    const row = ROWS - h[c] - 1; if (row < 1) continue;
    for (let col = 1; col <= 4; col++) {
      const s = g.map(r => r.slice()); s[row][c] = col;
      best = Math.max(best, simResolve(s).chain);
    }
  }
  return best;
}
function connectScore(g) {
  let s = 0;
  for (let r = 1; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const v = g[r][c]; if (!v || v === OJ) continue;
    if (c + 1 < COLS && g[r][c + 1] === v) s += 5;
    if (r + 1 < ROWS && g[r + 1][c] === v) s += 5;
  }
  return s;
}

/* ================= 그리기: 뿌요 ================= */
// 색마다 다른 캐릭터:
//  빨강  콩 모양(가로로 살짝 넓음)
//  초록  완전한 원
//  파랑  아래쪽 유령 꼬리
//  노랑  위쪽이 뾰족한 눈물방울
//  보라  한쪽으로 기운 타원
//  방해  회색, 연결 없음
//  얼굴(눈)은 모든 색 공통
// 꼬리·뾰족한 부분은 그 방향에 같은 색이 붙어 있지 않을 때만 보인다(원작 스프라이트 방식).
const UP = 1, RT = 2, DN = 4, LT = 8;
// 연결(목) 모양 — 색마다 다르게:
//  a/b = 목의 양쪽 가장자리(가로 연결이면 아래/위, 세로 연결이면 왼/오) 각각의 {th: 몸에서 떨어지는 각도, k: 잘록한 깊이}
//  sh = 목을 비스듬히 기울이는 정도, q = 2×2 가운데 메움 크기(0이면 구멍을 남김)
//  빨강: 콩처럼 뭉개진 굵은 띠 — 거의 안 잘록하고 납작하게 합쳐짐
//  초록: 둥근 물방울끼리 붙는 기본형
//  파랑: 한쪽은 깊게, 한쪽은 얕게 패여 꼬리처럼 흘러 이어짐
//  노랑: 엿가락처럼 가늘게 쭉 늘어난 연결, 2×2 가운데는 구멍
//  보라: 기울어진 타원처럼 비스듬하게 꺾여 이어짐
const SHAPE = [null,
  { sx: 1.07, sy: 0.93, lean: 0,     q: 1.08, neck: { a: { th: 1.26, k: 0.1 },  b: { th: 1.26, k: 0.1 },  sh: 0 } },
  { sx: 1,    sy: 1,    lean: 0,     q: 0.95, neck: { a: { th: 0.98, k: 0.3 },  b: { th: 0.98, k: 0.3 },  sh: 0 } },
  { sx: 1,    sy: 1,    lean: 0,     q: 1.0,  neck: { a: { th: 1.2,  k: 0.14 }, b: { th: 0.8,  k: 0.46 }, sh: 0.1 } },
  { sx: 1,    sy: 1,    lean: 0,     q: 0,    neck: { a: { th: 0.7,  k: 0.5 },  b: { th: 0.7,  k: 0.5 },  sh: 0 } },
  { sx: 0.94, sy: 1.04, lean: -0.24, q: 0.95, neck: { a: { th: 1.0,  k: 0.3 },  b: { th: 1.0,  k: 0.3 },  sh: 0.26 } },
  { sx: 1,    sy: 1,    lean: 0,     q: 0.95, neck: { a: { th: 1.0,  k: 0.3 },  b: { th: 1.0,  k: 0.3 },  sh: 0 } },
];
const LAYERS = [
  { d: 2.6, k: 'd', ox: 0, oy: 0 },        // 진한 외곽선
  { d: 0, k: 's', ox: 0, oy: 0 },          // 그림자 톤
  { d: -3.6, k: 'm', ox: -1, oy: -1.6 },   // 밝은 몸통(좌상단 조명)
];
const bounceF = t => t > 320 ? 0 : Math.exp(-t / 80) * Math.cos(t * Math.PI / 120);
const tone3 = (it, k) => (it.flash ? FLASH : PAL)[it.col][k];

function prep(it) {
  const S = SHAPE[it.col], m = it.mask || 0;
  it.ex = it.rx * S.sx; it.ey = it.ry * S.sy;
  it.lean = m ? 0 : S.lean;               // 붙어 있으면 똑바로 선다
}
function local(c, it, d, ox, oy) {
  const f = Math.max(0.05, (R + d) / R);
  c.translate(it.cx + ox, it.cy + oy); c.rotate(it.lean); c.scale(it.ex / R * f, it.ey / R * f);
}
function bodyPath(c) { c.moveTo(R, 0); c.arc(0, 0, R, 0, Math.PI * 2); }
function featurePath(c, it) {
  const m = it.mask || 0;
  if (it.col === 4 && !(m & UP)) {          // 노랑: 위로 살짝 휘어 올라간 꼭지
    c.moveTo(-0.6 * R, -0.78 * R);
    c.quadraticCurveTo(-0.28 * R, -1.02 * R, 0.14 * R, -1.2 * R);
    c.quadraticCurveTo(0.3 * R, -0.95 * R, 0.62 * R, -0.76 * R);
    c.closePath(); return true;
  }
  if (it.col === 3 && !(m & DN)) {          // 파랑: 오른쪽 아래로 말린 유령 꼬리
    c.moveTo(0.05 * R, 0.97 * R);
    c.quadraticCurveTo(0.6 * R, 1.04 * R, 1.0 * R, 0.9 * R);
    c.quadraticCurveTo(0.8 * R, 0.74 * R, 0.66 * R, 0.74 * R);
    c.closePath(); return true;
  }
  return false;
}
function neckPath(c, A, B, d, ox, oy) {
  const N = SHAPE[A.col].neck;
  const ax = A.cx + ox, ay = A.cy + oy, bx = B.cx + ox, by = B.cy + oy;
  const D = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / D, uy = (by - ay) / D, nx = -uy, ny = ux;
  // 타원(콩·기운 모양)에서도 접선이 이어지도록 타원 매개변수로 끝점과 접선을 구함
  const hz = Math.abs(ux) > Math.abs(uy);
  const ends = I => ({ u: Math.max(1, (hz ? I.ex : I.ey) + d), n: Math.max(1, (hz ? I.ey : I.ex) + d) });
  const ea = ends(A), eb = ends(B), sh = N.sh * R, pts = [];
  for (const s of [1, -1]) {
    const P = s === 1 ? N.a : N.b, CT = Math.cos(P.th), ST = Math.sin(P.th);
    const pa = [ax + ea.u * CT * ux + s * ea.n * ST * nx, ay + ea.u * CT * uy + s * ea.n * ST * ny];
    const pb = [bx - eb.u * CT * ux + s * eb.n * ST * nx, by - eb.u * CT * uy + s * eb.n * ST * ny];
    const ta = [ea.u * ST * ux - s * ea.n * CT * nx, ea.u * ST * uy - s * ea.n * CT * ny];
    const tb = [-eb.u * ST * ux - s * eb.n * CT * nx, -eb.u * ST * uy - s * eb.n * CT * ny];
    const la = Math.hypot(ta[0], ta[1]) || 1, lb = Math.hypot(tb[0], tb[1]) || 1;
    const ka = ea.n * P.k, kb = eb.n * P.k;
    pts.push({ pa, pb,
      ca: [pa[0] + ka * ta[0] / la - sh * nx, pa[1] + ka * ta[1] / la - sh * ny],
      cb: [pb[0] + kb * tb[0] / lb + sh * nx, pb[1] + kb * tb[1] / lb + sh * ny] });
  }
  const [P, Q] = pts;
  c.moveTo(P.pa[0], P.pa[1]);
  c.bezierCurveTo(P.ca[0], P.ca[1], P.cb[0], P.cb[1], P.pb[0], P.pb[1]);
  c.lineTo(Q.pb[0], Q.pb[1]);
  c.bezierCurveTo(Q.cb[0], Q.cb[1], Q.ca[0], Q.ca[1], Q.pa[0], Q.pa[1]);
  c.closePath();
}

function drawPuyos(c, items, links, quads = []) {
  for (const it of items) prep(it);
  for (const L of LAYERS) {
    for (const it of items) {
      c.fillStyle = tone3(it, L.k);
      c.save(); local(c, it, L.d, L.ox, L.oy);
      c.beginPath(); bodyPath(c); c.fill();
      c.beginPath(); if (featurePath(c, it)) c.fill();
      c.restore();
    }
    for (const [A, B] of links) { c.fillStyle = tone3(A, L.k); c.beginPath(); neckPath(c, A, B, L.d, L.ox, L.oy); c.fill(); }
    for (const Q of quads) {             // 2×2 덩어리 가운데 메움(색마다 다름)
      if (!SHAPE[Q[0].col].q) continue;
      const x = Q.reduce((a, it) => a + it.cx, 0) / 4 + L.ox, y = Q.reduce((a, it) => a + it.cy, 0) / 4 + L.oy;
      c.fillStyle = tone3(Q[0], L.k); c.beginPath(); c.arc(x, y, Math.max(1, R * SHAPE[Q[0].col].q + L.d), 0, Math.PI * 2); c.fill();
    }
  }
  for (const it of items) decorate(c, it);
}

function decorate(c, it) {
  c.save(); local(c, it, 0, 0, 0);
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.beginPath(); c.ellipse(-R * 0.56, -R * 0.6, R * 0.15, R * 0.085, -0.75, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.beginPath(); c.arc(-R * 0.72, -R * 0.36, R * 0.05, 0, Math.PI * 2); c.fill();
  const ex = R * 0.4, ey = -R * 0.04, dark = '#2a1840';
  if (it.pop) {
    c.strokeStyle = dark; c.lineWidth = 2.6; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * (ex + R * 0.16), ey - R * 0.2); c.lineTo(s * (ex - R * 0.16), ey); c.lineTo(s * (ex + R * 0.16), ey + R * 0.2); c.stroke(); }
  } else if (it.col === OJ) {
    c.fillStyle = '#4b4670';
    for (const sd of [-1, 1]) { c.beginPath(); c.ellipse(sd * R * 0.34, ey, R * 0.1, R * 0.15, 0, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = '#4b4670'; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-R * 0.16, R * 0.36); c.lineTo(R * 0.16, R * 0.36); c.stroke();
  } else {
    for (const sd of [-1, 1]) {
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(sd * ex, ey, R * 0.27, R * 0.35, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#22123a'; c.beginPath(); c.ellipse(sd * ex - sd * R * 0.03, ey + R * 0.08, R * 0.15, R * 0.22, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(sd * ex - sd * R * 0.07, ey + R * 0.01, R * 0.05, 0, Math.PI * 2); c.fill();
    }
  }
  c.restore();
}

// 큰 단위 방해 아이콘: 4 별(180) · 5 달(360) · 6 왕관(720) · 7 혜성(1440)
function trayIcon(c, k, x, y, r) {
  c.save(); c.translate(x, y); c.lineJoin = 'round';
  const col = { 4: ['#ffd93d', '#a8740a'], 5: ['#fff0a8', '#b9932a'], 6: ['#ffcc33', '#9a5b00'], 7: ['#9fe8ff', '#2a74b0'] }[k];
  c.beginPath();
  if (k === 4 || k === 7) {
    if (k === 7) { c.save(); c.fillStyle = 'rgba(159,232,255,0.5)'; c.beginPath(); c.moveTo(-r * 0.3, -r * 0.3); c.lineTo(-r * 1.6, -r * 0.9); c.lineTo(-r * 0.6, r * 0.2); c.fill(); c.restore(); c.beginPath(); }
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * 0.45 : r; c.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); }
    c.closePath();
  } else if (k === 5) { c.arc(0, 0, r, Math.PI * 0.15, Math.PI * 1.85); c.arc(r * 0.35, 0, r * 0.75, Math.PI * 1.75, Math.PI * 0.25, true); c.closePath(); }
  else { c.moveTo(-r, r * 0.6); c.lineTo(-r, -r * 0.4); c.lineTo(-r * 0.5, r * 0.05); c.lineTo(0, -r * 0.7); c.lineTo(r * 0.5, r * 0.05); c.lineTo(r, -r * 0.4); c.lineTo(r, r * 0.6); c.closePath(); }
  c.lineWidth = 4; c.strokeStyle = col[1]; c.stroke(); c.fillStyle = col[0]; c.fill();
  c.restore();
}

/* ================= 필드 ================= */
class Field {
  constructor(ox, oy, human, name) { this.kind = 'puyo'; this.sx = ox; this.ox = ox + (SW - FW) / 2; this.oy = oy; this.human = human; this.name = name; this.opp = null; this.ai = { delay: 170, noise: 400, pot: 0.6, miss: 0.12, greedy: 0, atk: 0.6, soft: true }; this.reset(); }

  get fw() { return FW; }

  reset() {
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.fv = { gauge: 0, on: false, t: 0, lv: 0, stash: null, hit: false }; this.forcePair = null;   // 피버(fever.js)
    this.idx = 0; this.score = 0; this.chain = 0; this.maxChain = 0; this.pending = 0; this.carry = 0; this.atkCarry = 0; this.trayBump = 0; this.hit = 0;
    this.chains2 = 0; this.allClears = 0; this.sent = 0; this.doubles = 0; this.lineCarry = 0; this.lineOut = 0; this.lineAtk = 0;
    this.acBonus = false; this.blockedAt = 0; this.dangerOn = false; this.holdP = null; this.canHold = true;
    this.pops = 0; this.level = 1; this.phase = 'none'; this.piece = null; this.acc = 0; this.settleT = 0;
    this.particles = []; this.texts = []; this.trails = []; this.shake = 0; this.flash = 0;
    this.dead = false; this.won = false; this.noGarb = false; this.soft = false;
    this.queue = []; this.net = null; this.lastLockN = 0;
    this.lastDir = 0; this.das = 0; this.rep = 0; this.aiT = 0; this.tgt = null;
    this.popList = []; this.popT = 0;
  }

  mk(c, r, col, y) { return { c, r, col, y, vy: 0, sq: -1, amp: 0 }; }
  valid(x, y) { return x >= 0 && x < COLS && y >= 0 && y < ROWS && !this.grid[y][x]; }
  fits(p) { return this.valid(p.x, p.y) && this.valid(p.x + DX[p.o], p.y + DY[p.o]); }
  fallIv() { return (game.vs ? 480 : Math.max(120, 700 - (this.level - 1) * 60)) / (effOn(this, 'speed') ? 3 : 1); }

  spawn() {
    if (this.remote) { this.piece = null; this.phase = 'wait'; this.chain = 0; this.pump(); return; }
    if (swapDue(this)) { swapField(this); return; }      // 스왑(swap.js)
    if (game.rule === 'fever' && !this.fv.on && (this.fv.gauge >= FEVER_GAUGE || (game.soloMode === 'efever' && !game.vs && !this.fv.lv))) { this.startFever(); return; }
    if (this.grid[1][SP]) { if (this.fv.on) { this.endFever(); return; } if (this.bbOn()) { this.bbFinish(0); return; } if (game.rule === 'party') { partyReset(this); return; } this.die(); return; }
    const [a, b] = this.forcePair || pairAt(this.idx++); this.forcePair = null;
    this.piece = { x: SP, y: 1, o: 0, a, b, rx: SP, ang: 0 };
    const item = nextItem(this); if (item) this.piece[rnd(2) ? 'ia' : 'ib'] = item;     // 파티: ★아이템
    this.acc = 0; this.phase = 'drop'; this.noGarb = false; this.chain = 0; this.soft = false; this.canHold = true;
    if (!this.fits(this.piece)) { if (game.rule === 'party') { partyReset(this); return; } this.die(); return; }
    if (!this.human) this.planAI();
  }
  // 홀드: 지금 쌍을 맡겨 두고 맡긴 쌍(없으면 다음 쌍)을 꺼냄. 한 번 놓을 때까지 한 번만
  hold() {
    if (this.phase !== 'drop' || !this.piece || !this.canHold) return;
    const keep = [this.piece.a, this.piece.b], [a, b] = this.holdP || pairAt(this.idx++);
    this.holdP = keep; this.canHold = false;
    this.piece = { x: SP, y: 1, o: 0, a, b, rx: SP, ang: 0 }; this.acc = 0;
    if (!this.fits(this.piece)) { if (game.rule === 'party') { partyReset(this); return; } this.die(); return; }
    if (this.human) sfx.hold();
  }
  die() {
    if (this.dead) return;
    // 원격 판(온라인 상대·리플레이)은 보던 연쇄·밀린 이벤트를 끝까지 보여준 뒤 탈락
    if (this.remote && (this.phase === 'pop' || this.phase === 'settle' || this.queue.length)) { this.dieLater = true; return; }
    this.dead = true; this.phase = 'dead'; this.piece = null;
    if (!this.remote) emit(this, { t: 'dead' });
  }

  /* ---------- 온라인: 상대 화면 재현 ----------
     상대 클라이언트가 보낸 '고정(lock)'·'방해뿌요 낙하(garb)' 이벤트를 순서대로 같은 규칙으로 재생한다.
     연쇄·낙하는 결정적이라 애니메이션까지 그대로 나오고, 이벤트마다 보낸 격자 스냅샷으로 어긋나면 바로잡는다. */
  encode() { return this.grid.map(r => r.map(p => p ? p.c : 0).join('')).join(''); }
  decode(g, fall = false) {               // fall: 위에서 떨어지며 들어오는 연출(피버 판 바꾸기)
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const v = +g[r * COLS + c]; this.grid[r][c] = v ? this.mk(v, r, c, fall ? r - ROWS - 1 - Math.random() * 1.5 : r) : null;
    }
  }
  pump() {
    while (this.phase === 'wait' && this.queue.length) {
      const ev = this.queue.shift();
      if (ev.g && this.encode() !== ev.g) this.decode(ev.g);
      if (ev.t === 'lock') {
        const sp = this.piece && this.piece.n === ev.n ? this.piece : null;
        const off = sp ? Math.max(0, ev.y - (sp.y + (sp.prog || 0))) : 0;
        this.lastLockN = ev.n;
        this.piece = { x: ev.x, y: ev.y, o: ev.o, a: ev.a, b: ev.b, ia: ev.ia, ib: ev.ib, rx: sp ? sp.rx : ev.x, ang: sp ? sp.ang : ev.o * Math.PI / 2 };
        this.lock(off, !!ev.h);
      } else if (ev.t === 'garb') this.placeGarbage(ev.c);
      else if (ev.t === 'sw') { swapField(this); return; }
      else if (ev.t === 'gs') { this.decode(ev.g); this.piece = null; this.phase = 'settle'; this.settleT = 0; }
      else if (ev.t === 'fv') { this.fv.on = !!ev.on; this.decode(ev.g, true); this.piece = null; this.phase = 'settle'; this.settleT = 0; }
    }
    if (this.phase === 'wait' && this.dieLater) { this.dieLater = false; this.die(); return; }
    if (this.phase === 'wait') this.applyNet();
  }
  applyNet() {
    const s = this.net;
    if (!s || s.n <= this.lastLockN) { this.piece = null; return; }
    if (!this.piece || this.piece.n !== s.n) this.piece = { x: s.x, y: s.y, o: s.o, a: s.a, b: s.b, rx: s.x, ang: s.o * Math.PI / 2, prog: s.p, n: s.n };
    else Object.assign(this.piece, { x: s.x, y: s.y, o: s.o, prog: s.p });
  }

  moveX(d) {
    if (this.phase !== 'drop') return;
    const p = { ...this.piece, x: this.piece.x + d };
    if (this.fits(p)) { this.piece.x = p.x; if (this.human) sfx.move(); }
  }
  rotate(dir) {
    if (this.phase !== 'drop') return;
    const q = this.piece, o = (q.o + dir + 4) % 4;
    let p = { ...q, o };
    if (!this.fits(p)) {
      p = { ...q, o, x: q.x - DX[o], y: q.y - DY[o] };
      if (!this.fits(p)) {
        const now = performance.now();
        if (this.human && now - this.blockedAt > 350) { this.blockedAt = now; sfx.move(); return; }
        this.blockedAt = 0;
        p = { ...q, o: (q.o + 2) % 4 }; if (!this.fits(p)) return;
      }
    }
    q.x = p.x; q.y = p.y; q.o = p.o; if (this.human) sfx.rot();
  }

  update(dt, active) {
    this.updateFx(dt);
    if (!active || this.dead) return;
    if (this.remote) {
      if (this.queue.length > 2) dt *= 4;            // 밀린 이벤트가 많으면 빨리 감아 따라잡기
      if (this.phase === 'wait') { this.pump(); return; }
    }
    if (this.fv.on && !this.remote && !this.fv.loading) this.fv.t -= dt;          // 피버 시간: 씨앗판이 떨어지는 동안만 멈춤(연쇄 중에도 흐름)
    if (this.phase === 'drop') this.updateDrop(dt);
    else if (this.phase === 'settle') this.updateSettle(dt);
    else if (this.phase === 'pop') this.updatePop(dt);
  }

  updateFx(dt) {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const p = this.grid[r][c]; if (p && p.sq >= 0) { p.sq += dt; if (p.sq > 320) p.sq = -1; }
    }
    for (const q of this.particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 0.0009 * dt; q.life -= dt; }
    this.particles = this.particles.filter(q => q.life > 0);
    for (const t of this.trails) t.age += dt;
    this.trails = this.trails.filter(t => t.age < 180);
    for (const t of this.texts) t.age += dt;
    this.texts = this.texts.filter(t => t.age < t.dur);
    this.shake = Math.max(0, this.shake - dt * 0.03);
    this.trayBump = Math.max(0, this.trayBump - dt * 0.004);
    this.hit = Math.max(0, this.hit - dt * 0.0025);
    this.flash = Math.max(0, this.flash - dt * 0.003);
    const p = this.piece;
    if (p) {
      p.rx += (p.x - p.rx) * Math.min(1, dt / 45);
      let diff = p.o * Math.PI / 2 - p.ang;
      while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
      p.ang += diff * Math.min(1, dt / 38);
    }
  }

  updateDrop(dt) {
    const p = this.piece;
    if (this.human) {
      const inp = game.inp[this.pi || 0];
      this.soft = inp.down;
      const dir = ((inp.left ? -1 : 0) + (inp.right ? 1 : 0)) * (effOn(this, 'rev') ? -1 : 1);   // 파티: 조작 반전
      if (dir !== this.lastDir) { this.lastDir = dir; this.das = 0; this.rep = 0; if (dir) this.moveX(dir); }
      else if (dir) { this.das += dt; if (this.das > 170) { this.rep += dt; while (this.rep >= 45) { this.rep -= 45; this.moveX(dir); } } }
    } else this.aiAct(dt);
    const iv = this.soft ? 35 : this.fallIv();
    const canFall = this.fits({ ...p, y: p.y + 1 });
    this.acc += dt;
    if (this.acc >= iv) {
      this.acc -= iv;
      if (canFall) { p.y++; if (this.soft && this.human) this.score++; }
      else { this.lock(); }
    }
  }

  // 하드드롭: 바닥까지 한 번에 내리꽂고 빠른 속도로 떨어지는 연출
  hardDrop() {
    if (this.phase !== 'drop' || !this.piece) return;
    const p = this.piece;
    const canFall = this.fits({ ...p, y: p.y + 1 });
    const from = p.y + (canFall ? Math.min(1, this.acc / (this.soft ? 35 : this.fallIv())) : 0);
    let n = 0;
    while (this.fits({ ...p, y: p.y + 1 })) { p.y++; n++; }
    if (this.human) this.score += n * 2;
    const off = p.y - from;
    if (off > 0.5) {
      const top = Math.min(from, from + DY[p.o]), cols = p.o % 2 ? [p.x, p.x + DX[p.o]] : [p.x];
      for (const c of cols) this.trails.push({ x: c, y0: top, y1: p.y + (p.o === 2 ? 1 : 0), age: 0 });
    }
    this.lock(off, true);
  }

  lock(off = 0, hard = false) {
    const p = this.piece, sx = p.x + DX[p.o], sy = p.y + DY[p.o];
    this.lockAt = game.el;
    if (!this.remote) emit(this, { t: 'lock', n: this.idx, x: p.x, y: p.y, o: p.o, a: p.a, b: p.b, h: hard ? 1 : 0, g: this.encode(), ia: p.ia, ib: p.ib });
    const m = this.mk(p.a, p.y, p.x, p.y - off), s = this.mk(p.b, sy, sx, sy - off);
    if (p.ia) m.it = p.ia; if (p.ib) s.it = p.ib;
    if (hard) for (const q of [m, s]) { q.vy = 0.05; q.vmax = 0.09; q.hard = true; }
    this.grid[p.y][p.x] = m; this.grid[sy][sx] = s;
    this.piece = null; this.compact(); this.phase = 'settle'; this.settleT = 0; this.chain = 0;
    for (const q of [m, s]) if (q.y === q.r) this.land(q, hard ? 1 : 0.75);
    if (hard) { this.shake = Math.max(this.shake, 3); if (off <= 0.5) sfx.slam(); }
    else sfx.land();
  }

  // 착지 출렁임: 내려앉은 뿌요 + 그 아래 쌓인 뿌요들이 깊이에 따라 약하게 함께 눌린다
  land(p, amp) {
    p.sq = 0; p.amp = amp;
    for (let r = p.r + 1, d = 1; r < ROWS; r++, d++) {
      const q = this.grid[r][p.col]; if (!q || q.y !== q.r) break;
      const a = amp * Math.pow(0.55, d); if (a < 0.06) break;
      if (q.sq < 0 || q.amp < a) { q.sq = 0; q.amp = a; }
    }
  }

  compact() {
    for (let c = 0; c < COLS; c++) {
      let w = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        const p = this.grid[r][c]; if (!p) continue;
        if (r !== w) { this.grid[w][c] = p; this.grid[r][c] = null; }
        p.r = w; p.col = c; w--;
      }
    }
  }

  updateSettle(dt) {
    let moving = false, landed = false, garb = false, slam = false;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const p = this.grid[r][c]; if (!p || p.y >= p.r) continue;
      if (p.vy === 0) p.vy = V0;
      p.vy = Math.min(p.vmax || VMAX, p.vy + G * dt); p.y += p.vy * dt;
      if (p.y >= p.r) { p.y = p.r; const amp = clamp(0.35 + p.vy * 25, 0.35, 1); p.vy = 0; p.vmax = 0; this.land(p, amp); landed = true;
        if (p.c === OJ) garb = true; if (p.hard) { slam = true; p.hard = false; } }
      else moving = true;
    }
    if (landed) { slam ? sfx.slam() : garb ? sfx.garb() : sfx.land(); }
    if (moving) { this.settleT = 0; return; }
    this.settleT += dt;
    if (this.settleT >= 110) { this.settleT = 0; this.afterSettle(); }
  }

  findGroups() {
    const seen = Array.from({ length: ROWS }, () => Array(COLS).fill(false)), out = [];
    for (let r = 1; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const p = this.grid[r][c]; if (!p || p.c === OJ || seen[r][c]) continue;
      const st = [[r, c]], cells = []; seen[r][c] = true;
      while (st.length) {
        const [y, x] = st.pop(); cells.push(this.grid[y][x]);
        for (let d = 0; d < 4; d++) {
          const ny = y + DY[d], nx = x + DX[d];
          if (ny >= 1 && ny < ROWS && nx >= 0 && nx < COLS && !seen[ny][nx] && this.grid[ny][nx] && this.grid[ny][nx].c === p.c) { seen[ny][nx] = true; st.push([ny, nx]); }
        }
      }
      if (cells.length >= 4) out.push({ c: p.c, cells });
    }
    return out;
  }

  afterSettle() {
    const gs = this.findGroups();
    if (gs.length) { this.chain++; this.beginPop(gs); } else this.endChain();
  }

  beginPop(gs) {
    this.popList = []; const set = new Set(); let total = 0, sx = 0, sy = 0;
    const POW = this.fv.on ? FEVER_POWER : CHAIN_POWER;
    let bonus = POW[Math.min(this.chain, POW.length - 1)]; const cols = new Set();
    if (this.chain === 1) this.fv.hit = false;
    for (const g of gs) { total += g.cells.length; bonus += groupBonus(g.cells.length); cols.add(g.c);
      for (const p of g.cells) { this.popList.push(p); set.add(p); sx += p.col; sy += p.y; if (p.it) (this.itemQ = this.itemQ || []).push(p.it); } }
    bonus += COLOR_BONUS[Math.min(cols.size, 5)];
    const step = 10 * total * clamp(bonus, 1, 999);
    if (!this.remote) this.score += step * (effOn(this, 'dbl') ? 2 : 1);   // 원격 판(온라인 상대·리플레이) 점수는 받은 값만 씀
    this.pops += total;
    if (!game.vs) this.level = 1 + Math.floor(this.pops / 40);
    if (game.vs && !this.remote && (this.chain === 1 || !this.opp || this.opp.dead)) this.opp = pickTarget(this, this.chain === 1 ? null : this.opp && this.opp.kind);
    const tp = targetPt(); this.carry += step; let units = Math.floor(this.carry / tp); this.carry -= units * tp;
    if (this.chain === 1 && this.acBonus) {        // 전멸 보너스: 다음 연쇄 첫 단계에 방해뿌요 30개(테트리스 상대는 2100점)
      this.acBonus = false;
      if (this.opp && this.opp.kind === 'tetris') this.lineCarry += 2100; else units += 30;
    }
    const n = this.popList.length;
    for (const p of [...this.popList]) for (let d = 0; d < 4; d++) {
      const ny = p.r + DY[d], nx = p.col + DX[d];
      if (ny >= 1 && ny < ROWS && nx >= 0 && nx < COLS) { const q = this.grid[ny][nx]; if (q && q.c === OJ && !set.has(q)) { set.add(q); this.popList.push(q); } }
    }
    this.popSet = set; this.popT = 0; this.phase = 'pop';
    this.maxChain = Math.max(this.maxChain, this.chain);
    sfx.pop(this.chain);
    const ax = clamp((sx / n + 0.5) * CS, 60, FW - 60), ay = clamp((sy / n - 1 + 0.5) * CS, 40, FH - 40);
    if (this.opp && this.opp.kind === 'tetris') this.attackT(step, units, this.ox + ax, this.oy + ay);
    else this.attack(units, this.ox + ax, this.oy + ay);
    this.texts.push({ txt: this.chain + '연쇄!', x: ax, y: ay,
      age: 0, dur: 1200, col: CH_COL[(this.chain - 1) % CH_COL.length], size: 28 + Math.min(this.chain, 8) * 2.5 });
    if (cols.size >= 2) {                      // 2색 이상 동시 소거: 더블 / 트리플 / 쿼드
      this.doubles++;
      const label = ['', '', '더블!', '트리플!', '쿼드!', '쿼드!'][Math.min(cols.size, 5)];
      const dy = ay > FH - 110 ? -58 : 58;
      this.texts.push({ txt: label, x: ax, y: ay + dy, age: -120, dur: 1400, col: '#fff', size: 38 + (cols.size - 2) * 6,
        rainbow: [...cols].map(c => PAL[c].m), wobble: true });
      ring(this.ox + ax, this.oy + ay + dy, '#ffffff', 12, 80 + cols.size * 14, 480, 6);
      for (const c of cols) ring(this.ox + ax, this.oy + ay + dy, PAL[c].m, 8, 56 + cols.size * 10, 420, 4);
      burst(this.ox + ax, this.oy + ay + dy, '#fff6c2', 10 + cols.size * 6, 0.32);
      setTimeout(() => sfx.double(cols.size), 110);
    }
  }

  updatePop(dt) {
    this.popT += dt;
    if (this.popT < POP_T) return;
    for (const p of this.popList) {
      this.grid[p.r][p.col] = null;
      const cx = p.col * CS + CS / 2, cy = (p.r - 1) * CS + CS / 2;
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * Math.PI * 2, s = 0.08 + Math.random() * 0.28;
        this.particles.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.12, life: 500 + Math.random() * 350, max: 850,
          r: 3 + Math.random() * 4, col: i % 3 ? PAL[p.c].m : '#ffffff' });
      }
    }
    this.popList = []; this.popSet = null;
    this.flash = Math.min(0.55, 0.18 + this.chain * 0.06); this.shake = Math.min(8, 1.5 + this.chain * 1.2);
    this.compact(); this.phase = 'settle'; this.settleT = 0;
  }

  isEmpty() { for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (this.grid[r][c]) return false; return true; }

  // 연쇄 한 단계마다 바로 공격: 내 쪽에 쌓인 방해뿌요부터 상쇄하고 남은 만큼 상대에게 날림
  attack(units, x, y) {
    if (!game.vs || units <= 0 || this.remote || game.rule === 'bigbang') return;
    let n = units;
    if (!this.human) { this.atkCarry += units * this.ai.atk; n = Math.floor(this.atkCarry); this.atkCarry -= n; }
    if (n <= 0) return;
    this.sent += n;
    const c = Math.min(this.pending, n);
    const rx = x - this.ox, ry = y - this.oy;
    if (c > 0) { this.pending -= c; n -= c; this.feverHit(); game.launch(this, this, c, x, y, 'offset'); emit(this, { t: 'off', n: c, x: rx, y: ry, ch: this.chain }); }
    if (n > 0) { game.launch(this, this.opp, n, x, y, 'attack'); emit(this, { t: 'atk', to: game.fields.indexOf(this.opp), n, x: rx, y: ry, ch: this.chain }); }
  }

  // 테트리스 상대: 연쇄 단계 점수(+이월)가 210·630·1050·1710·3500·7000·14000점에 닿으면 1~7줄.
  // 내 예고 방해뿌요는 평소처럼 상쇄하고, 상쇄량이 예고를 넘어선 단계부터 줄 공격이 쌓여 연쇄가 끝날 때 한 번에 감
  attackT(step, units, x, y) {
    if (!game.vs || this.remote || game.rule === 'bigbang') return;
    this.lineCarry += step;
    let lines = 0;
    const mf = targetPt() / 70;
    for (let i = P2T.length - 1; i >= 0; i--) if (this.lineCarry >= P2T[i] * mf) { lines = i + 1; this.lineCarry -= P2T[i] * mf; break; }
    if (this.pending > 0) {
      const before = this.pending, c = Math.min(this.pending, Math.max(1, units));
      this.pending -= c; this.feverHit(); game.launch(this, this, c, x, y, 'offset');
      emit(this, { t: 'off', n: c, x: x - this.ox, y: y - this.oy, ch: this.chain });
      if (units <= before) lines = 0;
    }
    if (!this.human) { this.lineAtk += lines * this.ai.atk; lines = Math.floor(this.lineAtk); this.lineAtk -= lines; }
    this.lineOut += lines; this.sent += lines; this.lastAtkXY = [x, y];
  }

  endChain() {
    const ch = this.chain; this.fv.loading = false;
    if (this.chain > 0 && this.opp && this.opp.kind === 'tetris' && !this.remote) {
      if (this.lineOut > 0 && game.vs) {
        const [x, y] = this.lastAtkXY || [this.ox + FW / 2, this.oy + FH / 2];
        game.launch(this, this.opp, this.lineOut, x, y, 'attack');
        emit(this, { t: 'atk', to: game.fields.indexOf(this.opp), n: this.lineOut, x: x - this.ox, y: y - this.oy, ch: this.chain });
      }
      this.lineOut = 0; this.lineCarry = 0;
    }
    if (this.chain > 0) {
      if (this.chain >= 2) this.chains2++;
      if (this.isEmpty() && !this.fv.on && game.rule !== 'bigbang') {     // 피버·빅뱅 씨앗판은 다 터뜨려도 전멸 보너스 없음
        this.allClears++;
        this.texts.push({ txt: '전멸!', x: FW / 2, y: FH / 2, age: 0, dur: 1600, col: '#ffd93d', size: 44 }); sfx.clear();
        if (game.vs) this.acBonus = true;
      }
      this.lastChain = this.chain;
    }
    this.chain = 0;
    if (this.remote) { this.spawn(); return; }
    if (this.itemQ && this.itemQ.length) {   // 파티: 터뜨린 ★아이템 발동(판 정리는 다시 내려앉은 뒤 이어짐)
      const ks = this.itemQ; this.itemQ = [];
      for (const k of ks) useItem(this, k);
      if (this.phase === 'settle') return;
    }
    if (this.bbOn()) {                        // 빅뱅: 연쇄가 나면 이번 라운드 끝, 아니면 계속 놓기
      if (ch > 0) { this.bbFinish(ch / this.bbN, this.lockAt); return; }   // 끝낸 시각은 트리거를 놓은 때(연쇄 연출 시간은 빼고)
      this.spawn(); return;
    }
    if (this.fv.on) {                         // 피버 중: 연쇄가 끝나면 다음 씨앗판, 시간이 다 되면 원래 판으로. 방해뿌요는 피버가 끝난 뒤에
      if (ch > 0) {
        const [, max] = feverLv();
        this.fv.lv = ch >= this.fv.seedN ? Math.min(max, this.fv.lv + 1) : Math.max(3, this.fv.lv - 1);
        const bonus = ch * (game.vs ? 300 : 600);
        this.fv.t += bonus;
        if (bonus) this.texts.push({ txt: `+${(bonus / 1000).toFixed(1)}초`, x: FW / 2, y: FH * 0.62, age: 0, dur: 1100, col: '#ffe066', size: 26 });
        if (this.fv.t > 0) { this.loadSeed(); return; }
      }
      if (this.fv.t <= 0) { this.endFever(); return; }
      this.spawn(); return;
    }
    if (this.pending > 0 && !this.noGarb) { this.dropGarbage(); return; }
    this.spawn();
  }

  /* ---------- 파티(party.js) ---------- */
  cleanRows(n) {                             // 아래 n줄 없애기
    for (let r = ROWS - n; r < ROWS; r++) for (let c = 0; c < COLS; c++) this.grid[r][c] = null;
    this.compact(); emit(this, { t: 'gs', g: this.encode() });            // 위 뿌요들은 원래 자리(y)에서 내려앉음
    this.piece = null; this.phase = 'settle'; this.settleT = 0;
  }
  clearBoard() {
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    emit(this, { t: 'gs', g: this.encode() });
    this.piece = null; this.phase = 'settle'; this.settleT = 0;
  }

  /* ---------- 빅뱅(bigbang.js) ---------- */
  bbOn() { return game.rule === 'bigbang' && !this.remote && this.bbN > 0; }
  bbLoad(s) {
    if (!s) { this.bbN = 0; this.phase = 'bbwait'; bbReport(this, 0, game.el); return; }
    this.bbN = s.n; this.chain = 0;
    const g = s.g.map(row => row.join('')).join('');
    this.decode(g, true);
    this.forcePair = [s.trig.c, 1 + rnd(4)];
    emit(this, { t: 'fv', g, on: 0 });
    this.piece = null; this.phase = 'settle'; this.settleT = 0;
  }
  bbFinish(p, at = game.el) { this.bbN = 0; this.piece = null; this.phase = 'bbwait'; bbReport(this, p, at); }
  bbTimeUp() { if (this.phase === 'pop' || this.phase === 'settle') { this.bbN = this.bbN || 1; return; } this.bbFinish(0); }   // 연쇄 중이면 끝날 때 결과

  /* ---------- 피버 ---------- */
  feverHit() {                               // 상쇄하면 연쇄 한 번에 게이지 한 칸
    if (game.rule !== 'fever' || this.fv.on || this.fv.hit || this.remote) return;
    this.fv.hit = true; this.fv.gauge = Math.min(FEVER_GAUGE, this.fv.gauge + 1);
    if (this.fv.gauge >= FEVER_GAUGE) this.texts.push({ txt: '피버 준비!', x: FW / 2, y: FH * 0.7, age: 0, dur: 1300, col: '#ff9a3d', size: 30 });
  }
  startFever() {
    const solo = !game.vs;
    this.fv.on = true; this.fv.t = solo ? 30000 : FEVER_TIME;
    if (!this.fv.lv) this.fv.lv = feverLv()[0];
    this.fv.stash = this.encode();
    this.texts.push({ txt: '피버!', x: FW / 2, y: FH * 0.3, age: 0, dur: 1500, col: '#ff5fd0', size: 52 });
    if (this.human) sfx.margin();
    this.loadSeed();
  }
  loadSeed() {
    const s = feverSeed(this.fv.lv);
    if (!s) { this.endFever(); return; }
    this.fv.seedN = s.n; this.fv.loading = true;
    const g = s.g.map(row => row.join('')).join('');
    this.decode(g, true);
    this.forcePair = [s.trig.c, 1 + rnd(4)];          // 트리거 색이 든 조각을 바로 줌
    emit(this, { t: 'fv', g, on: 1 });
    this.piece = null; this.phase = 'settle'; this.settleT = 0;
  }
  endFever() {
    if (!game.vs && game.soloMode === 'efever') { this.fv.on = false; this.done = true; this.doneAt = game.el; this.phase = 'done'; this.piece = null; return; }   // 엔드리스 피버: 시간 끝
    const g = this.fv.stash || ''.padStart(ROWS * COLS, '0');
    this.fv.on = false; this.fv.gauge = 0; this.fv.stash = null; this.forcePair = null;
    this.decode(g, true);
    emit(this, { t: 'fv', g, on: 0 });
    this.texts.push({ txt: '피버 끝', x: FW / 2, y: FH * 0.3, age: 0, dur: 1200, col: '#fff', size: 34 });
    this.piece = null; this.phase = 'settle'; this.settleT = 0;
  }

  dropGarbage() {
    const n = Math.min(BOARDS[BOARD].drop || 30, this.pending); this.pending -= n; this.noGarb = true;   // 한 번에 떨어지는 최대 개수
    const counts = Array(COLS).fill(Math.floor(n / COLS)); const order = [...Array(COLS).keys()].sort(() => Math.random() - 0.5);
    for (let i = 0; i < n % COLS; i++) counts[order[i]]++;
    if (!this.remote) emit(this, { t: 'garb', c: counts, g: this.encode() });
    this.placeGarbage(counts);
  }

  placeGarbage(counts) {
    for (let c = 0; c < COLS; c++) {
      const off = Math.random() * 2;
      for (let k = 0; k < counts[c]; k++) {
        let r = ROWS - 1; while (r >= 0 && this.grid[r][c]) r--;
        if (r < 0) break;
        this.grid[r][c] = this.mk(OJ, r, c, -1.5 - k * 1.1 - off);
      }
    }
    this.phase = 'settle'; this.settleT = 0;
  }

  /* ---------- CPU ---------- */
  colorGrid() { return this.grid.map(row => row.map(p => p ? p.c : 0)); }

  planAI() {
    const g = this.colorGrid(), p = this.piece, hs = heightsOf(g), maxH = Math.max(...hs);
    const danger = maxH >= VIS - 3 || this.pending >= 12;
    let best = null, bestS = -Infinity; const cands = [];
    for (let x = 0; x < COLS; x++) for (let o = 0; o < 4; o++) {
      const sx = x + DX[o]; if (sx < 0 || sx >= COLS) continue;
      let ok = true; const lo = Math.min(SP, x, sx), hi = Math.max(SP, x, sx);
      for (let c = lo; c <= hi; c++) if (g[1][c] || g[0][c]) ok = false;
      if (!ok) continue;
      const s = g.map(r => r.slice());
      const low = c => { let r = ROWS - 1; while (r >= 0 && s[r][c]) r--; return r; };
      let py, sy;
      if (o === 0) { py = low(x); sy = py - 1; } else if (o === 2) { sy = low(x); py = sy - 1; } else { py = low(x); sy = low(sx); }
      if (py < 1 || sy < 1) continue;
      s[py][x] = p.a; s[sy][sx] = p.b;
      const res = simResolve(s); let sc = 0; const atk = Math.floor(res.score / 70);
      if (this.fv.on || this.bbOn()) sc += res.chain * 3000;     // 피버·빅뱅: 씨앗판은 터뜨리는 게 우선
      else if (res.chain > 0) {
        if (res.chain >= 4) sc += 2000 + res.chain * 400;
        else if (res.chain === 3) sc += 900;
        else if (danger || (this.pending > 0 && atk >= this.pending)) sc += 600 * res.chain + atk * 10;
        else if (this.ai.greedy) sc += 300 * res.chain;
        else sc -= 120 - res.chain * 10;
      }
      const h = heightsOf(s);
      for (let c = 0; c < COLS; c++) sc -= h[c] * h[c] * 0.9;
      if (h[SP] >= VIS - 1) sc -= 4000; else if (h[SP] >= VIS - 3) sc -= 250;
      sc += connectScore(s);
      if (!danger && this.ai.pot > 0 && !this.fv.on && !this.bbOn()) { const pot = potential(s); sc += this.ai.pot * 150 * pot * pot; }
      sc += Math.random() * this.ai.noise;
      cands.push({ x, o });
      if (sc > bestS) { bestS = sc; best = { x, o }; }
    }
    if (cands.length && Math.random() < this.ai.miss) best = cands[rnd(cands.length)];
    this.tgt = best || { x: SP, o: 0 };
  }

  aiAct(dt) {
    this.aiT -= dt; if (this.aiT > 0 || !this.tgt) return;
    this.aiT = this.ai.delay * (0.7 + Math.random() * 0.6) * (effOn(this, 'rev') ? 1.8 : 1);   // 조작 반전: CPU는 느려짐
    const p = this.piece, t = this.tgt;
    if (p.o !== t.o) { const d = (t.o - p.o + 4) % 4; this.rotate(d === 3 ? -1 : 1); }
    else if (p.x < t.x) this.moveX(1);
    else if (p.x > t.x) this.moveX(-1);
    else this.soft = !!this.ai.soft;
  }

  /* ---------- 그리기 ---------- */
  draw(t) {
    const c = ctx, shx = this.shake ? (Math.random() - 0.5) * this.shake : 0, shy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const tone = this.tone || TONES.red;
    // 이름표
    c.save();
    slab(c, this.ox + 14, 2, FW - 28, 32, tone, 4);
    outlined(c, this.name, this.ox + FW / 2, 19, 20, '#fff', tone.d, 6);
    // 점수판
    const sy = this.oy + FH + 16;
    slab(c, this.ox + 6, sy, FW - 12, 50, TONES.white, 4);
    c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = '#6d6b80'; c.font = '15px ' + FONT();
    c.fillText('점수', this.ox + 30, sy + 26);
    c.fillStyle = '#22212e'; c.font = '28px ' + HFONT(); c.fillText(this.score.toLocaleString(), this.ox + 70, sy + 27);
    slab(c, this.ox + FW - 118, sy + 9, 92, 32, tone, 3);
    outlined(c, `최고 ${this.maxChain}연쇄`, this.ox + FW - 72, sy + 26, 15, '#fff', tone.d, 4);
    c.restore();
    this.drawTray(c);
    if (game.rule === 'fever') this.drawFeverGauge(c, t);

    c.save(); c.translate(this.ox + shx, this.oy + shy);
    c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillRect(-10, -4, FW + 20, FH + 20);
    c.fillStyle = tone.d; c.fillRect(-10, -10, FW + 20, FH + 20);
    c.fillStyle = '#fff'; c.fillRect(-5, -5, FW + 10, FH + 10);
    c.save(); c.beginPath(); c.rect(0, 0, FW, FH); c.clip();
    const fvOn = this.fv.on;                   // 피버 중에는 판 색이 바뀜
    for (let r = 0; r < VIS; r++) for (let q = 0; q < COLS; q++) { c.fillStyle = fvOn ? ((r + q) % 2 ? '#3c1250' : '#4a165e') : (r + q) % 2 ? '#191342' : '#1e174e'; c.fillRect(q * CS, r * CS, CS, CS); }

    // 사망 칸 X
    const near = this.grid[3][SP] ? 1 : this.grid[5][SP] ? 0.6 : 0.3;
    c.save(); c.strokeStyle = `rgba(255,79,106,${near * (0.75 + 0.25 * Math.sin(t / 180))})`; c.lineWidth = 5; c.lineCap = 'round';
    const xx = SP * CS + CS / 2, xy = CS / 2; c.beginPath(); c.moveTo(xx - 9, xy - 9); c.lineTo(xx + 9, xy + 9); c.moveTo(xx + 9, xy - 9); c.lineTo(xx - 9, xy + 9); c.stroke(); c.restore();

    for (const tr of this.trails) {      // 하드드롭 잔상
      const a = 1 - tr.age / 180, x = tr.x * CS + CS / 2, y0 = (tr.y0 - 1) * CS, y1 = (tr.y1 - 1) * CS + CS / 2;
      const gr = c.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, `rgba(255,255,255,${0.35 * a})`);
      c.fillStyle = gr; c.fillRect(x - R * 0.8, y0, R * 1.6, Math.max(0, y1 - y0));
    }
    const items = [], links = [], quads = [], map = new Map();
    const popping = p => this.phase === 'pop' && this.popSet && this.popSet.has(p);
    for (let q = 0; q < COLS; q++) {
      let shift = 0;                       // 아래 뿌요가 눌린 만큼 위 뿌요가 같이 내려앉음
      for (let r = ROWS - 1; r >= 0; r--) {
        const p = this.grid[r][q]; if (!p) { shift = 0; continue; }
        const settled = p.y === p.r;
        let sx = 1, sy = 1;
        if (p.sq >= 0) { const f = bounceF(p.sq); sy = 1 - 0.3 * p.amp * f; sx = 1 + 0.17 * p.amp * f; }
        let cy = (p.y - 1) * CS + CS / 2;
        if (settled) { cy += shift + (CS / 2) * (1 - sy); shift += CS * (1 - sy); } else shift = 0;
        const pop = popping(p);
        if (pop) {
          const s = 1 + 0.08 * Math.sin(this.popT / 55), end = POP_T - this.popT;
          const k = s * (end < 120 ? 0.5 + 0.5 * end / 120 : 1); sx *= k; sy *= k;
        }
        if (cy < -CS * 1.5) continue;
        const it = { cx: q * CS + CS / 2, cy, rx: R * sx, ry: R * sy, col: p.c, pop, flash: pop && Math.floor(this.popT / 70) % 2 === 1, star: p.it };
        items.push(it); map.set(p, it);
      }
    }
    for (let r = 0; r < ROWS; r++) for (let q = 0; q < COLS; q++) {
      const p = this.grid[r][q]; if (!p || p.c === OJ || p.y !== p.r || !map.has(p)) continue;
      const nb = [q + 1 < COLS ? this.grid[r][q + 1] : null, r + 1 < ROWS ? this.grid[r + 1][q] : null];
      const same = n => n && n.c === p.c && n.y === n.r && map.has(n) && popping(n) === popping(p);
      const ia = map.get(p);
      if (same(nb[0])) { const ib = map.get(nb[0]); ia.mask = (ia.mask || 0) | RT; ib.mask = (ib.mask || 0) | LT; links.push([ia, ib]); }
      if (same(nb[1])) { const ib = map.get(nb[1]); ia.mask = (ia.mask || 0) | DN; ib.mask = (ib.mask || 0) | UP; links.push([ia, ib]); }
      const dg = r + 1 < ROWS && q + 1 < COLS ? this.grid[r + 1][q + 1] : null;
      if (same(nb[0]) && same(nb[1]) && same(dg)) quads.push([p, nb[0], nb[1], dg].map(x => map.get(x)));
    }
    const pc = this.piece;
    if (pc) {
      const canFall = this.fits({ ...pc, y: pc.y + 1 });
      const iv = this.soft ? 35 : this.fallIv(), prog = this.remote ? (pc.prog || 0) : canFall ? Math.min(1, this.acc / iv) : 0;
      const px = pc.rx * CS + CS / 2, py = (pc.y + prog - 1) * CS + CS / 2;
      items.push({ cx: px, cy: py, rx: R, ry: R, col: pc.a, star: pc.ia },
                 { cx: px + Math.sin(pc.ang) * CS, cy: py - Math.cos(pc.ang) * CS, rx: R, ry: R, col: pc.b, star: pc.ib });
    }
    drawPuyos(c, items, links, quads);
    for (const it of items) if (it.star) drawStar(c, it.cx, it.cy - R * 0.1, R * 0.6, ITEMS[it.star] ? ITEMS[it.star].col : '#ffe066');

    for (const q of this.particles) {
      c.globalAlpha = clamp(q.life / q.max, 0, 1); c.fillStyle = q.col;
      c.beginPath(); c.arc(q.x, q.y, q.r * (0.4 + 0.6 * q.life / q.max), 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
    if (this.flash > 0) { c.fillStyle = `rgba(255,255,255,${this.flash})`; c.fillRect(0, 0, FW, FH); }
    if (this.hit > 0) { c.strokeStyle = `rgba(255,79,106,${this.hit})`; c.lineWidth = 10; c.strokeRect(0, 0, FW, FH); }
    for (const tx of this.texts) {
      if (tx.age < 0) continue;
      const k = tx.age / tx.dur, e = tx.age < 200 ? (() => { const u = tx.age / 200, s = 1.70158; return 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2); })() : 1;
      c.save(); c.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      c.translate(tx.x, tx.y - tx.age * 0.02); c.scale(0.3 + 0.7 * e, 0.3 + 0.7 * e);
      if (tx.wobble) c.rotate(Math.sin(tx.age / 70) * 0.08 * Math.max(0, 1 - tx.age / 600));
      c.font = tx.size + 'px ' + (tx.rainbow ? HFONT() : FONT()); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = tx.rainbow ? 10 : 7; c.lineJoin = 'round'; c.strokeStyle = '#2a1d6b'; c.strokeText(tx.txt, 0, 0);
      if (tx.rainbow) {                       // 지워진 색들로 채운 글자 + 흰 테두리
        const half = tx.size * tx.txt.length * 0.32, g = c.createLinearGradient(-half, 0, half, 0);
        tx.rainbow.forEach((col, i) => g.addColorStop(tx.rainbow.length === 1 ? 0 : i / (tx.rainbow.length - 1), col));
        c.lineWidth = 4; c.strokeStyle = '#fff'; c.strokeText(tx.txt, 0, 0);
        c.fillStyle = g;
      } else c.fillStyle = tx.col;
      c.fillText(tx.txt, 0, 0); c.restore();
    }
    const danger = !this.dead && game.fields.some(o => o.opp === this && o.kind === 'tetris' && !o.dead && o.gauge >= 11);
    if (danger !== this.dangerOn) { this.dangerOn = danger; if (danger && this.human) sfx.danger(); }
    if (danger) {
      const a = 0.55 + 0.45 * Math.sin(t / 120);
      c.save(); c.globalAlpha = a; c.translate(FW / 2, 40); c.rotate(-0.04);
      slab(c, -96, -22, 192, 44, TONES.red, 4); outlined(c, '위험!', 0, 1, 28, '#fff', TONES.red.d, 7);
      c.restore();
      c.strokeStyle = `rgba(255,69,89,${0.35 * a})`; c.lineWidth = 8; c.strokeRect(0, 0, FW, FH);
    }
    if (game.rule === 'fever' && !this.dead) this.drawFever(c);
    if (this.acBonus && !this.dead) {           // 전멸 보너스 대기 표시
      c.save(); c.translate(FW - 70, FH - 22); slab(c, -62, -15, 124, 30, TONES.yellow, 3);
      outlined(c, '전멸 보너스', 0, 1, 15, '#fff', TONES.yellow.d, 4); c.restore();
    }
    if (this.dead || this.won) {               // 결과 띠
      c.fillStyle = 'rgba(20,16,50,0.45)'; c.fillRect(0, 0, FW, FH);
      const bt = this.won ? TONES.yellow : game.vs ? TONES.blue : TONES.green;
      c.save(); c.translate(FW / 2, FH / 2); c.rotate(-0.06);
      slab(c, -FW / 2 - 20, -42, FW + 40, 84, bt, 6);
      outlined(c, endLabel(this), 0, 2, 50, '#fff', bt.d, 9);
      c.restore();
    }
    c.restore(); c.restore();
  }

  // 피버 게이지(판 왼쪽 7칸)와 피버 남은 시간
  drawFeverGauge(c, t) {                     // 점수판 바로 아래 7칸 막대
    const w = (FW - 12) / FEVER_GAUGE, y = this.oy + FH + 70;
    for (let i = 0; i < FEVER_GAUGE; i++) {
      const x = this.ox + 6 + i * w, on = this.fv.on || i < this.fv.gauge;
      c.fillStyle = 'rgba(0,0,0,0.18)'; rr(c, x + 2, y, w - 4, 6, 3); c.fill();
      if (on) { c.fillStyle = this.fv.on ? `hsl(${(t / 4 + i * 40) % 360},90%,58%)` : '#ff8a1c'; rr(c, x + 2, y, w - 4, 6, 3); c.fill(); }
    }
  }
  drawFever(c) {
    if (this.fv.on) {
      c.save(); c.translate(FW / 2, 24);
      slab(c, -64, -16, 128, 32, TONES.purple, 3);
      outlined(c, `피버 ${Math.max(0, this.fv.t / 1000).toFixed(1)}`, 0, 1, 18, '#fff', TONES.purple.d, 5);
      c.restore();
    }
  }

  drawTray(c) {
    let p = this.pending; if (p <= 0) return;
    const UNITS = [[1440, 7], [720, 6], [360, 5], [180, 4], [30, 3], [6, 2], [1, 1]], icons = [];
    for (const [u, k] of UNITS) { const n = Math.floor(p / u); p -= n * u; for (let i = 0; i < n; i++) icons.push(k); }
    const list = icons.slice(0, 6), rad = [0, 9, 13, 17, 17, 17, 18, 18], gap = 4;
    let w = list.reduce((a, k) => a + rad[k] * 2 + gap, -gap), x = this.ox + FW / 2 - w / 2, y = this.oy - 32;
    for (const k of list) {
      x += rad[k];
      const bob = Math.sin(performance.now() / 220 + x) * 1.5 - this.trayBump * 10 * Math.abs(Math.sin(this.trayBump * 9));
      if (k >= 4) trayIcon(c, k, x, y + bob, rad[k]);
      else {
        c.fillStyle = k === 3 ? '#9a6d06' : PAL[OJ].d; c.beginPath(); c.arc(x, y + bob, rad[k] + 2, 0, Math.PI * 2); c.fill();
        c.fillStyle = k === 3 ? '#ffd93d' : PAL[OJ].m; c.beginPath(); c.arc(x, y + bob, rad[k], 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(x - rad[k] * 0.3, y + bob - rad[k] * 0.35, rad[k] * 0.25, rad[k] * 0.15, -0.5, 0, Math.PI * 2); c.fill();
      }
      x += rad[k] + gap;
    }
    c.textAlign = 'left'; outlined(c, '×' + this.pending, x + 22, y, 17, '#fff', '#22212e', 5);
  }
}
