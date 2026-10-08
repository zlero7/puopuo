// 테트리스 판(TField)
'use strict';

/* ================= 테트리스 필드 =================
   조사한 원작(뿌요뿌요 테트리스) 규칙
   - 10×20 필드(+위 2줄 숨김), SRS 회전·월킥, 7종 가방 랜덤, 홀드, 다음 5개, 하드드롭, 고스트
   - 공격(테트리스 상대): 1줄 0 · 2줄 1 · 3줄 2 · 테트리스 4 · T스핀 싱글 2/더블 4/트리플 6 · 퍼펙트 10 · B2B +1 · REN 보너스
   - 공격(뿌요 상대): T스핀 더블 3 · 트리플 4 · 퍼펙트 6(+REN) · REN 보너스 약화, 공격은 '게이지'에 모았다가
     줄을 지우지 않는 블록을 놓을 때 한 번에 방해뿌요로 변환해 보냄(1→4, 2→5, 3→6, 4→8, 10→28 …)
   - 뿌요의 공격을 테트리스가 받을 때: 연쇄 한 단계 점수가 210·630·1050·1710·3500·7000·14000점에 닿을 때마다 1~7줄,
     연쇄가 끝나면 한 번에 아래에서 구멍 한 칸짜리 줄로 올라옴(한 번에 최대 7줄) */
const TW = 10, TH = 22, TVIS = 20, TC = 28;
const TGX = (SW - TW * TC) / 2, TGY = FH - TVIS * TC;
const TKEYS = ['', 'I', 'O', 'T', 'S', 'Z', 'J', 'L', 'G'];
const TCOL = { I: '#22cfee', O: '#ffd22e', T: '#b35af0', S: '#46d457', Z: '#ff4658', J: '#2f68f0', L: '#ff9324', G: '#a9a6bd' };
const TSHAPE = { I: ['....', 'XXXX', '....', '....'], O: ['XX', 'XX'], T: ['.X.', 'XXX', '...'], S: ['.XX', 'XX.', '...'],
  Z: ['XX.', '.XX', '...'], J: ['X..', 'XXX', '...'], L: ['..X', 'XXX', '...'] };
const TROT = {};
for (const k in TSHAPE) {
  let m = TSHAPE[k].map(r => [...r].map(ch => ch === 'X'));
  TROT[k] = [];
  for (let i = 0; i < 4; i++) {
    TROT[k].push(m.flatMap((row, r) => row.map((v, c) => v ? [c, r] : null).filter(Boolean)));
    const n = m.length; m = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => m[n - 1 - c][r]));
  }
}
// SRS 월킥 표 (x 오른쪽 +, y 위쪽 + 기준 — 화면 좌표로 쓸 때 y 부호를 뒤집음)
const K_JLSTZ = { '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]], '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]], '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]], '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]], '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]] };
const K_I = { '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]], '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]], '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]], '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]], '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]] };
const TVT_COMBO = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
const TVP_COMBO = [0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5];
const T2P = [0,4,5,6,8,10,13,16,20,24,28,33,38,43,49,55,61,68,75,83,92,102,113,125,138,152,167,183,200,218,237,
  257,278,300,323,347,372,398,425,453,482,512,543,575,608,642,677,713,750,788,827,867,908,950,993,1037,1082,1128,1175,1223,1272];
const P2T = [210, 630, 1050, 1710, 3500, 7000, 14000];
// 마진 타임: 대전 시작 96초 후부터 16초마다 공격력이 오름(뿌요: 목표 점수 감소 / 테트리스: 보내는 줄 배율)
const MARGIN_START = 96000, MARGIN_STEP = 16000, TSU_TP = [70, 52, 35, 26, 17, 13, 8, 6, 4, 3, 2, 1];
function marginLv() {
  if (!game.vs || !game.t0 || game.state === 'intro') return 0;
  const el = performance.now() - game.t0;
  return el < MARGIN_START ? 0 : Math.min(TSU_TP.length - 1, 1 + Math.floor((el - MARGIN_START) / MARGIN_STEP));
}
const targetPt = () => TSU_TP[marginLv()];
const tMarginMul = () => Math.min(3, 1 + 0.25 * marginLv());

// 7종 가방(양쪽 같은 순서)
let tseq = [], tRng = Math.random;
function tPieceAt(i) {
  while (tseq.length <= i) {
    const bag = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    for (let j = bag.length - 1; j > 0; j--) { const r = Math.floor(tRng() * (j + 1)); [bag[j], bag[r]] = [bag[r], bag[j]]; }
    tseq.push(...bag);
  }
  return tseq[i];
}

function drawBlock(c, x, y, s, col, alpha = 1) {
  c.save(); c.globalAlpha = alpha;
  c.fillStyle = col; rr(c, x + 1, y + 1, s - 2, s - 2, 4); c.fill();
  const g = c.createLinearGradient(x, y, x + s, y + s);
  g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.45, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0.28)');
  c.fillStyle = g; rr(c, x + 1, y + 1, s - 2, s - 2, 4); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.75)'; rr(c, x + s * 0.2, y + s * 0.16, s * 0.34, s * 0.12, 2); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1.5; rr(c, x + 1.5, y + 1.5, s - 3, s - 3, 4); c.stroke();
  c.restore();
}
function drawMino(c, k, cx, cy, s, alpha = 1) {
  const cells = TROT[k][0], xs = cells.map(p => p[0]), ys = cells.map(p => p[1]);
  const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
  for (const [x, y] of cells) drawBlock(c, cx + (x - Math.min(...xs) - w / 2) * s, cy + (y - Math.min(...ys) - h / 2) * s, s, TCOL[k], alpha);
}

class TField {
  constructor(ox, oy, human, name) {
    this.kind = 'tetris'; this.ox = ox; this.oy = oy; this.human = human; this.name = name; this.opp = null;
    this.ai = { delay: 170, noise: 0.6, miss: 0.08, atk: 0.6, hard: true, holdUse: true };
    this.reset();
  }
  get chain() { return this.ren; }
  get fw() { return SW; }
  get sx() { return this.ox; }
  reset() {
    this.grid = Array.from({ length: TH }, () => Array(TW).fill(0));
    this.idx = 0; this.holdK = null; this.canHold = true; this.cur = null;
    this.score = 0; this.maxChain = 0; this.pending = 0; this.gauge = 0; this.ren = 0; this.b2b = false;
    this.pops = 0; this.chains2 = 0; this.allClears = 0; this.sent = 0; this.doubles = 0; this.lines = 0; this.level = 1;
    this.phase = 'none'; this.particles = []; this.texts = []; this.trails = [];
    this.shake = 0; this.flash = 0; this.hit = 0; this.trayBump = 0; this.dead = false; this.won = false;
    this.soft = false; this.lastDir = 0; this.das = 0; this.rep = 0; this.acc = 0; this.lockT = 0; this.resets = 0; this.lowest = 0;
    this.clearRows = []; this.clearT = 0; this.areT = 0; this.atkCarry = 0; this.holeCol = rnd(TW);
    this.queue = []; this.net = null; this.lastRot = false; this.lastKick = 0; this.aiT = 0; this.tgt = null; this.stuck = 0;
  }
  cells(p) { return TROT[p.k][p.r].map(([x, y]) => [p.x + x, p.y + y]); }
  valid(p) { for (const [x, y] of this.cells(p)) { if (x < 0 || x >= TW || y < 0 || y >= TH || this.grid[y][x]) return false; } return true; }
  encode() { return this.grid.map(r => r.join('')).join(''); }
  decode(g) { for (let r = 0; r < TH; r++) for (let c = 0; c < TW; c++) this.grid[r][c] = +g[r * TW + c] || 0; }
  fallIv() {
    if (!game.vs) return Math.max(20, Math.pow(0.8 - (this.level - 1) * 0.007, this.level - 1) * 1000);   // 가이드라인 낙하 속도
    const el = (performance.now() - (game.t0 || 0)) / 30000;
    return Math.max(80, 1000 * Math.pow(0.85, Math.floor(el)));
  }
  vsPuyo() { return this.opp && this.opp.kind === 'puyo'; }

  spawn() { if (this.remote) { this.phase = 'wait'; this.cur = null; return; } this.spawnType(tPieceAt(this.idx++)); }
  spawnType(k) {
    const p = { k, x: k === 'O' ? 4 : 3, y: 0, r: 0 };
    if (!this.valid(p)) { this.die(); return; }
    if (this.valid({ ...p, y: 1 })) p.y = 1;
    this.cur = p; this.phase = 'drop'; this.acc = 0; this.lockT = 0; this.resets = 0; this.lowest = p.y; this.lastRot = false; this.soft = false;
    if (!this.human) this.planAI();
  }
  die() {
    if (this.dead) return;
    this.dead = true; this.phase = 'dead'; this.cur = null;
    if (game.net && !this.remote) gsend({ t: 'dead' });
  }
  hold() {
    if (this.phase !== 'drop' || !this.canHold) return;
    const k = this.cur.k;
    if (this.holdK) { const nk = this.holdK; this.holdK = k; this.spawnType(nk); }
    else { this.holdK = k; this.spawnType(tPieceAt(this.idx++)); }
    this.canHold = false; if (this.human) sfx.hold();
  }
  onGround() { return !this.valid({ ...this.cur, y: this.cur.y + 1 }); }
  lockReset() { if (this.onGround() && this.resets < 15) { this.lockT = 0; this.resets++; } }
  moveX(d) {
    if (this.phase !== 'drop') return false;
    const p = { ...this.cur, x: this.cur.x + d };
    if (!this.valid(p)) return false;
    this.cur = p; this.lastRot = false; this.lockReset(); if (this.human) sfx.move(); return true;
  }
  rotate(dir) {
    if (this.phase !== 'drop' || this.cur.k === 'O') return false;
    const from = this.cur.r, to = (from + dir + 4) % 4, kicks = (this.cur.k === 'I' ? K_I : K_JLSTZ)[`${from}>${to}`];
    for (let i = 0; i < kicks.length; i++) {
      const p = { ...this.cur, r: to, x: this.cur.x + kicks[i][0], y: this.cur.y - kicks[i][1] };
      if (this.valid(p)) { this.cur = p; this.lastRot = true; this.lastKick = i; this.lockReset(); if (this.human) sfx.rot(); return true; }
    }
    return false;
  }
  hardDrop() {
    if (this.phase !== 'drop') return;
    const y0 = this.cur.y; let n = 0;
    while (this.valid({ ...this.cur, y: this.cur.y + 1 })) { this.cur.y++; n++; }
    if (n > 0) this.lastRot = false;
    if (this.human) this.score += n * 2;
    if (n > 1) { const xs = this.cells(this.cur).map(c => c[0]); this.trails.push({ x0: Math.min(...xs), x1: Math.max(...xs) + 1, y0: y0, y1: this.cur.y, age: 0, col: TCOL[this.cur.k] }); }
    this.lock(true);
  }

  update(dt, active) {
    this.updateFx(dt);
    if (!active || this.dead) return;
    if (this.remote) {
      if (this.phase === 'clear') this.updateClear(dt);
      if (this.phase === 'wait' && this.queue.length) this.applyEvent(this.queue.shift());
      return;
    }
    if (!game.vs && game.soloMode === 'ultra' && performance.now() - game.t0 >= 180000 && !this.done) { this.finish(); return; }
    if (this.phase === 'drop') this.updateDrop(dt);
    else if (this.phase === 'clear') this.updateClear(dt);
    else if (this.phase === 'are') { this.areT -= dt; if (this.areT <= 0) this.spawn(); }
  }
  updateFx(dt) {
    for (const q of this.particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 0.0009 * dt; q.life -= dt; }
    this.particles = this.particles.filter(q => q.life > 0);
    for (const t of this.texts) t.age += dt;
    this.texts = this.texts.filter(t => t.age < t.dur);
    for (const t of this.trails) t.age += dt;
    this.trails = this.trails.filter(t => t.age < 180);
    this.shake = Math.max(0, this.shake - dt * 0.03); this.flash = Math.max(0, this.flash - dt * 0.003);
    this.trayBump = Math.max(0, this.trayBump - dt * 0.004); this.hit = Math.max(0, this.hit - dt * 0.0025);
  }
  updateDrop(dt) {
    if (this.human) {
      const inp = game.inp[this.pi || 0];
      this.soft = inp.down;
      const dir = (inp.left ? -1 : 0) + (inp.right ? 1 : 0);
      if (dir !== this.lastDir) { this.lastDir = dir; this.das = 0; this.rep = 0; if (dir) this.moveX(dir); }
      else if (dir) { this.das += dt; if (this.das > 167) { this.rep += dt; while (this.rep >= 33) { this.rep -= 33; if (!this.moveX(dir)) { this.rep = 0; break; } } } }
    } else { this.aiAct(dt); if (this.phase !== 'drop') return; }
    const iv = this.soft ? Math.max(15, this.fallIv() / 20) : this.fallIv();
    this.acc += dt;
    while (this.acc >= iv) {
      this.acc -= iv;
      if (this.valid({ ...this.cur, y: this.cur.y + 1 })) {
        this.cur.y++; this.lastRot = false; if (this.soft && this.human) this.score++;
        if (this.cur.y > this.lowest) { this.lowest = this.cur.y; this.resets = 0; }
      } else { this.acc = 0; break; }
    }
    if (this.onGround()) { this.lockT += dt; if (this.lockT >= 500) this.lock(false); }
    else this.lockT = 0;
  }

  // T스핀 판정: 3코너 규칙, 앞쪽 두 칸이 모두 막혔거나 5번째 킥이면 정식, 아니면 미니
  tspinType() {
    const p = this.cur; if (p.k !== 'T' || !this.lastRot) return 0;
    const occ = (x, y) => x < 0 || x >= TW || y >= TH || (y >= 0 && this.grid[y][x]);
    const C = [[p.x, p.y], [p.x + 2, p.y], [p.x + 2, p.y + 2], [p.x, p.y + 2]];   // 왼위 오위 오아래 왼아래
    const filled = C.map(([x, y]) => occ(x, y));
    if (filled.filter(Boolean).length < 3) return 0;
    const front = [[0, 1], [1, 2], [2, 3], [3, 0]][p.r];
    return (filled[front[0]] && filled[front[1]]) || this.lastKick === 4 ? 2 : 1;
  }
  lock(hard) {
    const p = this.cur, ts = this.tspinType(), cells = this.cells(p);
    if (cells.every(([, y]) => y < TH - TVIS)) { for (const [x, y] of cells) this.grid[y][x] = TKEYS.indexOf(p.k); this.die(); return; }
    for (const [x, y] of cells) this.grid[y][x] = TKEYS.indexOf(p.k);
    this.cur = null; this.canHold = true;
    const rows = []; for (let r = 0; r < TH; r++) if (this.grid[r].every(v => v)) rows.push(r);
    const filledAfter = this.grid.reduce((a, row, r) => a + (rows.includes(r) ? 0 : row.filter(Boolean).length), 0);
    const pc = rows.length > 0 && filledAfter === 0;
    if (game.net && !this.remote) gsend({ t: 'tlock', g: this.encode(), rows, fx: this.lockFx(rows.length, ts, pc, true) });
    this.shake = Math.max(this.shake, hard ? 2.5 : 0);
    if (rows.length) {
      this.ren++; this.maxChain = Math.max(this.maxChain, this.ren);
      const amt = this.attackAmount(rows.length, ts, pc);
      this.scoreClear(rows.length, ts, pc);
      this.pops += rows.length; this.lines += rows.length;
      if (!game.vs && game.soloMode !== 'sprint' && game.soloMode !== 'ultra') this.level = Math.min(15, 1 + Math.floor(this.lines / 10));
      if (!game.vs && ((game.soloMode === 'sprint' && this.lines >= 40) || (game.soloMode === 'marathon' && this.lines >= 150))) this.finishAfterClear = true;
      if (rows.length === 4) this.chains2++; if (ts) this.doubles++; if (pc) this.allClears++;
      this.showLockFx(this.lockFx(rows.length, ts, pc, false));
      const cy = TGY + (rows.reduce((a, r) => a + r, 0) / rows.length - (TH - TVIS) + 0.5) * TC;
      this.deliver(amt, this.ox + SW / 2, this.oy + cy);
      this.clearRows = rows; this.clearT = 0; this.phase = 'clear';
      sfx.tclear(rows.length, ts);
    } else {
      this.ren = 0;
      if (ts) { this.doubles++; this.showLockFx(this.lockFx(0, ts, false, false)); this.score += ts === 2 ? 400 : 100; }
      this.releaseGauge();
      sfx.land();
      this.afterLock();
    }
  }
  lockFx(lines, ts, pc, pre) {
    const labs = [];
    if (ts === 2) labs.push('T스핀' + (['', ' 싱글', ' 더블', ' 트리플'][lines] || ''));
    else if (ts === 1) labs.push('T스핀 미니');
    else if (lines === 4) labs.push('테트리스!');
    const b2b = (lines === 4 || (ts && lines)) && (pre ? this.b2b : this.b2bWas);
    return { labs, b2b: !!b2b, ren: lines ? (pre ? this.ren + 1 : this.ren) : 0, pc };
  }
  showLockFx(fx) {
    let y = FH * 0.42;
    const push = (txt, col, size) => { this.texts.push({ txt, x: SW / 2, y, age: 0, dur: 1300, col, size }); y += size + 6; };
    if (fx.pc) push('퍼펙트 클리어!', '#ffd93d', 34);
    for (const l of fx.labs) push(l, l.startsWith('T') ? '#d8a6ff' : '#7ff0ff', 32);
    if (fx.b2b) push('백투백', '#ffb347', 24);
    if (fx.ren >= 2) push(`${fx.ren - 1} REN`, '#ffffff', 26);
  }
  scoreClear(lines, ts, pc) {
    let s = ts === 2 ? [400, 800, 1200, 1600][lines] : [0, 100, 300, 500, 800][lines] + (ts === 1 ? 100 : 0);
    if (this.b2bWas && (lines === 4 || ts)) s *= 1.5;
    s += 50 * Math.max(0, this.ren - 1); if (pc) s += [0, 800, 1000, 1800, 2000][lines];
    this.score += Math.round(s * (game.vs ? 1 : this.level));
  }
  attackAmount(lines, ts, pc) {
    const vsP = this.vsPuyo();
    let base = ts === 2 ? (vsP ? [0, 2, 3, 4] : [0, 2, 4, 6])[lines] : [0, 0, 1, 2, 4][lines];
    const b2bable = lines === 4 || (ts > 0 && lines > 0);
    this.b2bWas = this.b2b;
    let bonus = 0;
    if (b2bable) { if (this.b2b) bonus = 1; this.b2b = true; } else this.b2b = false;
    const combo = (vsP ? TVP_COMBO : TVT_COMBO)[Math.min(this.ren, 20)] || 0;
    if (pc) return vsP ? 6 + combo : 10;
    return base + bonus + combo;
  }
  // 공격 전달: 내 쪽 예고를 먼저 상쇄 → 테트리스 상대면 바로 줄로, 뿌요 상대면 게이지에 모음
  deliver(amount, x, y) {
    if (!game.vs || this.remote || amount <= 0) return;
    amount = Math.floor(amount * tMarginMul());
    let n = amount;
    if (!this.human) { this.atkCarry += amount * this.ai.atk; n = Math.floor(this.atkCarry); this.atkCarry -= n; }
    if (n <= 0) return;
    this.sent += n;
    const c = Math.min(this.pending, n), rx = x - this.ox, ry = y - this.oy;
    if (c > 0) { this.pending -= c; n -= c; game.launch(this, this, c, x, y, 'offset'); if (game.net) gsend({ t: 'off', n: c, x: rx, y: ry, ch: this.ren }); }
    if (n <= 0) return;
    if (this.vsPuyo()) { this.gauge = Math.min(60, this.gauge + n); sfx.gauge(); }
    else { game.launch(this, this.opp, n, x, y, 'attack'); if (game.net) gsend({ t: 'atk', n, x: rx, y: ry, ch: this.ren }); }
  }
  releaseGauge() {
    if (!this.gauge) return;
    let g = this.gauge; this.gauge = 0;
    const c = Math.min(g, this.pending); g -= c; this.pending -= c;
    if (g <= 0) return;
    const n = T2P[Math.min(g, 60)], x = this.ox + TGX / 2, y = this.oy + FH / 2;
    game.launch(this, this.opp, n, x, y, 'attack', Math.min(8, Math.ceil(g / 3)));
    if (game.net) gsend({ t: 'atk', n, x: x - this.ox, y: y - this.oy, ch: Math.min(8, Math.ceil(g / 3)) });
  }
  updateClear(dt) {
    this.clearT += dt;
    if (this.clearT < 260) return;
    const rows = this.clearRows;
    for (const r of rows) {
      for (let c = 0; c < TW; c++) {
        const v = this.grid[r][c]; if (!v) continue;
        const px = TGX + (c + 0.5) * TC, py = TGY + (r - (TH - TVIS) + 0.5) * TC;
        for (let i = 0; i < 2; i++) { const a = Math.random() * Math.PI * 2, s = 0.06 + Math.random() * 0.22;
          this.particles.push({ x: px, y: py, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.1, life: 400 + Math.random() * 300, max: 700, r: 2 + Math.random() * 3, col: i ? TCOL[TKEYS[v]] : '#fff' }); }
      }
    }
    this.grid = this.grid.filter((_, r) => !rows.includes(r));
    while (this.grid.length < TH) this.grid.unshift(Array(TW).fill(0));
    this.clearRows = []; this.flash = Math.min(0.4, 0.1 + rows.length * 0.07); this.shake = Math.max(this.shake, rows.length * 1.2);
    if (this.remote) { this.phase = 'wait'; return; }
    if (this.finishAfterClear) { this.finish(); return; }
    this.afterLock();
  }
  finish() { this.done = true; this.doneAt = performance.now(); this.phase = 'done'; this.cur = null; }
  afterLock() {
    this.insertGarbage();
    if (this.dead) return;
    this.phase = 'are'; this.areT = 60;
  }
  insertGarbage() {
    const n = Math.min(7, this.pending); if (n <= 0) return;
    this.pending -= n;
    for (let r = 0; r < n; r++) if (this.grid[r].some(Boolean)) { this.die(); return; }
    if (Math.random() < 0.9) this.holeCol = rnd(TW);
    const rows = [];
    for (let i = 0; i < n; i++) {
      if (i > 0 && Math.random() < 0.3) this.holeCol = rnd(TW);
      rows.push(Array.from({ length: TW }, (_, c) => c === this.holeCol ? 0 : 8));
    }
    this.grid = this.grid.slice(n).concat(rows);
    this.shake = Math.max(this.shake, 3 + n); sfx.garb();
    if (game.net && !this.remote) gsend({ t: 'tgarb', g: this.encode() });
  }
  // 온라인: 상대 테트리스 화면 재현
  applyEvent(ev) {
    if (ev.t === 'tlock') {
      this.decode(ev.g);
      if (ev.fx) this.showLockFx(ev.fx);
      if (ev.rows && ev.rows.length) { this.clearRows = ev.rows; this.clearT = 0; this.phase = 'clear'; sfx.tclear(ev.rows.length, 0); }
    } else if (ev.t === 'tgarb') { this.decode(ev.g); this.shake = Math.max(this.shake, 4); }
  }

  /* ---------- CPU: 놓을 수 있는 모든 자리를 평가(높이·구멍·울퉁불퉁함·지운 줄) ---------- */
  evalPlace(p) {
    const g = this.grid.map(r => r.slice());
    for (const [x, y] of this.cells(p)) g[y][x] = 1;
    const kept = g.filter(r => !r.every(Boolean)), lines = TH - kept.length;
    while (kept.length < TH) kept.unshift(Array(TW).fill(0));
    const h = []; let holes = 0;
    for (let c = 0; c < TW; c++) {
      let r = 0; while (r < TH && !kept[r][c]) r++;
      h.push(TH - r);
      for (let y = r + 1; y < TH; y++) if (!kept[y][c]) holes++;
    }
    const agg = h.reduce((a, b) => a + b, 0), maxH = Math.max(...h);
    let bump = 0; for (let c = 0; c < TW - 1; c++) bump += Math.abs(h[c] - h[c + 1]);
    let s = -0.51 * agg + 0.76 * lines - 0.36 * holes * 2 - 0.18 * bump;
    if (maxH > 13) s -= (maxH - 13) * 3;
    if (lines === 4) s += 4; else if (lines > 0 && maxH < 9 && this.ai.hard) s -= 0.5;
    return s;
  }
  planAI() {
    const opts = [{ k: this.cur.k, hold: false }];
    if (this.ai.holdUse && this.canHold) { const hk = this.holdK || tPieceAt(this.idx); if (hk !== this.cur.k) opts.push({ k: hk, hold: true }); }
    let best = null, bs = -Infinity; const cands = [];
    for (const o of opts) for (let r = 0; r < (o.k === 'O' ? 1 : 4); r++) for (let x = -2; x < TW; x++) {
      const p = { k: o.k, x, y: 1, r };
      if (!this.valid(p)) { p.y = 0; if (!this.valid(p)) continue; }
      while (this.valid({ ...p, y: p.y + 1 })) p.y++;
      const sc = this.evalPlace(p) + (Math.random() - 0.5) * this.ai.noise;
      cands.push({ hold: o.hold, r, x });
      if (sc > bs) { bs = sc; best = { hold: o.hold, r, x }; }
    }
    if (cands.length && Math.random() < this.ai.miss) best = cands[rnd(cands.length)];
    this.tgt = best; this.stuck = 0;
  }
  aiAct(dt) {
    this.aiT -= dt; if (this.aiT > 0 || !this.tgt) return;
    this.aiT = this.ai.delay * (0.7 + Math.random() * 0.6);
    const t = this.tgt, p = this.cur;
    if (t.hold && this.canHold) { const keep = { ...t, hold: false }; this.hold(); this.tgt = keep; return; }
    if (this.stuck > 4) { this.hardDrop(); return; }
    if (p.r !== t.r) { const d = (t.r - p.r + 4) % 4; if (!this.rotate(d === 3 ? -1 : 1)) this.stuck++; return; }
    if (p.x !== t.x) { if (!this.moveX(p.x < t.x ? 1 : -1)) this.stuck++; return; }
    if (this.ai.hard) this.hardDrop(); else this.soft = true;
  }

  /* ---------- 그리기 ---------- */
  draw(t) {
    const c = ctx, shx = this.shake ? (Math.random() - 0.5) * this.shake : 0, shy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const tone = this.tone || TONES.red;
    c.save();
    const GW = TW * TC, gx = this.ox + TGX;
    slab(c, gx + 4, 2, GW - 8, 32, tone, 4);
    outlined(c, this.name, this.ox + SW / 2, 19, 20, '#fff', tone.d, 6);
    const sy = this.oy + FH + 16;
    slab(c, gx - 8, sy, GW + 16, 50, TONES.white, 4);
    c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = '#6d6b80'; c.font = '15px ' + FONT();
    c.fillText('점수', gx + 14, sy + 26);
    c.fillStyle = '#22212e'; c.font = '26px ' + HFONT(); c.fillText(this.score.toLocaleString(), gx + 50, sy + 27);
    slab(c, gx + GW - 104, sy + 9, 92, 32, tone, 3);
    outlined(c, `최고 ${this.maxChain} REN`, gx + GW - 58, sy + 26, 15, '#fff', tone.d, 4);
    c.restore();
    this.drawTray(c);

    c.save(); c.translate(this.ox + shx, this.oy + shy);
    const B = 8;
    c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillRect(TGX - B, -B + 6, GW + B * 2, FH + B * 2);
    c.fillStyle = tone.d; c.fillRect(TGX - B, -B, GW + B * 2, FH + B * 2);
    c.fillStyle = '#fff'; c.fillRect(TGX - 4, -4, GW + 8, FH + 8);
    // 공격 게이지(뿌요 상대일 때): 테두리 왼쪽 바깥, 20칸마다 초록→노랑→빨강
    if (this.vsPuyo() && this.gauge > 0) {
      const lap = Math.floor((this.gauge - 1) / 20), k = ((this.gauge - 1) % 20 + 1) / 20, gx0 = TGX - B - 9;
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(gx0, 0, 7, FH);
      if (lap > 0) { c.fillStyle = ['#39c63c', '#ffc915', '#ff4559'][lap - 1]; c.fillRect(gx0, 0, 7, FH); }
      c.fillStyle = ['#39c63c', '#ffc915', '#ff4559'][Math.min(2, lap)]; c.fillRect(gx0, FH * (1 - k), 7, FH * k);
      c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(gx0 + 1, FH * (1 - k), 2, FH * k);
    }
    c.save(); c.beginPath(); c.rect(TGX, 0, GW, FH); c.clip();
    c.fillStyle = '#1b1548'; c.fillRect(TGX, TGY, GW, TVIS * TC);
    c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = 1;
    for (let i = 1; i < TW; i++) { c.beginPath(); c.moveTo(TGX + i * TC, TGY); c.lineTo(TGX + i * TC, TGY + TVIS * TC); c.stroke(); }
    for (let i = 1; i < TVIS; i++) { c.beginPath(); c.moveTo(TGX, TGY + i * TC); c.lineTo(TGX + TW * TC, TGY + i * TC); c.stroke(); }
    const sY = r => TGY + (r - (TH - TVIS)) * TC;
    for (const tr of this.trails) {
      const a = 1 - tr.age / 180, g = c.createLinearGradient(0, sY(tr.y0), 0, sY(tr.y1) + TC);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(255,255,255,${0.35 * a})`);
      c.fillStyle = g; c.fillRect(TGX + tr.x0 * TC, sY(tr.y0), (tr.x1 - tr.x0) * TC, Math.max(0, sY(tr.y1) - sY(tr.y0) + TC));
    }
    for (let r = TH - TVIS; r < TH; r++) for (let q = 0; q < TW; q++) {
      const v = this.grid[r][q]; if (!v) continue;
      drawBlock(c, TGX + q * TC, sY(r), TC, TCOL[TKEYS[v]]);
    }
    if (this.phase === 'clear') {
      const k = this.clearT / 260;
      for (const r of this.clearRows) {
        c.fillStyle = `rgba(255,255,255,${0.85 * (1 - k)})`; c.fillRect(TGX, sY(r), TW * TC, TC);
        c.fillStyle = `rgba(255,255,255,${0.9})`; c.fillRect(TGX + TW * TC * k / 2, sY(r) + TC * 0.35, TW * TC * (1 - k), TC * 0.3);
      }
    }
    const p = this.remote ? (this.phase === 'wait' && this.net ? this.net : null) : (this.phase === 'drop' ? this.cur : null);
    if (p && TROT[p.k]) {
      const gp = { ...p }; while (this.valid({ ...gp, y: gp.y + 1 })) gp.y++;
      for (const [x, y] of this.cells(gp)) if (y >= TH - TVIS) {
        c.save(); c.globalAlpha = 0.35; c.strokeStyle = TCOL[p.k]; c.lineWidth = 2; rr(c, TGX + x * TC + 3, sY(y) + 3, TC - 6, TC - 6, 4); c.stroke();
        c.globalAlpha = 0.12; c.fillStyle = TCOL[p.k]; c.fill(); c.restore();
      }
      for (const [x, y] of this.cells(p)) if (y >= TH - TVIS - 1) drawBlock(c, TGX + x * TC, sY(y), TC, TCOL[p.k]);
    }
    for (const q of this.particles) { c.globalAlpha = clamp(q.life / q.max, 0, 1); c.fillStyle = q.col; c.beginPath(); c.arc(q.x, q.y, q.r, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1;
    if (this.flash > 0) { c.fillStyle = `rgba(255,255,255,${this.flash})`; c.fillRect(TGX, 0, GW, FH); }
    if (this.hit > 0) { c.strokeStyle = `rgba(255,79,106,${this.hit})`; c.lineWidth = 10; c.strokeRect(TGX, 0, GW, FH); }
    for (const tx of this.texts) {
      const k = tx.age / tx.dur, e = tx.age < 200 ? 1 - Math.pow(1 - tx.age / 200, 3) : 1;
      c.save(); c.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      c.translate(tx.x, tx.y - tx.age * 0.02); c.scale(0.5 + 0.5 * e, 0.5 + 0.5 * e);
      outlined(c, tx.txt, 0, 0, tx.size, tx.col, '#2a1d6b', 8); c.restore();
    }
    if (this.dead || this.won) {
      c.fillStyle = 'rgba(20,16,50,0.45)'; c.fillRect(TGX, 0, GW, FH);
      const bt = this.won ? TONES.yellow : game.vs ? TONES.blue : TONES.green;
      c.save(); c.translate(SW / 2, FH / 2); c.rotate(-0.06);
      slab(c, -GW / 2 - 20, -42, GW + 40, 84, bt, 6);
      outlined(c, this.won ? '승리!' : game.vs ? '패배' : '게임 오버', 0, 2, 50, '#fff', bt.d, 9);
      c.restore();
    }
    c.restore(); c.restore();
  }
}
TField.prototype.drawTray = Field.prototype.drawTray;
