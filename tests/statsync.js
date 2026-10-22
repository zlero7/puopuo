// 기록 동기화 합치기 시험: 순서와 상관없이 같은 결과 · 겹쳐 올려도 두 번 세지 않음 · 이상한 값 걸러냄
const S = require('../public/js/statsync.js');
let fail = 0; const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
const H = (d, m = '연습', sc = 100) => ({ d, m, r: 'p', sc, ch: 3, k: 'p', cat: 'solo', mc: 'lumi', oc: [], on: '', pl: null, sr: null });
const A = { games: 10, playMs: 5000, bestChain: 7, ai: [{ w: 3, l: 1 }, { w: 0, l: 0 }, { w: 1, l: 0 }], online: { w: 2, l: 2 }, practice: { best: 5000, tBest: 0, games: 4 }, tRec: { sprint: 90000, marathon: 0, ultra: 100 },
  history: [H(3), H(2)], adv: { '0-0': 3, '0-1': 1 }, puz: { 'tut-0': true } };
const B = { games: 7, playMs: 9000, bestChain: 9, ai: [{ w: 1, l: 5 }, { w: 2, l: 0 }, { w: 0, l: 0 }], online: { w: 1, l: 5 }, practice: { best: 3000, tBest: 800, fBest: 90, games: 9 }, tRec: { sprint: 70000, marathon: 500, ultra: 0 },
  history: [H(4), H(3)], adv: { '0-0': 2, '0-2': 2 }, puz: { 'puz-1': true } };
const m = S.merge(A, B), m2 = S.merge(B, A);
ok(JSON.stringify(m) === JSON.stringify(m2), '합치는 순서와 상관없이 같은 결과');
ok(JSON.stringify(S.merge(m, A)) === JSON.stringify(m) && JSON.stringify(S.merge(m, m)) === JSON.stringify(m), '같은 기록을 다시 합쳐도 변하지 않음(두 번 세지 않음)');
ok(m.games === 10 && m.playMs === 9000 && m.bestChain === 9, '쌓이는 숫자는 큰 쪽');
ok(m.ai[0].w === 3 && m.ai[0].l === 5 && m.ai[1].w === 2 && m.online.l === 5, '승패는 칸마다 큰 쪽');
ok(m.practice.best === 5000 && m.practice.tBest === 800 && m.practice.fBest === 90, '연습 최고 기록은 큰 쪽(없던 모드는 다른 쪽 것)');
ok(m.tRec.sprint === 70000 && m.tRec.marathon === 500 && m.tRec.ultra === 100, '스프린트는 짧은 시간 · 마라톤·울트라는 큰 점수');
ok(m.history.length === 3 && m.history[0].d === 4 && m.history[2].d === 2, '최근 경기는 합집합(같은 경기는 한 번만), 최신 순');
ok(m.adv['0-0'] === 3 && m.adv['0-1'] === 1 && m.adv['0-2'] === 2 && m.puz['tut-0'] && m.puz['puz-1'], '어드벤처 별·퍼즐 진행은 합집합');
const many = S.merge({ history: Array.from({ length: 100 }, (_, i) => H(1000 + i)) }, { history: Array.from({ length: 100 }, (_, i) => H(2000 + i)) });
ok(many.history.length === 100 && many.history[0].d === 2099, '최근 경기는 최대 100개');
const bad = S.clean({ games: -5, playMs: 'abc', bestChain: 1e99, ai: 'x', history: [{ d: 'x' }, { d: 5, m: '<b>' + 'a'.repeat(200), sc: -1, r: 'z' }], adv: { '../x': 3, '0-0': 99 }, puz: { 'a b': true, 'tut-0': 1 }, extra: 'x' });
ok(bad.games === 0 && bad.playMs === 0 && bad.bestChain === 999 && bad.ai.length === 3 && bad.history.length === 1 && !/[<>]/.test(bad.history[0].m) && bad.history[0].m.length <= 70 && bad.history[0].r === 'p', '이상한 값은 0·빈칸으로 고치고 모르는 항목은 버림');
ok(!('extra' in bad) && !('../x' in bad.adv) && bad.adv['0-0'] === 3 && !('a b' in bad.puz) && bad.puz['tut-0'], '허용하지 않는 키는 버림');
ok(S.clean(null) === null && S.clean([]) === null && S.clean('x') === null, '객체가 아니면 쓰지 않음');
const loc = { name: '나', keys: { left: ['a'] }, games: 1, history: [{ ...H(3), rp: 'REPLAY1' }] }; S.apply(loc, m);
ok(loc.games === 10 && loc.keys.left[0] === 'a' && loc.name === '나' && loc.history.find(h => h.d === 3).rp === 'REPLAY1', '합친 결과를 입혀도 설정은 그대로, 이 컴퓨터의 리플레이 번호는 지켜짐');
console.log(fail ? `\n${fail}개 실패` : '\n모두 통과'); process.exit(fail ? 1 : 0);
