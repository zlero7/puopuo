// 튜토리얼 · 퍼즐(뿌요뿌요): 정해진 판과 정해진 쌍으로 목표(놓기 · 터뜨리기 · 연쇄 · 방해뿌요 없애기)를 이루는 모드
// 원작 6×12 판 · 저절로 떨어지지 않음(↓·Space로 내림) · 쌍을 다 쓰면 실패 · 저장: stats.puz['tut-0'] = 1
'use strict';

const PZ_COL = { '.': 0, R: 1, G: 2, B: 3, Y: 4, P: 5, O: 6 };
// 판은 아래쪽 줄만 적음(위에서 아래 순서). 쌍은 [축, 위에 붙은 뿌요] 색 번호(1 빨강 · 2 초록 · 3 파랑 · 4 노랑)
const LESSONS = [
  { title: '움직이고 돌리기', goal: { t: 'place', n: 3 }, pairs: [[1, 2], [3, 4], [2, 2]], rows: [],
    talk: [['lumi', '안녕! 뿌요뿌요를 처음부터 같이 배워 보자.'], ['lumi', '← → 로 옮기고, Z · X 로 돌려. 터치는 아래 버튼이야.'], ['lumi', '연습에서는 저절로 안 떨어져. ↓ 를 누르고 있거나 Space(⤓)로 한 번에 내려 봐. 3쌍을 놓아 보자!']],
    hint: '← → 이동 · Z X 회전 · ↓ 내리기 · Space 한 번에' },
  { title: '4개 이으면 펑!', goal: { t: 'pop' }, pairs: [[1, 3], [1, 3]], rows: ['R.....', 'RR....'],
    talk: [['lumi', '같은 색 뿌요가 4개 이상 이어지면 터져.'], ['lumi', '빨강이 3개 있지? 빨강 하나를 붙여서 터뜨려 봐!']],
    hint: '빨강 3개 옆에 빨강을 붙여 4개로' },
  { title: '연쇄 만들기', goal: { t: 'chain', n: 2 }, pairs: [[1, 1], [1, 1]], rows: ['..G...', 'RRRGGG'],
    talk: [['lumi', '터진 자리로 위 뿌요가 떨어져서 또 터지면 그게 연쇄야!'], ['lumi', '빨강을 터뜨려서 위에 있는 초록이 떨어지게 해 봐. 초록 4개가 이어지면 2연쇄!']],
    hint: '빨강을 터뜨려 초록을 떨어뜨리기' },
  { title: '방해뿌요 없애기', goal: { t: 'clearOJ' }, pairs: [[2, 4], [2, 4]], rows: ['OO....', 'GGGO..'],
    talk: [['lumi', '회색은 방해뿌요야. 상대가 연쇄하면 내 판에 떨어져.'], ['lumi', '방해뿌요는 혼자서는 안 터지고, 바로 옆 뿌요가 터질 때 같이 없어져.'], ['lumi', '초록을 터뜨려서 방해뿌요를 모두 없애 봐!']],
    hint: '초록을 터뜨려 옆의 방해뿌요까지' },
];
const LESSON_END = [['lumi', '잘했어! 하나만 더 알려 줄게.'], ['lumi', '상대 공격이 오면 판 위에 예고가 떠. 그때 연쇄를 터뜨리면 예고가 줄어들어(상쇄).'],
  ['lumi', '상대 연쇄가 끝나야 방해뿌요가 떨어지니까, 그 사이에 맞받아치면 돼!'], ['lumi', '이제 AI 대전 쉬움에 도전해 보자. 퍼즐로 연쇄 연습도 할 수 있어!']];
// 퍼즐: 한 쌍으로 N연쇄(연쇄 씨앗판을 만들고, 그 쌍으로 풀리는지 미리 확인한 것)
const PUZZLES = [
  { goal: { t: 'chain', n: 3 }, pairs: [[1, 2]], rows: ['G.....', 'G.....', 'G.....', 'B.....', 'B.....', 'B.....', 'R.....', 'RG....', 'RB....'] },
  { goal: { t: 'chain', n: 4 }, pairs: [[4, 1]], rows: ['.R....', '.R....', '.G....', '.B....', 'RY....', 'YYR...', 'GBB...', 'GGB...'] },
  { goal: { t: 'chain', n: 5 }, pairs: [[2, 3]], rows: ['...B..', '...B..', '...B..', '...G..', '...G..', '...RG.', '.Y.GR.', '.GBYR.', 'GGYYR.'] },
  { goal: { t: 'chain', n: 6 }, pairs: [[4, 1]], rows: ['....R.', '...RR.', '...GG.', '...YG.', '...RY.', '...RBR', '...RBY', '..GYBY', '..YYRB'] },
  { goal: { t: 'chain', n: 7 }, pairs: [[2, 3]], rows: ['G.....', 'Y.....', 'R.....', 'RGY...', 'GGR...', 'RBR...', 'RBR...', 'YRB...', 'YGBY..', 'YGGYY.'] },
  { goal: { t: 'chain', n: 8 }, pairs: [[1, 2]], rows: ['...Y..', '...Y..', '..RYG.', '..BRG.', '..BRY.', '..BYB.', '..GYB.', '.GBGY.', '.RGRY.', 'RRGGBB'] },
  { goal: { t: 'chain', n: 9 }, pairs: [[3, 4]], rows: ['R.....', 'B.....', 'RG....', 'RG.G..', 'RG.B..', 'GRYB..', 'RRBG..', 'BYBGR.', 'BYGRBB', 'BRYRRB'] },
  { goal: { t: 'chain', n: 10 }, pairs: [[2, 3]], rows: ['.R....', '.R....', '.YB.B.', '.YRYR.', '.RRYR.', 'YGBBR.', 'YGRBY.', 'GRRGY.', 'GBYGG.', 'BYBRYY'] },
];
const pzList = kind => kind === 'tut' ? LESSONS : PUZZLES;
const pzDone = (kind, i) => !!((stats.puz || {})[`${kind}-${i}`]);
const pzCount = kind => pzList(kind).filter((_, i) => pzDone(kind, i)).length;
const pzGoalText = g => g.t === 'place' ? `쌍 ${g.n}개 놓기` : g.t === 'pop' ? '뿌요 터뜨리기' : g.t === 'clearOJ' ? '방해뿌요 모두 없애기' : `${g.n}연쇄 이상`;

// 시작: kind 'tut'(튜토리얼) | 'puz'(퍼즐), i 번째. 튜토리얼은 먼저 설명 대화
function puzzleGo(kind, i, skipTalk) {
  const L = pzList(kind);
  if (i >= L.length) { game.puzzle = null; if (kind === 'tut') dialog(LESSON_END, () => openMenu('ai', 't-easy')); else openMenu('psolo', 't-puz'); return; }
  const P = L[i];
  const go = () => {
    game.puzzle = { kind, i, def: P, locks: 0, done: false, ok: false };
    game.soloMode = 'puzzle';
    start('solo', null, { me: 'puyo', op: null }, 'classic', 'tsu');
    const f = game.fields[0];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) f.grid[r][c] = null;
    P.rows.forEach((row, k) => { const r = ROWS - P.rows.length + k; [...row].forEach((ch, c) => { const v = PZ_COL[ch]; if (v) f.grid[r][c] = f.mk(v, r, c, r); }); });
    f.pairQ = P.pairs.map(p => p.slice()); f.piece = null; f.phase = 'none'; f.spawn();
    $('bandTitle').textContent = kind === 'tut' ? `튜토리얼 ${i + 1}/${L.length} · ${P.title}` : `퍼즐 ${i + 1}/${L.length}`;
  };
  if (P.talk && !skipTalk) dialog(P.talk, go); else go();
}
// 한 번 놓고 연쇄가 끝날 때마다(puyo.js endChain) 목표 확인. 끝났으면 true(다음 쌍을 꺼내지 않음)
function puzzleCheck(f, chain) {
  const Z = game.puzzle; if (!Z || Z.done || f !== game.fields[0]) return false;
  Z.locks++;
  const g = Z.def.goal, hasOJ = f.grid.some(row => row.some(p => p && p.c === OJ));
  const ok = g.t === 'place' ? Z.locks >= g.n : g.t === 'pop' ? chain >= 1 : g.t === 'clearOJ' ? !hasOJ : chain >= g.n;
  if (ok) { puzzleEnd(true); return true; }
  if (g.t === 'chain' && chain > 0) { puzzleEnd(false, `${chain}연쇄였어. ${g.n}연쇄가 되게 다시 해 보자!`); return true; }
  return false;
}
// 끝: 성공이면 기록하고 '다음', 실패면 '다시 하기'
function puzzleEnd(ok, why) {
  const Z = game.puzzle; if (!Z || Z.done) return;
  Z.done = true; Z.ok = ok;
  const f = game.fields[0]; f.piece = null; f.phase = 'done';
  game.state = 'over'; game.overT = 0; game.recorded = true;
  if (ok) { stats = loadStats(); stats.puz = stats.puz || {}; stats.puz[`${Z.kind}-${Z.i}`] = 1; saveStats(); sfx.win(); } else sfx.lose();
  const L = pzList(Z.kind), last = Z.i === L.length - 1;
  setTimeout(() => {
    if (game.puzzle !== Z) return;
    showResult(ok ? 'yellow' : 'blue', ok ? '성공!' : '아쉬워!', ok ? (Z.kind === 'tut' ? Z.def.title + ' 완료' : `${pzCount('puz')} / ${L.length} 풀었어`) : (why || Z.def.hint || '다시 해 보자!'), [], 'adv');
    $('bRetry').textContent = ok ? (last ? (Z.kind === 'tut' ? '마치기' : '퍼즐 끝') : '다음') : '다시 하기';
    $('bMenu').textContent = '메뉴로';
  }, ok ? 700 : 400);
}
// 쌍을 다 썼는데 목표를 못 이룸 / 쌓여서 끝남
function puzzleOut() { puzzleEnd(false); }
