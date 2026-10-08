// 퓨전 규칙: 뿌요와 테트리미노가 한 판에
'use strict';

/* ================= 퓨전(우리 게임 버전) =================
   - 모두 폭 10 · 높이 20(+숨김 2줄)의 퓨전 판 하나로 겨룸. 뿌요 쌍과 테트리미노가 섞여서 나옴(순서는 모두 같음)
   - 테트리미노는 뿌요·방해뿌요를 뚫고 떨어지고, 놓이면 겹친 뿌요는 그 위로 밀려 올라감
   - 뿌요는 무엇에든 닿으면 멈추고, 놓인 뒤 아래가 비면 떨어짐(테트리미노 블록은 떨어지지 않음)
   - 한 줄이 블록·뿌요로 가득 차면 지워지고(방해뿌요가 섞인 줄은 안 지워짐), 같은 색 뿌요 4개 이상이 이어지면 터짐. 둘 다 연쇄로 이어짐
   - 공격: 뿌요 연쇄는 통상 점수표로, 지운 줄은 줄 수에 따라 방해뿌요로 바꿔 보냄. 받은 방해뿌요는 위에서 떨어짐
   - 온라인·리플레이: 판이 바뀔 때마다 판 전체를 보내 그대로 보여줌 */
const FW_W = TW, FW_H = TH, FW_VIS = TVIS;          // 테트리스 판과 같은 크기
const FU_LINE_ATK = [0, 1, 3, 5, 8, 10, 12, 14, 16, 18, 20];   // 한 번에 지운 줄 → 방해뿌요(+연쇄 보너스)
let fuTypes = [], fuRng = Math.random;
function fuSeed(seed) { fuTypes = []; fuRng = makeRng((seed ^ 0x51F15EED) >>> 0); }
// i번째 조각: 뿌요 쌍 또는 테트리미노(모두 같은 순서)
function fuPieceAt(i) {
  while (fuTypes.length <= i) fuTypes.push(fuRng() < 0.5 ? 'p' : 'm');
  let pi = 0, mi = 0; for (let j = 0; j < i; j++) fuTypes[j] === 'p' ? pi++ : mi++;
  return fuTypes[i] === 'p' ? { t: 'p', ab: pairAt(pi) } : { t: 'm', k: tPieceAt(mi) };
}
const fuEnc = v => !v ? '0' : v.k === 'p' ? String(v.c) : v.k === 'g' ? '6' : String.fromCharCode(64 + v.c);   // 1~4 뿌요 · 6 방해 · A~G 블록
const fuDec = ch => ch === '0' ? 0 : ch === '6' ? { k: 'g' } : ch >= 'A' ? { k: 'm', c: ch.charCodeAt(0) - 64 } : { k: 'p', c: +ch };
const isPuyoish = v => v && (v.k === 'p' || v.k === 'g');

/* ---------- 판 계산(실제 진행과 CPU가 같이 씀) ---------- */
function fuGravity(g) {                    // 뿌요·방해뿌요만 아래로(블록은 고정). 움직였으면 true
  let moved = false;
  for (let c = 0; c < FW_W; c++) for (let r = FW_H - 2; r >= 0; r--) {
    if (!isPuyoish(g[r][c])) continue;
    let y = r; while (y + 1 < FW_H && !g[y + 1][c]) y++;
    if (y !== r) { g[y][c] = g[r][c]; g[r][c] = 0; moved = true; }
  }
  return moved;
}
// 줄이 블록·뿌요로 가득 차면 지워짐. 방해뿌요가 섞인 줄은 안 지워짐(옆 뿌요를 터뜨려 없애야 함)
function fuFullRows(g) { const out = []; for (let r = 0; r < FW_H; r++) if (g[r].every(v => v && v.k !== 'g')) out.push(r); return out; }
function fuGroups(g) {
  const seen = g.map(r => r.map(() => false)), out = [];
  for (let r = 0; r < FW_H; r++) for (let c = 0; c < FW_W; c++) {
    const v = g[r][c]; if (!v || v.k !== 'p' || seen[r][c]) continue;
    const st = [[r, c]], cells = []; seen[r][c] = true;
    while (st.length) {
      const [y, x] = st.pop(); cells.push([y, x]);
      for (let d = 0; d < 4; d++) { const ny = y + DY[d], nx = x + DX[d];
        if (ny >= 0 && ny < FW_H && nx >= 0 && nx < FW_W && !seen[ny][nx] && g[ny][nx] && g[ny][nx].k === 'p' && g[ny][nx].c === v.c) { seen[ny][nx] = true; st.push([ny, nx]); } }
    }
    if (cells.length >= 4) out.push({ c: v.c, cells });
  }
  return out;
}
// 터질 뿌요 + 옆 방해뿌요
function fuPopSet(g, gs) {
  const set = new Set();
  for (const gr of gs) for (const [y, x] of gr.cells) {
    set.add(y * FW_W + x);
    for (let d = 0; d < 4; d++) { const ny = y + DY[d], nx = x + DX[d]; if (ny >= 0 && ny < FW_H && nx >= 0 && nx < FW_W && g[ny][nx] && g[ny][nx].k === 'g') set.add(ny * FW_W + nx); }
  }
  return set;
}
function fuRemoveRows(g, rows) {
  const kept = g.filter((_, r) => !rows.includes(r));
  while (kept.length < FW_H) kept.unshift(Array(FW_W).fill(0));
  return kept;
}
// 끝까지 한 번에 계산: { g, chain, lines, units }
function fuResolve(g0) {
  let g = g0.map(r => r.slice()), chain = 0, lines = 0, units = 0;
  for (let guard = 0; guard < 40; guard++) {
    fuGravity(g);
    const rows = fuFullRows(g);
    if (rows.length) { chain++; lines += rows.length; units += FU_LINE_ATK[Math.min(rows.length, FU_LINE_ATK.length - 1)] + chain; g = fuRemoveRows(g, rows); continue; }
    const gs = fuGroups(g); if (!gs.length) break;
    chain++;
    let total = 0, bonus = CHAIN_POWER[Math.min(chain, CHAIN_POWER.length - 1)]; const cols = new Set();
    for (const gr of gs) { total += gr.cells.length; bonus += groupBonus(gr.cells.length); cols.add(gr.c); }
    bonus += COLOR_BONUS[Math.min(cols.size, 5)];
    units += Math.floor(10 * total * clamp(bonus, 1, 999) / 70);
    for (const k of fuPopSet(g, gs)) g[Math.floor(k / FW_W)][k % FW_W] = 0;
  }
  return { g, chain, lines, units };
}
// 블록을 놓을 때 겹친 뿌요를 위로 밀어 올림
function fuPlaceMino(g, cells, c) {
  const pushed = {};
  for (const [x, y] of cells) { if (isPuyoish(g[y][x])) (pushed[x] = pushed[x] || []).push(g[y][x]); g[y][x] = { k: 'm', c }; }
  let over = false;
  for (const x in pushed) {
    const col = +x, top = Math.min(...cells.filter(q => q[0] === col).map(q => q[1]));
    // 블록 바로 위부터, 그 위에 있던 뿌요들까지 함께 위로 쌓음
    const above = []; for (let y = top - 1; y >= 0; y--) { if (isPuyoish(g[y][col])) { above.push(g[y][col]); g[y][col] = 0; } else if (g[y][col]) break; }
    const stack = pushed[col].concat(above); let y = top - 1;
    for (const v of stack) { if (y < 0) { over = true; break; } g[y][col] = v; y--; }
  }
  return over;
}
const fuMinoCells = p => TROT[p.k][p.r].map(([dx, dy]) => [p.x + dx, p.y + dy]);
const fuMinoFits = (g, p) => fuMinoCells(p).every(([x, y]) => x >= 0 && x < FW_W && y >= 0 && y < FW_H && !(g[y][x] && g[y][x].k === 'm'));   // 블록끼리만 부딪힘
const fuPairCells = p => [[p.x, p.y], [p.x + DX[p.o], p.y + DY[p.o]]];
const fuPairFits = (g, p) => fuPairCells(p).every(([x, y]) => x >= 0 && x < FW_W && y >= 0 && y < FW_H && !g[y][x]);

class FField {
  constructor(ox, oy, human, name) { this.kind = 'fusion'; this.ox = ox; this.oy = oy; this.human = human; this.name = name; this.opp = null; this.ai = { delay: 170, noise: 2, miss: 0.08, atk: 0.6 }; this.reset(); }
  get fw() { return SW; }
  get sx() { return this.ox; }
  get chain() { return this.chainN; }
  reset() {
    this.grid = Array.from({ length: FW_H }, () => Array(FW_W).fill(0));
    this.idx = 0; this.score = 0; this.chainN = 0; this.maxChain = 0; this.pending = 0; this.carry = 0; this.atkCarry = 0;
    this.pops = 0; this.chains2 = 0; this.allClears = 0; this.sent = 0; this.doubles = 0; this.lines = 0; this.level = 1;
    this.phase = 'none'; this.cur = null; this.particles = []; this.texts = []; this.trails = []; this.shake = 0; this.flash = 0; this.hit = 0; this.trayBump = 0;
    this.dead = false; this.won = false; this.soft = false; this.lastDir = 0; this.das = 0; this.rep = 0; this.acc = 0; this.lockT = 0; this.resets = 0;
    this.queue = []; this.net = null; this.aiT = 0; this.tgt = null; this.resT = 0; this.flashCells = null; this.sentNow = 0;
  }
  encode() { return this.grid.map(r => r.map(fuEnc).join('')).join(''); }
  decode(s) { for (let r = 0; r < FW_H; r++) for (let c = 0; c < FW_W; c++) this.grid[r][c] = fuDec(s[r * FW_W + c] || '0'); }
  fallIv() { return Math.max(90, 900 * Math.pow(0.88, Math.floor((game.el || 0) / 30000))); }
  sync() { emit(this, { t: 'fg', g: this.encode() }); }

  spawn() {
    if (this.remote) { this.phase = 'wait'; this.cur = null; return; }
    const pc = fuPieceAt(this.idx++);
    const p = pc.t === 'p' ? { t: 'p', x: 4, y: 1, o: 0, a: pc.ab[0], b: pc.ab[1] } : { t: 'm', k: pc.k, x: pc.k === 'O' ? 4 : 3, y: 0, r: 0 };
    if (!this.fits(p) || (p.t === 'm' && fuMinoCells(p).some(([x, y]) => this.grid[y][x]))) { this.die(); return; }
    this.cur = p; this.phase = 'drop'; this.acc = 0; this.lockT = 0; this.resets = 0; this.soft = false; this.chainN = 0;
    if (!this.human) this.planAI();
  }
  fits(p) { return p.t === 'p' ? fuPairFits(this.grid, p) : fuMinoFits(this.grid, p); }
  die() { if (this.dead) return; this.dead = true; this.phase = 'dead'; this.cur = null; if (!this.remote) emit(this, { t: 'dead' }); }
  moveX(d) { if (this.phase !== 'drop') return false; const p = { ...this.cur, x: this.cur.x + d }; if (!this.fits(p)) return false; this.cur = p; if (this.onGround()) this.lockReset(); if (this.human) sfx.move(); return true; }
  rotate(dir) {
    if (this.phase !== 'drop') return false;
    const q = this.cur;
    if (q.t === 'p') {
      const o = (q.o + dir + 4) % 4;
      for (const p of [{ ...q, o }, { ...q, o, x: q.x - DX[o], y: q.y - DY[o] }]) if (this.fits(p)) { this.cur = p; if (this.human) sfx.rot(); return true; }
      return false;
    }
    if (q.k === 'O') return false;
    const to = (q.r + dir + 4) % 4, kicks = (q.k === 'I' ? K_I : K_JLSTZ)[`${q.r}>${to}`];
    for (const [kx, ky] of kicks) { const p = { ...q, r: to, x: q.x + kx, y: q.y - ky }; if (this.fits(p)) { this.cur = p; this.lockReset(); if (this.human) sfx.rot(); return true; } }
    return false;
  }
  onGround() { return !this.fits({ ...this.cur, y: this.cur.y + 1 }); }
  lockReset() { if (this.resets < 15) { this.lockT = 0; this.resets++; } }
  hardDrop() { if (this.phase !== 'drop') return; let n = 0; while (!this.onGround()) { this.cur.y++; n++; } if (this.human) this.score += n * 2; this.lock(); }

  update(dt, active) {
    for (const q of this.particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 0.0009 * dt; q.life -= dt; }
    this.particles = this.particles.filter(q => q.life > 0);
    for (const t of this.texts) t.age += dt; this.texts = this.texts.filter(t => t.age < t.dur);
    this.shake = Math.max(0, this.shake - dt * 0.03); this.flash = Math.max(0, this.flash - dt * 0.003);
    this.trayBump = Math.max(0, this.trayBump - dt * 0.004); this.hit = Math.max(0, this.hit - dt * 0.0025);
    if (!active || this.dead) return;
    if (this.remote) { while (this.queue.length) this.applyEvent(this.queue.shift()); return; }
    if (this.phase === 'drop') this.updateDrop(dt);
    else if (this.phase === 'resolve') { this.resT -= dt; if (this.resT <= 0) this.step(); }
  }
  updateDrop(dt) {
    if (this.human) {
      const inp = game.inp[this.pi || 0];
      this.soft = inp.down;
      const dir = (inp.left ? -1 : 0) + (inp.right ? 1 : 0);
      if (dir !== this.lastDir) { this.lastDir = dir; this.das = 0; this.rep = 0; if (dir) this.moveX(dir); }
      else if (dir) { this.das += dt; if (this.das > 170) { this.rep += dt; while (this.rep >= 40) { this.rep -= 40; this.moveX(dir); } } }
    } else { this.aiAct(dt); if (this.phase !== 'drop') return; }
    const iv = this.soft ? 30 : this.fallIv();
    this.acc += dt;
    while (this.acc >= iv) { this.acc -= iv; if (!this.onGround()) { this.cur.y++; if (this.soft && this.human) this.score++; } else { this.acc = 0; break; } }
    if (this.onGround()) { this.lockT += dt; if (this.lockT >= (this.cur.t === 'p' ? 250 : 500)) this.lock(); } else this.lockT = 0;
  }
  lock() {
    const p = this.cur; this.cur = null;
    if (p.t === 'p') { const [[x1, y1], [x2, y2]] = fuPairCells(p); this.grid[y1][x1] = { k: 'p', c: p.a }; this.grid[y2][x2] = { k: 'p', c: p.b }; }
    else if (fuPlaceMino(this.grid, fuMinoCells(p), TKEYS.indexOf(p.k))) { this.sync(); this.die(); return; }
    sfx.land(); this.chainN = 0; this.sentNow = 0;
    this.sync();
    this.phase = 'resolve'; this.resT = 60;
  }
  // 한 단계씩: 떨어뜨리기 → 줄 지우기 → 뿌요 터뜨리기
  step() {
    if (fuGravity(this.grid)) { this.sync(); this.resT = 90; return; }
    const rows = fuFullRows(this.grid);
    if (rows.length) {
      this.chainN++; this.lines += rows.length; this.pops += rows.length;
      const units = FU_LINE_ATK[Math.min(rows.length, FU_LINE_ATK.length - 1)] + this.chainN;
      this.score += [0, 100, 300, 500, 800][Math.min(4, rows.length)] * this.chainN + 200 * Math.max(0, rows.length - 4);
      for (const r of rows) for (let c = 0; c < FW_W; c++) this.burst(c, r, '#ffffff');
      this.grid = fuRemoveRows(this.grid, rows);
      this.texts.push({ txt: `${rows.length}줄!` + (this.chainN > 1 ? ` ${this.chainN}연쇄` : ''), x: SW / 2, y: FH * 0.45, age: 0, dur: 1100, col: '#7ff0ff', size: 30 });
      sfx.tclear(rows.length, 0); this.attack(units); this.sync(); this.resT = 280; return;
    }
    const gs = fuGroups(this.grid);
    if (gs.length) {
      this.chainN++;
      let total = 0, bonus = CHAIN_POWER[Math.min(this.chainN, CHAIN_POWER.length - 1)]; const cols = new Set();
      for (const gr of gs) { total += gr.cells.length; bonus += groupBonus(gr.cells.length); cols.add(gr.c); }
      bonus += COLOR_BONUS[Math.min(cols.size, 5)];
      const stepSc = 10 * total * clamp(bonus, 1, 999); this.score += stepSc; this.pops += total;
      this.carry += stepSc; const tp = targetPt(), units = Math.floor(this.carry / tp); this.carry -= units * tp;
      for (const k of fuPopSet(this.grid, gs)) { const y = Math.floor(k / FW_W), x = k % FW_W, v = this.grid[y][x]; this.burst(x, y, v.k === 'p' ? PAL[v.c].m : '#e4e1f3'); this.grid[y][x] = 0; }
      this.texts.push({ txt: `${this.chainN}연쇄!`, x: SW / 2, y: FH * 0.35, age: 0, dur: 1100, col: CH_COL[(this.chainN - 1) % CH_COL.length], size: 30 + Math.min(this.chainN, 8) * 2 });
      sfx.pop(this.chainN); this.attack(units); this.sync(); this.resT = 380; return;
    }
    this.maxChain = Math.max(this.maxChain, this.chainN);
    if (this.chainN >= 2) this.chains2++;
    if (this.pending > 0 && !this.garbDone) { this.dropGarbage(); return; }
    this.garbDone = false;
    this.spawn();
  }
  burst(x, y, col) {
    const cx = TGX + (x + 0.5) * TC, cy = TGY + (y - (FW_H - FW_VIS) + 0.5) * TC;
    for (let i = 0; i < 4; i++) { const a = Math.random() * Math.PI * 2, s = 0.06 + Math.random() * 0.2; this.particles.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.1, life: 450, max: 450, r: 2 + Math.random() * 3, col }); }
  }
  // 공격: 내 쪽 예고를 먼저 상쇄하고 남은 만큼 상대에게
  attack(units) {
    if (!game.vs || units <= 0) return;
    let n = units;
    if (!this.human) { this.atkCarry += units * this.ai.atk; n = Math.floor(this.atkCarry); this.atkCarry -= n; }
    if (n <= 0) return;
    this.sent += n;
    if (this.chainN === 1 || !this.opp || this.opp.dead) this.opp = pickTarget(this);
    const x = this.ox + SW / 2, y = this.oy + FH * 0.4, c = Math.min(this.pending, n);
    if (c > 0) { this.pending -= c; n -= c; game.launch(this, this, c, x, y, 'offset'); emit(this, { t: 'off', n: c, x: x - this.ox, y: y - this.oy, ch: this.chainN }); }
    if (n > 0 && this.opp) { game.launch(this, this.opp, n, x, y, 'attack'); emit(this, { t: 'atk', to: game.fields.indexOf(this.opp), n, x: x - this.ox, y: y - this.oy, ch: this.chainN }); }
  }
  dropGarbage() {
    const n = Math.min(30, this.pending); this.pending -= n; this.garbDone = true;
    const counts = Array(FW_W).fill(Math.floor(n / FW_W)), order = [...Array(FW_W).keys()].sort(() => Math.random() - 0.5);
    for (let i = 0; i < n % FW_W; i++) counts[order[i]]++;
    for (let c = 0; c < FW_W; c++) for (let k = 0; k < counts[c]; k++) { if (this.grid[0][c]) { this.sync(); this.die(); return; } this.grid[0][c] = { k: 'g' }; fuGravity(this.grid); }
    sfx.garb(); this.shake = Math.max(this.shake, 4); this.sync();
    this.phase = 'resolve'; this.resT = 200;
  }
  applyEvent(ev) { if (ev.t === 'fg') this.decode(ev.g); }

  /* ---------- CPU: 놓을 수 있는 자리마다 끝까지 계산해서 평가 ---------- */
  planAI() {
    const p = this.cur, cands = [];
    const tries = p.t === 'p' ? [...Array(FW_W).keys()].flatMap(x => [0, 1, 2, 3].map(o => ({ ...p, x, o, y: 1 })))
      : [0, 1, 2, 3].flatMap(r => [...Array(FW_W + 3).keys()].map(i => ({ ...p, r, x: i - 2, y: 0 })));
    for (const q of tries) {
      if (!this.fits(q)) continue;
      while (this.fits({ ...q, y: q.y + 1 })) q.y++;
      const g = this.grid.map(r => r.slice());
      if (q.t === 'p') { const [[x1, y1], [x2, y2]] = fuPairCells(q); g[y1][x1] = { k: 'p', c: q.a }; g[y2][x2] = { k: 'p', c: q.b }; }
      else if (fuPlaceMino(g, fuMinoCells(q), 1)) continue;
      const res = fuResolve(g), h = [];
      let holes = 0;
      for (let c = 0; c < FW_W; c++) { let r = 0; while (r < FW_H && !res.g[r][c]) r++; h.push(FW_H - r); for (let y = r + 1; y < FW_H; y++) if (!res.g[y][c]) holes++; }
      let bump = 0; for (let c = 0; c < FW_W - 1; c++) bump += Math.abs(h[c] - h[c + 1]);
      const maxH = Math.max(...h);
      let s = res.units * 3 + res.lines * 2 - holes * 1.2 - bump * 0.3 - h.reduce((a, b) => a + b, 0) * 0.25 - Math.max(0, maxH - 12) * 4;
      // 같은 색끼리 붙여 두기
      for (let r = 0; r < FW_H; r++) for (let c = 0; c < FW_W; c++) { const v = res.g[r][c]; if (!v || v.k !== 'p') continue; if (c + 1 < FW_W && res.g[r][c + 1] && res.g[r][c + 1].k === 'p' && res.g[r][c + 1].c === v.c) s += 0.4; if (r + 1 < FW_H && res.g[r + 1][c] && res.g[r + 1][c].k === 'p' && res.g[r + 1][c].c === v.c) s += 0.4; }
      s += (Math.random() - 0.5) * this.ai.noise;
      cands.push({ q, s });
    }
    if (!cands.length) { this.tgt = null; return; }
    let best = cands.reduce((a, b) => (b.s > a.s ? b : a));
    if (Math.random() < this.ai.miss) best = cands[rnd(cands.length)];
    this.tgt = best.q;
  }
  aiAct(dt) {
    this.aiT -= dt; if (this.aiT > 0 || !this.tgt) return;
    this.aiT = this.ai.delay * (0.7 + Math.random() * 0.6);
    const p = this.cur, t = this.tgt, rot = p.t === 'p' ? 'o' : 'r';
    if (p[rot] !== t[rot]) { const d = (t[rot] - p[rot] + 4) % 4; if (!this.rotate(d === 3 ? -1 : 1)) this.hardDrop(); return; }
    if (p.x !== t.x) { if (!this.moveX(p.x < t.x ? 1 : -1)) this.hardDrop(); return; }
    this.hardDrop();
  }

  /* ---------- 그리기 ---------- */
  draw(t) {
    const c = ctx, tone = this.tone || TONES.red, gx = this.ox + TGX;
    c.save();
    slab(c, this.ox + 14, 2, SW - 28, 32, tone, 4);
    outlined(c, this.name, this.ox + SW / 2, 19, 20, '#fff', tone.d, 6);
    const sy = this.oy + FH + 16;
    slab(c, this.ox + 6, sy, SW - 12, 50, TONES.white, 4);
    c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = '#6d6b80'; c.font = '15px ' + FONT(); c.fillText('점수', this.ox + 30, sy + 26);
    c.fillStyle = '#22212e'; c.font = '28px ' + HFONT(); c.fillText(this.score.toLocaleString(), this.ox + 70, sy + 27);
    slab(c, this.ox + SW - 118, sy + 9, 92, 32, tone, 3);
    outlined(c, `최고 ${this.maxChain}연쇄`, this.ox + SW - 72, sy + 26, 15, '#fff', tone.d, 4);
    if (this.pending > 0) { slab(c, this.ox + SW / 2 - 50, this.oy - 40, 100, 26, TONES.white, 3); outlined(c, `방해 ${this.pending}`, this.ox + SW / 2, this.oy - 27, 15, '#22212e', '#fff', 4); }
    c.restore();
    const shx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    c.save(); c.translate(this.ox + shx, this.oy);
    const B = 8, GW = TW * TC;
    c.fillStyle = tone.d; c.fillRect(TGX - B, -B, GW + B * 2, FH + B * 2);
    c.fillStyle = '#fff'; c.fillRect(TGX - 4, -4, GW + 8, FH + 8);
    c.save(); c.beginPath(); c.rect(TGX, 0, GW, FH); c.clip();
    c.fillStyle = '#1b1548'; c.fillRect(TGX, TGY, GW, FW_VIS * TC);
    const sY = r => TGY + (r - (FW_H - FW_VIS)) * TC;
    const puyos = [];
    const drawCell = (x, r, v) => {
      if (v.k === 'm') drawBlock(c, TGX + x * TC, sY(r), TC, TCOL[TKEYS[v.c]]);
      else puyos.push({ cx: (x + 0.5) * CS, cy: (r - (FW_H - FW_VIS) + 0.5) * CS, rx: R, ry: R, col: v.k === 'g' ? OJ : v.c });
    };
    for (let r = FW_H - FW_VIS - 1; r < FW_H; r++) for (let x = 0; x < FW_W; x++) { const v = this.grid[r][x]; if (v) drawCell(x, r, v); }
    const p = this.remote ? this.net : this.cur;
    if (p) {
      if (p.t === 'm' && TROT[p.k]) {
        const gp = { ...p }; if (!this.remote) while (this.fits({ ...gp, y: gp.y + 1 })) gp.y++;
        if (!this.remote) for (const [x, y] of fuMinoCells(gp)) { c.save(); c.globalAlpha = 0.3; c.strokeStyle = TCOL[p.k]; c.lineWidth = 2; rr(c, TGX + x * TC + 3, sY(y) + 3, TC - 6, TC - 6, 4); c.stroke(); c.restore(); }
        for (const [x, y] of fuMinoCells(p)) if (y >= FW_H - FW_VIS - 1) drawBlock(c, TGX + x * TC, sY(y), TC, TCOL[p.k]);
      } else if (p.t === 'p') { const [[x1, y1], [x2, y2]] = fuPairCells(p); drawCell(x1, y1, { k: 'p', c: p.a }); drawCell(x2, y2, { k: 'p', c: p.b }); }
    }
    if (puyos.length) { c.save(); c.translate(TGX, TGY); c.scale(TC / CS, TC / CS); drawPuyos(c, puyos, []); c.restore(); }
    for (const q of this.particles) { c.globalAlpha = clamp(q.life / q.max, 0, 1); c.fillStyle = q.col; c.beginPath(); c.arc(q.x, q.y, q.r, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1;
    if (this.hit > 0) { c.strokeStyle = `rgba(255,79,106,${this.hit})`; c.lineWidth = 10; c.strokeRect(TGX, 0, GW, FH); }
    for (const tx of this.texts) {
      c.save(); c.globalAlpha = Math.min(1, 2 - 2 * tx.age / tx.dur); c.font = tx.size + 'px ' + FONT(); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 7; c.lineJoin = 'round'; c.strokeStyle = '#2a1d6b'; c.strokeText(tx.txt, tx.x, tx.y - tx.age * 0.02); c.fillStyle = tx.col; c.fillText(tx.txt, tx.x, tx.y - tx.age * 0.02); c.restore();
    }
    c.restore();
    if (this.dead || this.won) {
      c.fillStyle = 'rgba(20,16,50,0.45)'; c.fillRect(TGX, 0, GW, FH);
      const bt = this.won ? TONES.yellow : TONES.blue;
      c.save(); c.translate(SW / 2, FH / 2); c.rotate(-0.06); slab(c, -SW / 2 - 10, -42, SW + 20, 84, bt, 6); outlined(c, endLabel(this), 0, 2, 50, '#fff', bt.d, 9); c.restore();
    }
    c.restore();
  }
}
// '다음' 칸: 퓨전 조각 미리보기
function drawFusionNext(c, me, t) {
  for (let i = 0; i < 4; i++) {
    const pc = fuPieceAt(me.idx + i), y = OY + 70 + i * 46, s = i ? 0.8 : 1;
    if (pc.t === 'm') drawMino(c, pc.k, PX, y, (i ? 11 : 14), i ? 0.85 : 1);
    else { c.save(); c.translate(PX, y); c.scale(0.55 * s * 40 / CS, 0.55 * s * 40 / CS); drawPuyos(c, [{ cx: -CS / 2, cy: 0, rx: R, ry: R, col: pc.ab[1] }, { cx: CS / 2, cy: 0, rx: R, ry: R, col: pc.ab[0] }], []); c.restore(); }
  }
}
