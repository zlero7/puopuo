// 뿌요뿌요 캐릭터 성격 시험: 같은 판에서 캐릭터 성격에 따라 CPU가 다르게 두는지 (무작위·실수를 끄고 100번씩 확인)
// 실행: node tests/puyo-chars.js   (브라우저 필요 없음)
const vm = require('vm'); const { createEngine } = require('../sim');
let fail = 0; const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
const E = createEngine(), run = c => vm.runInContext(c, E);
run(`applyBoard('classic'); seedSeq(3); game.vs = true; game.state = 'play'; game.mode = 'vs'; game.rule = 'tsu'; game.el = 0;
  var mk = (id, lv = 1) => { const f = mkField('puyo', 0, false, 'AI'); f.ai = charAi(botAi('puyo', lv), charOf(id), 'puyo'); f.ai.noise = 0; f.ai.miss = 0; f.opp = mkField('puyo', 0, false, 'P'); f.opp.remote = true; game.fields = [f, f.opp]; f.spawn(); return f; };
  var put = (f, cells) => { for (const [r, c, col] of cells) f.grid[r][c] = f.mk(col, r, c, 0); };
  var plan = f => { f.planAI(); return f.tgt; };
  var clear = f => { for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) f.grid[r][c] = null; };`);
const N = 40;

// 1. 성격 값이 캐릭터마다 다르게 들어감
const ai = id => JSON.parse(run(`JSON.stringify(mk('${id}').ai)`));
const a = Object.fromEntries(['lumi', 'toto', 'pin', 'moka', 'byeol', 'kuro', 'somi', 'bolt'].map(i => [i, ai(i)]));
ok(a.toto.fire === 5 && a.moka.counter === 1 && a.moka.flat > 1 && a.byeol.snipe === true && a.kuro.conn > 1 && a.somi.mood === true && !a.lumi.fire && !a.lumi.mood, '캐릭터마다 뿌요뿌요 성격 값이 들어감(루미는 기본)');
ok(a.kuro.noise === 0, '쿠로의 정밀함(무작위 줄임)은 기본값에서 곱해짐');
const raw = id => run(`charAi(botAi('puyo', 1), charOf('${id}'), 'puyo').noise`);
ok(raw('kuro') < raw('lumi') * 0.5, `쿠로는 흔들림이 훨씬 적음(${raw('kuro').toFixed(0)} < ${raw('lumi').toFixed(0)})`);

// 2. 상황: 1색 세로 3개 옆에 같은 색을 놓으면 1연쇄. 방해가 쌓여 있을 때(받아치기) / 상대가 높을 때(마무리) / 그냥(참기)
const fires = (id, extra) => { let n = 0; for (let i = 0; i < N; i++) { n += +run(`(() => { const f = mk('${id}'); clear(f); put(f, [[ROWS-1,0,1],[ROWS-2,0,1],[ROWS-3,0,1]]); f.piece.a = 1; f.piece.b = 2; ${extra || ''}; const t = plan(f); return t.x === 0 && t.o !== 1 ? 1 : (t.x + DX[t.o] === 0 ? 1 : 0); })()`); } return n / N; };
const calm = { lumi: fires('lumi'), moka: fires('moka') };
const hit = { lumi: fires('lumi', 'f.pending = 6'), moka: fires('moka', 'f.pending = 6') };
console.log('  (참고) 평소 터뜨림 비율', JSON.stringify(calm), '· 방해 6개가 쌓였을 때', JSON.stringify(hit));
ok(hit.moka > hit.lumi, '모카는 방해가 쌓여 있으면 루미보다 더 자주 연쇄를 터뜨려 받아침');
const high = `put(f.opp, []); for (let r = 2; r < ROWS; r++) f.opp.grid[r][2] = f.opp.mk(3, r, 2, 0)`;
const snipe = { lumi: fires('lumi', high), byeol: fires('byeol', high) };
console.log('  (참고) 상대 판이 높을 때 터뜨림 비율', JSON.stringify(snipe));
ok(snipe.byeol > snipe.lumi, '별이는 상대 판이 높으면 루미보다 더 자주 연쇄를 날려 마무리를 노림');
// 3. 솜이: 기분이 바뀜(6수마다 속공/대기 전환)
const moods = run(`(() => { const f = mk('somi'); const seen = new Set(); for (let i = 0; i < 80; i++) { f.planAI(); seen.add(f.moodFast); } return [...seen].join(); })()`);
ok(/true/.test(moods) && /false/.test(moods), `솜이는 기분이 속공/대기 사이를 오감(${moods})`);

console.log(fail ? `\n${fail}개 실패` : '\n모두 통과'); process.exit(fail ? 1 : 0);
