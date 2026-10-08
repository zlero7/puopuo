// 스왑 규칙
'use strict';

/* ================= 스왑(우리 게임 버전) =================
   - 플레이어마다 뿌요 판과 테트리스 판을 둘 다 가짐. 처음엔 고른 스타일로 시작
   - 25초가 지나면 다음 조각을 받을 때 다른 판으로 바뀜(연쇄·줄 지우기 도중에는 안 바뀜). 쉬는 판은 그대로 멈춰 있음
   - 쌓인 방해는 바뀐 판의 단위로 바꿔서 넘어감(테트리스 줄 → 방해뿌요는 T2P 표, 반대는 그 역)
   - 점수는 이어지고, 어느 판이든 꼭대기까지 차면 탈락
   - 온라인·리플레이: 바뀔 때 'sw' 이벤트를 보내고, 판 이벤트는 종류(뿌요/테트리스)에 맞는 판으로 보냄 */
const SWAP_T = 25000;
// 짝 판 만들기: 같은 자리에 다른 스타일 판
function makeSwapPair(f, lv) {
  const k = f.kind === 'puyo' ? 'tetris' : 'puyo', g = mkField(k, f.sx != null ? f.sx : f.ox, f.human, f.name);
  g.tone = f.tone; g.pi = f.pi; g.remote = f.remote;
  if (!f.human && !f.remote) g.ai = { ...(k === 'tetris' ? AI_TETRIS : AI_PUYO)[lv] };
  f.other = g; g.other = f;
  f.swapAt = g.swapAt = SWAP_T;
  return g;
}
const toLines = n => { let i = 0; while (i + 1 < T2P.length && T2P[i + 1] <= n) i++; return i; };   // 방해뿌요 수 → 줄 수
// f(지금 판)를 짝 판으로 바꿈
function swapField(f) {
  const g = f.other, i = game.fields.indexOf(f);
  if (!g || i < 0) return;
  if (!f.remote) emit(f, { t: 'sw' });
  g.pending = f.kind === 'puyo' ? toLines(f.pending) : T2P[Math.min(60, f.pending)] || 0;
  f.pending = 0;
  g.score = f.score; g.sent = f.sent; g.maxChain = Math.max(g.maxChain, f.maxChain);
  g.opp = f.opp; g.lastHitBy = f.lastHitBy; g.seat = f.seat; g.dead = false;
  g.swapAt = (Math.floor((game.el || 0) / SWAP_T) + 1) * SWAP_T;
  for (const o of game.fields) { if (o.opp === f) o.opp = g; if (o.lastHitBy === f) o.lastHitBy = g; }
  if (game.seatField && f.seat != null) game.seatField[f.seat] = g;
  game.fields[i] = g;
  f.phase = 'swapped'; f.piece = null; f.cur = null;
  g.texts.push({ txt: '스왑!', x: g.fw / 2, y: FH * 0.35, age: 0, dur: 1300, col: '#ffe066', size: 46 });
  ring(g.ox + g.fw / 2, OY + FH / 2, '#ffe066', 20, 220, 520, 8);
  if (f.human) sfx.margin();
  g.phase = 'none'; g.spawn();
  if (f.dieLater) { f.dieLater = false; applyRemote(g, { t: 'dead' }); }   // 바뀌기 전에 받은 탈락은 새 판으로
}
// 조각을 받을 때 바꿀 차례인지
const swapDue = f => game.rule === 'swap' && f.other && !f.remote && game.state === 'play' && (game.el || 0) >= f.swapAt;
// 원격 판 이벤트를 종류에 맞는 판으로
function routeKind(f, d) {
  const k = { lock: 'puyo', garb: 'puyo', fv: 'puyo', tlock: 'tetris', tgarb: 'tetris' }[d.t] || (d.t === 'st' && d.k ? (d.k === 't' ? 'tetris' : 'puyo') : null);
  return k && f.kind !== k && f.other && f.other.kind === k ? f.other : f;
}
// 이름표 오른쪽에 스왑까지 남은 시간
function drawSwap(c) {
  for (const f of game.fields) {
    if (!f.other || f.dead) continue;
    const left = Math.max(0, Math.ceil((f.swapAt - (game.el || 0)) / 1000)), x = f.ox + f.fw - 62, y = 6;
    slab(c, x, y, 46, 24, left <= 3 ? TONES.yellow : TONES.white, 3);
    outlined(c, left ? `⇄${left}` : '⇄!', x + 23, y + 12, 14, left <= 3 ? '#fff' : '#22212e', left <= 3 ? TONES.yellow.d : '#fff', 4);
  }
}
