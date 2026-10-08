// 빅뱅 규칙
'use strict';

/* ================= 빅뱅(우리 게임 버전) =================
   - 방해 공격은 없고, 라운드마다 모든 플레이어에게 같은 퍼즐판이 동시에 주어짐
     뿌요: 연쇄 씨앗판(트리거 색 조각이 바로 나옴) · 테트리스: 주어진 조각을 순서대로 넣어 줄을 모두 채우는 판
   - 완성도(뿌요: 터뜨린 연쇄 ÷ 씨앗판 연쇄, 테트리스: 지운 줄 ÷ 퍼즐 줄)가 가장 높은 사람이 라운드 승리(같으면 먼저 끝낸 사람)
   - 나머지는 체력이 깎이고(완성도 차이가 클수록, 라운드가 갈수록 많이), 체력이 0이 되면 탈락
   - 라운드 제한 시간 20초. 라운드마다 퍼즐이 조금씩 커짐
   - 온라인·리플레이: 각자 결과를 'bb' 이벤트로 알리고, 모든 결과가 모이면 모두 같은 계산으로 체력을 깎음 */
const BB_HP = 100, BB_TIME = 20000, BB_PAUSE = 2200;

// 테트리스 퍼즐: 꽉 찬 줄 묶음에서 위쪽부터 조각 모양으로 파냄(파낸 칸 위는 비어 있어야 함 = 위에서 떨어뜨려 넣을 수 있음).
// 모든 줄에 빈칸이 생기면 끝. 넣는 순서는 파낸 순서의 반대(깊은 것부터). 마지막에 실제로 놓아 보며 확인
function tetrisPuzzle(rows, rng) {
  const R = k => Math.floor(rng() * k), KS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'], top = TH - rows;
  for (let attempt = 0; attempt < 300; attempt++) {
    const g = Array.from({ length: TH }, (_, r) => Array(TW).fill(r >= top ? 8 : 0));
    const carved = [], holed = new Set();
    for (let t = 0; t < 600 && holed.size < rows; t++) {
      const k = KS[R(7)], r = R(4), x = R(TW + 2) - 2, y = top + R(rows) - 1;
      const cells = TROT[k][r].map(([dx, dy]) => [x + dx, y + dy]);
      if (!cells.every(([X, Y]) => X >= 0 && X < TW && Y >= top && Y < TH && g[Y][X])) continue;
      const mine = new Set(cells.map(([X, Y]) => Y * TW + X));
      if (!cells.every(([X, Y]) => { for (let yy = top; yy < Y; yy++) if (g[yy][X] && !mine.has(yy * TW + X)) return false; return true; })) continue;
      if (t < 300 && cells.every(([, Y]) => holed.has(Y))) continue;          // 처음엔 새 줄을 파는 쪽을 우선
      for (const [X, Y] of cells) { g[Y][X] = 0; holed.add(Y); }
      carved.push({ k, r, x });
    }
    if (holed.size < rows) continue;
    const seq = carved.slice().reverse();
    // 확인: 위에서 차례로 떨어뜨려 모든 줄이 지워지는지
    let s = g.map(q => q.slice()), ok = true, lines = 0;
    for (const c of seq) {
      const p = { k: c.k, x: c.x, y: 0, r: c.r };
      if (!tValidOn(s, p)) { ok = false; break; }
      while (tValidOn(s, { ...p, y: p.y + 1 })) p.y++;
      const res = tPlace(s, p); s = res.g; lines += res.lines;
    }
    if (!ok || lines !== rows) continue;
    return { g: g.map(q => q.join('')).join(''), seq: seq.map(c => c.k), rows };
  }
  return null;
}

/* ---------- 라운드 진행 ---------- */
function bbInit() { game.bb = { round: 0, hp: game.fields.map(() => BB_HP), resBy: {}, res: {}, t: 0, phase: 'idle', wait: 0, last: null }; }
function bbStartRound() {
  const bb = game.bb; bb.round++; bb.res = bb.resBy[bb.round] = bb.resBy[bb.round] || {}; bb.t = BB_TIME; bb.phase = 'play';
  const rng = makeRng(((game.seed >>> 0) ^ Math.imul(bb.round, 0x9E3779B1)) >>> 0);     // 모두 같은 퍼즐
  const [lv0, max] = feverLv();
  const pz = { puyo: feverSeed(Math.min(max, lv0 - 1 + bb.round), rng), tetris: tetrisPuzzle(Math.min(6, 1 + bb.round), rng) };
  game.fields.forEach(f => {
    if (f.dead) return;
    f.texts.push({ txt: `라운드 ${bb.round}`, x: f.fw / 2, y: FH * 0.3, age: 0, dur: 1300, col: '#ffe066', size: 40 });
    if (!f.remote) f.bbLoad(pz[f.kind]);
  });
}
// 판 하나가 이번 라운드를 끝냄(완성도 p: 0~1)
// 라운드 번호별로 모음(온라인에서 빠른 사람의 다음 라운드 결과가 먼저 올 수 있음)
function bbReport(f, p, at, round) {
  const bb = game.bb, i = game.fields.indexOf(f), r = round || bb && bb.round;
  if (!bb || i < 0 || !r) return;
  const res = bb.resBy[r] = bb.resBy[r] || {};
  if (res[i]) return;
  res[i] = { p: Math.max(0, Math.min(1, +p || 0)), at: +at || 0 };
  if (!f.remote) emit(f, { t: 'bb', r, p: res[i].p, at: res[i].at });
  if (r !== bb.round) return;
  f.texts.push({ txt: p >= 1 ? '완성!' : `${Math.round(p * 100)}%`, x: f.fw / 2, y: FH * 0.45, age: 0, dur: 1400, col: p >= 1 ? '#ffe066' : '#fff', size: 36 });
}
function bbTick(dt) {
  const bb = game.bb; if (!bb) return;
  if (bb.phase === 'idle') { bbStartRound(); return; }
  if (bb.phase === 'pause') { bb.wait -= dt; if (bb.wait <= 0) bbStartRound(); return; }
  bb.t -= dt;
  if (bb.t <= 0) for (const f of game.fields) if (!f.remote && !f.dead && !bb.res[game.fields.indexOf(f)]) f.bbTimeUp();   // 시간 끝: 지금까지 결과로
  const alive = game.fields.map((f, i) => i).filter(i => !game.fields[i].dead);
  if (!alive.every(i => bb.res[i])) return;
  // 결과 정리: 완성도 높은 순, 같으면 먼저 끝낸 순
  const order = alive.slice().sort((a, b) => bb.res[b].p - bb.res[a].p || bb.res[a].at - bb.res[b].at);
  const w = order[0], best = bb.res[w].p;
  bb.last = { winner: w, dmg: {} };
  game.fields[w].texts.push({ txt: '라운드 승리!', x: game.fields[w].fw / 2, y: FH * 0.6, age: 0, dur: 1800, col: '#ffe066', size: 34 });
  for (const i of order.slice(1)) {
    const d = Math.round(15 + 25 * (best - bb.res[i].p) + 2 * bb.round), f = game.fields[i];
    bb.hp[i] = Math.max(0, bb.hp[i] - d); bb.last.dmg[i] = d;
    f.texts.push({ txt: `-${d}`, x: f.fw / 2, y: FH * 0.6, age: 0, dur: 1800, col: '#ff4f6a', size: 40 });
    f.hit = 1; f.shake = Math.max(f.shake, 6);
    game.launch(game.fields[w], f, d, game.fields[w].ox + game.fields[w].fw / 2, OY + FH * 0.45, 'bb', Math.min(8, bb.round + 2));
  }
  for (const i of alive) if (bb.hp[i] <= 0) game.fields[i].die();
  bb.phase = 'pause'; bb.wait = BB_PAUSE;
}
// 체력 막대(이름표 아래)와 가운데 패널의 라운드·남은 시간
function drawBigBang(c) {
  const bb = game.bb; if (!bb) return;
  game.fields.forEach((f, i) => {
    const x = f.ox + 14, w = f.fw - 28, y = 42, k = bb.hp[i] / BB_HP;
    c.fillStyle = 'rgba(0,0,0,0.25)'; rr(c, x, y, w, 12, 6); c.fill();
    c.fillStyle = k > 0.5 ? '#39c63c' : k > 0.25 ? '#ffc915' : '#ff4559'; if (k > 0) { rr(c, x, y, Math.max(12, w * k), 12, 6); c.fill(); }
    c.font = '11px ' + FONT(); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(`체력 ${bb.hp[i]}`, x + w / 2, y + 6.5);
  });
  const base = OY + 376;
  slab(c, PX - 66, base, 132, 54, TONES.orange, 4);
  outlined(c, `빅뱅 라운드 ${Math.max(1, bb.round)}`, PX, base + 17, 15, '#fff', TONES.orange.d, 4);
  outlined(c, bb.phase === 'play' ? `${Math.max(0, bb.t / 1000).toFixed(1)}초` : '결과', PX, base + 38, 20, '#fff', TONES.orange.d, 5);
}
