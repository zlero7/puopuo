// 피버 규칙 · 연쇄 씨앗판 만들기
'use strict';

/* ================= 피버 규칙(우리 게임 버전) =================
   - 상쇄할 때마다(연쇄 한 번에 한 칸) 피버 게이지가 참. 7칸이 차면 다음 조각부터 피버
   - 피버: 내 판을 잠시 맡겨 두고 '연쇄 씨앗판'이 떨어짐. 트리거 색이 든 조각이 바로 나옴
     연쇄를 끝까지 터뜨리면 다음 씨앗판이 한 단계 길어지고(못 하면 한 단계 짧아짐), 연쇄 수만큼 시간이 늘어남(대전 0.3초·연습 0.6초)
   - 피버 시간은 연쇄 연출 중에도 흐르고, 씨앗판이 떨어지는 동안만 멈춤
   - 피버 시간(15초)이 끝나면 맡겨 둔 판으로 돌아오고, 그동안 쌓인 방해뿌요가 떨어짐
   - 피버 중 연쇄는 별도 점수표(FEVER_POWER)를 써서 긴 연쇄의 공격력이 통상보다 완만함 */
const FEVER_GAUGE = 7, FEVER_TIME = 15000;
const FEVER_POWER = [0, 0, 6, 10, 16, 24, 32, 42, 52, 64, 76, 90, 104, 118, 132, 148, 164, 180, 196, 212];
const RULES = { tsu: { ko: '통상' }, fever: { ko: '피버' } };
const feverLv = () => ({ classic: [4, 11], wide: [5, 13], tiny: [6, 15] }[BOARD] || [5, 13]);   // [시작 연쇄, 최대 연쇄]

/* ---------- 연쇄 씨앗판 만들기 ----------
   마지막 연쇄부터 거꾸로, 같은 색 4개를 판 중간에 '끼워 넣어' 바로 다음 연쇄 그룹을 위아래로 갈라놓는다.
   끼운 4개가 터지면 위쪽이 내려앉으며 다음 그룹이 다시 붙고, 이것이 연쇄가 된다.
   첫 연쇄는 3개만 끼우고, 그 옆에 하나를 떨어뜨리면 시작되는 열(트리거)을 찾는다. 마지막에 시뮬레이션으로 연쇄 수를 확인 */
const SEED_SHAPES3 = [[[0, 3]], [[0, 2], [1, 1]], [[0, 2], [-1, 1]], [[0, 1], [1, 2]], [[0, 1], [-1, 2]], [[0, 1], [1, 1], [2, 1]]];
const SEED_SHAPES4 = [[[0, 4]], [[0, 3], [1, 1]], [[0, 3], [-1, 1]], [[0, 2], [1, 2]], [[0, 2], [-1, 2]], [[0, 1], [1, 3]], [[0, 1], [-1, 3]],
  [[0, 2], [1, 1], [2, 1]], [[0, 1], [1, 1], [2, 2]], [[0, 1], [1, 2], [2, 1]]];
// 열 목록(cols[x][y], y=0이 바닥)에서 같은 색으로 이어진 묶음 전부
function seedGroups(cols) {
  const W = cols.length, seen = cols.map(c => c.map(() => false)), out = [];
  for (let x = 0; x < W; x++) for (let y = 0; y < cols[x].length; y++) {
    if (seen[x][y]) continue;
    const c = cols[x][y], st = [[x, y]], cells = []; seen[x][y] = true;
    while (st.length) {
      const [a, b] = st.pop(); cells.push([a, b]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = a + dx, ny = b + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < cols[nx].length && !seen[nx][ny] && cols[nx][ny] === c) { seen[nx][ny] = true; st.push([nx, ny]); }
      }
    }
    out.push({ c, cells });
  }
  return out;
}
function seedChains(cols) {
  let chain = 0;
  for (;;) {
    const gs = seedGroups(cols).filter(g => g.cells.length >= 4); if (!gs.length) return chain;
    chain++;
    const del = new Set(); for (const g of gs) for (const [x, y] of g.cells) del.add(x * 100 + y);
    cols = cols.map((c, x) => c.filter((_, y) => !del.has(x * 100 + y)));
  }
}
// n연쇄 씨앗판. 결과 { cols, trig: { x, c } } 또는 null. rng: 0~1 난수 함수
function makeSeed(W, maxH, n, colors, rng, avoidX) {
  const R = k => Math.floor(rng() * k);
  for (let attempt = 0; attempt < 300; attempt++) {
    let cols = Array.from({ length: W }, () => []), trig = null, prevC = -1, ok = true;
    for (let k = n; k >= 1 && ok; k--) {
      const need = k === 1 ? 3 : 4; let placed = false;
      for (let t = 0; t < 300 && !placed; t++) {
        let c; do c = 1 + R(colors); while (c === prevC);
        const shape = (need === 3 ? SEED_SHAPES3 : SEED_SHAPES4)[R(need === 3 ? SEED_SHAPES3.length : SEED_SHAPES4.length)];
        const x0 = R(W);
        if (shape.some(([dx]) => x0 + dx < 0 || x0 + dx >= W)) continue;
        const h0 = R(cols[x0].length + 1), next = cols.map(q => q.slice()), cells = [];
        let bad = false;
        for (let i = 0; i < shape.length; i++) {
          const [dx, cnt] = shape[i], x = x0 + dx, h = i === 0 ? h0 : h0 + R(shape[0][1]);
          if (h > next[x].length) { bad = true; break; }                  // 공중에 뜰 수 없음
          next[x].splice(h, 0, ...Array(cnt).fill(c));
          for (let j = 0; j < cnt; j++) cells.push([x, h + j]);
        }
        if (bad || next.some((q, x) => q.length > (x === avoidX ? maxH - 1 : maxH))) continue;
        const gs = seedGroups(next), key = new Set(cells.map(([x, y]) => x * 100 + y));
        const mine = gs.filter(g => g.cells.some(([x, y]) => key.has(x * 100 + y)));
        if (mine.length !== 1 || mine[0].cells.length !== need) continue;     // 끼운 칸만 정확히 한 묶음
        if (gs.some(g => g !== mine[0] && g.cells.length >= 4)) continue;   // 다른 그룹(다음 연쇄)은 갈라져 있어야 함
        if (k === 1) {
          const opts = [];
          for (let tx = 0; tx < W; tx++) {
            const ty = next[tx].length; if (ty >= maxH) continue;
            if (!cells.some(([x, y]) => Math.abs(x - tx) + Math.abs(y - ty) === 1)) continue;
            const t2 = next.map(q => q.slice()); t2[tx].push(c);
            if (seedChains(t2) === n) opts.push(tx);
          }
          if (!opts.length) continue;
          trig = { x: opts[R(opts.length)], c };
        }
        cols = next; prevC = c; placed = true;
      }
      if (!placed) ok = false;
    }
    if (ok) return { cols, trig };
  }
  return null;
}
// 지금 판 크기(COLS·VIS)에 맞는 씨앗판을 격자로. 만들기 어려우면 한 단계씩 짧게
function feverSeed(n, rng = Math.random) {
  for (let k = n; k >= 3; k--) {
    const s = makeSeed(COLS, VIS - 2, k, 4, rng, SP);
    if (!s) continue;
    const g = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    s.cols.forEach((col, x) => col.forEach((c, y) => { g[ROWS - 1 - y][x] = c; }));
    return { g, trig: s.trig, n: k };
  }
  return null;
}
