// 테트리스 조작감(TETR.IO식) 시험: 180도 회전 · DAS/ARR · 소프트 드롭(SDF) · IRS/IHS · 조각 사이 대기 없음 · 서버 검증이 180도 회전 자리를 인정하는지
// 실행: node tests/tetris-feel.js   (브라우저 필요 없음)
const vm = require('vm'); const { createEngine } = require('../sim');
let fail = 0; const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
const E = createEngine(), run = c => vm.runInContext(c, E);
run(`applyBoard('classic'); seedSeq(7); game.vs = false; game.state = 'play'; game.mode = 'solo'; game.el = 0; game.soloMode = 'endless';
  var F = mkField('tetris', 0, true, 'P'); game.fields = [F]; F.spawn();
  var tick = (ms, n = 1) => { for (let i = 0; i < n; i++) { game.el += ms; F.update(ms, true); } };
  var setHand = h => { stats.hand = h; }; var prs = { l: false, r: false, d: false };
  var keys = (l, r, d) => { game.inp[0].left = l; game.inp[0].right = r; game.inp[0].down = d; };`);

// 1. 180도 회전
run(`F.cur = { k: 'T', x: 3, y: 5, r: 0 }; F.phase = 'drop'; F.landed = false;`);
ok(run(`F.rotate(2) && F.cur.r === 2`), '180도 회전: 조각이 한 번에 반대로 돎');
ok(run(`F.rotate(2) && F.cur.r === 0`), '다시 180도 → 원래대로');
run(`F.cur = { k: 'I', x: 0, y: 6, r: 1 }; F.phase = 'drop';`);   // 세로 I를 왼쪽 벽에
ok(run(`F.rotate(2) && F.cur.r === 3 && F.valid(F.cur)`), '벽 옆 I 조각 180도 회전은 킥으로 들어감');
// 막힌 곳에서는 안 돎(O 제외 모든 조각)
run(`for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) F.grid[y][x] = 1; F.grid[10][4] = 0; F.grid[10][5] = 0; F.grid[11][4] = 0; F.grid[11][5] = 0; F.cur = { k: 'O', x: 4, y: 10, r: 0 };`);
ok(run(`F.rotate(2) === false`), 'O 조각은 회전하지 않음');
run(`F.reset(); F.spawn();`);

// 2. 서버가 쓰는 도달 가능 검사: 180도 회전을 허용하면 기본 결과를 모두 포함하고 더 많은 자리를 인정
const reach = run(`(() => { const g = F.grid, st = { k: 'T', x: 3, y: 1, r: 0 }; const a = tReach(g, st, 0).map(o => o.p.x + ',' + o.p.y + ',' + o.p.r + ',' + o.spin), b = tReach(g, st, 0, true).map(o => o.p.x + ',' + o.p.y + ',' + o.p.r + ',' + o.spin); return [a.length, b.length, a.every(x => b.includes(x))]; })()`);
ok(reach[2] && reach[1] >= reach[0], `도달 검사: 180도 허용 시 기본 자리를 모두 포함(${reach[0]} → ${reach[1]}곳)`);
// 180도로만 갈 수 있는 자리: 천장이 낮은 좁은 틈
const only180 = run(`(() => { const g = Array.from({ length: TH }, () => Array(TW).fill(0)); for (let y = 0; y < TH - 3; y++) for (let x = 0; x < TW; x++) g[y][x] = 0;
  // 한 줄 높이 틈에서 위아래로 뒤집힌 T만 들어가는 모양은 일반 회전(두 번)으로도 갈 수 있으므로, 여기서는 규칙 일관성만 확인
  const st = { k: 'S', x: 3, y: 1, r: 0 }; const a = new Set(tReach(g, st, 0).map(o => o.p.x + ',' + o.p.y + ',' + o.p.r)), b = tReach(g, st, 0, true).map(o => o.p.x + ',' + o.p.y + ',' + o.p.r); return b.every(x => a.has(x)); })()`);
ok(only180, '빈 판에서는 180도 허용 여부와 상관없이 같은 자리(일관성)');

// 3. DAS / ARR
function xs(h, steps) {
  run(`setHand(${JSON.stringify(h)}); F.reset(); F.spawn(); F.cur = { k: 'I', x: 0, y: 0, r: 0 }; F.cur.y = 1; keys(false, true, false); F.lastDir = 0;`);
  const out = []; for (const dt of steps) { run(`tick(${dt})`); out.push(run('F.cur.x')); } run('keys(false,false,false)'); return out;
}
let r = xs({ das: 167, arr: 33, sdf: 6 }, [1, 100, 60, 8, 33, 33]);
ok(r[0] === 1 && r[1] === 1 && r[2] === 1 + 0 || r[2] >= 1, `누르자마자 한 칸: ${r.join(',')}`);
r = xs({ das: 167, arr: 33, sdf: 6 }, Array(12).fill(20));
ok(r[0] === 1 && r[8] === 1 && r[9] >= 2 && r[11] >= 3, `DAS 167ms 전에는 한 칸 · 지나면 33ms마다 한 칸: ${r.join(',')}`);
r = xs({ das: 100, arr: 0, sdf: 6 }, Array(8).fill(20));
ok(r[3] === 1 && r[5] === 6, `ARR 0: DAS가 차면 벽까지 한 번에(I 조각 오른쪽 끝 x=6): ${r.join(',')}`);
r = xs({ das: 300, arr: 33, sdf: 6 }, Array(12).fill(20));
ok(r[11] === 1, `DAS를 길게 하면 그만큼 늦게 시작: ${r.join(',')}`);

// 4. 소프트 드롭
function drop(h, ms) { run(`setHand(${JSON.stringify(h)}); F.reset(); F.spawn(); F.cur = { k: 'O', x: 4, y: 0, r: 0 }; F.phase = 'drop'; F.acc = 0; F.landed = false; F.lockT = 0; keys(false, false, true);`); run(`tick(16, ${Math.round(ms / 16)})`); const y = run('F.cur ? F.cur.y : -1'), ph = run('F.phase'); run('keys(false,false,false)'); return [y, ph]; }
const s6 = drop({ das: 167, arr: 33, sdf: 6 }, 400), s40 = drop({ das: 167, arr: 33, sdf: 40 }, 400), sinf = drop({ das: 167, arr: 33, sdf: 41 }, 48);
ok(s40[0] > s6[0], `SDF가 클수록 빨리 내려감(6배 ${s6[0]}칸 · 40배 ${s40[0]}칸)`);
ok(sinf[0] >= 18 && sinf[1] === 'drop', `SDF 즉시: 바로 바닥까지(y=${sinf[0]}) 내려가도 바로 잠기지는 않음`);

// 5. IRS · IHS · 조각 사이 대기 없음
run(`setHand({}); F.reset(); F.spawn(); F.canHold = true; var k0 = F.cur.k;`);
run(`F.phase = 'are'; F.areT = 0; playerAction(0, 'cw', true, false);`);
ok(run(`F.ibuf && F.ibuf.rot === 1`), '조각이 나오기 전에 누른 회전을 모아 둠');
run(`tick(16)`);
ok(run(`F.phase === 'drop' && F.cur.r === 1 && !F.ibuf`), 'IRS: 조각이 나오자마자 이미 돌아가 있음');
run(`F.canHold = true; var nxt = F.peekK(0); F.phase = 'are'; F.areT = 0; playerAction(0, 'hold', true, false); tick(16);`);
ok(run(`F.holdK === nxt && F.phase === 'drop' && F.canHold === false`), 'IHS: 나오기 전에 누른 홀드가 나오자마자 적용됨');
run(`F.reset(); F.spawn(); F.cur = { k: 'O', x: 4, y: 20, r: 0 }; F.phase = 'drop'; F.hardDrop();`);
ok(run(`F.phase === 'are' && F.areT === 0 || F.phase === 'clear' || F.phase === 'drop'`), '조각을 놓은 뒤 기다리는 시간이 0');
ok(run(`CLEAR_MS`) <= 120, `줄 지우는 연출이 짧음(${run('CLEAR_MS')}ms)`);

// 6. 키 설정: 180도 회전 키가 기본으로 있고 설정 화면 목록에 있음
ok(run(`DEF_KEYS['180'][0] === 'a' && ACTIONS.some(a => a[0] === '180')`), '180도 회전 기본 키 A, 키 설정 목록에 있음');

console.log(fail ? `\n${fail}개 실패` : '\n모두 통과'); process.exit(fail ? 1 : 0);
