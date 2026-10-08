// 어드벤처: 스테이지를 이어 깨는 1인 모드
'use strict';

/* ================= 어드벤처 =================
   - 5장 15스테이지. 장마다 새 규칙을 소개(통상 → 테트리스 → 피버 → 여러 규칙 → 최종장)
   - 스테이지마다 상대 캐릭터·규칙·판 크기·인원이 정해져 있고, 시작 전·클리어 후 대화가 나옴
   - 별: ★ 클리어 · ★ 목표 연쇄(테트리스는 REN) 달성 · ★ 목표 시간 안에 클리어
   - 앞 스테이지를 깨야 다음 스테이지가 열림. 기록은 stats.adv 에 저장
   대사의 who: 'me'는 내 캐릭터, 그 밖에는 캐릭터 id */
const ADV = [
  { title: '1장 · 첫걸음', stages: [
    { opp: ['toto'], diff: 0, my: 'puyo', op: 'puyo', chain: 3, time: 90000,
      pre: [['toto', '어서 와… 뿌요는 처음이니?'], ['me', '네! 같은 색 4개를 이으면 터지는 거죠?'], ['toto', '그래. 천천히 해 보렴…']],
      post: [['toto', '오호… 소질이 있구나.'], ['me', '연쇄라는 걸 더 배워 보고 싶어요!']] },
    { opp: ['pin'], diff: 0, my: 'puyo', op: 'puyo', chain: 3, time: 80000,
      pre: [['pin', '개굴! 나랑 한판 붙자!'], ['me', '좋아, 이번엔 연쇄를 노려 볼 거야.']],
      post: [['pin', '개굴… 너 꽤 하는데?'], ['me', '다음은 누구지?']] },
    { opp: ['moka'], diff: 1, my: 'puyo', op: 'puyo', chain: 4, time: 120000,
      pre: [['moka', '흠. 연습생이 여기까지 왔군.'], ['moka', '내 방어를 뚫을 수 있겠나?'], ['me', '뚫고 말겠어요!']],
      post: [['moka', '훌륭하다. 다음 세계로 가 보거라.'], ['me', '다음 세계…?']] },
  ] },
  { title: '2장 · 테트리스의 세계', stages: [
    { opp: ['byeol'], diff: 0, my: 'tetris', op: 'tetris', chain: 2, time: 120000,
      pre: [['byeol', '반짝! 여긴 블록의 세계야!'], ['byeol', '줄을 꽉 채우면 지워져. 4줄 한 번에 지우면 테트리스!'], ['me', '이번엔 블록으로 해 볼게!']],
      post: [['byeol', '반짝반짝! 금방 배우는구나!']] },
    { opp: ['kuro'], diff: 1, my: 'tetris', op: 'tetris', chain: 3, time: 150000,
      pre: [['kuro', '냥. T스핀이라는 걸 아나?'], ['me', 'T를 돌려서 끼워 넣는 거지?'], ['kuro', '흥, 말로만은 쉽다냥.']],
      post: [['kuro', '…계산 밖이었다냥.']] },
    { opp: ['bolt'], diff: 1, my: null, op: 'puyo', chain: 3, time: 150000,
      pre: [['bolt', '삐빅. 뿌요와 테트리스, 둘 다 분석 완료.'], ['bolt', '아무 스타일로나 덤벼라.'], ['me', '내가 고른 스타일로 간다!']],
      post: [['bolt', '오류… 예상보다 강함.'], ['me', '뿌요든 테트리스든 문제없어!']] },
  ] },
  { title: '3장 · 피버 타임', stages: [
    { opp: ['somi'], diff: 0, my: 'puyo', op: 'puyo', rule: 'fever', chain: 5, time: 120000,
      pre: [['somi', '메에~ 피버 규칙 알아?'], ['somi', '상쇄하면 게이지가 차고, 꽉 차면 연쇄 씨앗판이 떨어져~'], ['me', '씨앗판이라니, 신난다!']],
      post: [['somi', '메에… 너 피버 잘하네~']] },
    { opp: ['lumi'], diff: 1, my: 'puyo', op: 'puyo', rule: 'fever', chain: 6, time: 150000,
      pre: [['lumi', '나도 피버라면 자신 있어!'], ['me', '그럼 정정당당하게!']],
      post: [['lumi', '좋았어! 다음엔 내가 이길 거야!']] },
    { opp: ['toto'], diff: 2, my: 'puyo', op: 'puyo', rule: 'fever', chain: 7, time: 180000,
      pre: [['toto', '다시 만났구나… 이번엔 진심으로 할게.'], ['me', '저도 많이 컸다고요!']],
      post: [['toto', '허허… 이제 내가 배워야겠구나.']] },
  ] },
  { title: '4장 · 여러 가지 규칙', stages: [
    { opp: ['pin'], diff: 1, my: 'puyo', op: 'tetris', rule: 'swap', chain: 3, time: 150000,
      pre: [['pin', '개굴! 이번엔 스왑이야. 25초마다 판이 바뀐다고!'], ['me', '뿌요랑 테트리스를 왔다 갔다?']],
      post: [['pin', '정신없지? 개굴개굴!']] },
    { opp: ['moka'], diff: 1, my: null, op: 'puyo', rule: 'bigbang', chain: 4, time: 150000,
      pre: [['moka', '빅뱅이다. 같은 퍼즐을 누가 더 빨리 푸는가.'], ['me', '퍼즐이라면 맡겨 주세요!']],
      post: [['moka', '판단이 빠르군.']] },
    { opp: ['bolt', 'somi'], diff: 1, my: null, op: 'random', rule: 'party', players: 3, chain: 3, time: 125000,
      pre: [['bolt', '파티 모드 기동. 참가자 셋.'], ['somi', '★아이템을 터뜨리면 재밌는 일이 생겨~'], ['me', '2분 동안 점수 1등이 목표!']],
      post: [['somi', '메에~ 즐거웠어!'], ['bolt', '파티 종료. 삐빅.']] },
  ] },
  { title: '5장 · 최종장', stages: [
    { opp: ['kuro'], diff: 2, my: null, op: 'tetris', board: 'classic', chain: 5, time: 180000,
      pre: [['kuro', '원작 크기 6×12 판이다냥. 좁은 판에서 버틸 수 있나?'], ['me', '좁아도 연쇄는 짤 수 있어!']],
      post: [['kuro', '…인정한다냥.']] },
    { opp: ['byeol', 'bolt'], diff: 2, my: null, op: 'random', players: 3, chain: 5, time: 180000,
      pre: [['byeol', '반짝! 마지막 시험은 셋이서!'], ['bolt', '목표: 최후의 1인.'], ['me', '둘 다 덤벼!']],
      post: [['byeol', '반짝… 진짜 강해졌다!']] },
    { opp: ['lumi'], diff: 2, my: null, op: 'random', ft: 2, chain: 6, time: 300000, final: true,
      pre: [['lumi', '드디어 여기까지 왔구나.'], ['lumi', '마지막은 2선승! 전력으로 가자!'], ['me', '처음부터 지금까지 배운 걸 다 보여 줄게!']],
      post: [['lumi', '대단해… 네가 최고야!'], ['me', '모두 덕분이야. 고마워!'], ['lumi', '어드벤처 클리어! 축하해!']] },
  ] },
];
const advKey = (c, s) => `${c}-${s}`;
const advStars = (c, s) => ((stats.adv || {})[advKey(c, s)] || 0);
function advOpen(c, s) { if (s > 0) return advStars(c, s - 1) > 0; if (c > 0) return advStars(c - 1, ADV[c - 1].stages.length - 1) > 0; return true; }
let advChap = 0;

/* ---------- 대화창 ---------- */
const DLG = { lines: [], i: 0, shown: 0, done: null, t: null };
const dlgOpen = () => !$('dlg').classList.contains('hidden');
function dialog(lines, done) {
  if (!lines || !lines.length) { done && done(); return; }
  DLG.lines = lines; DLG.i = 0; DLG.done = done;
  $('dlg').classList.remove('hidden'); dlgShow();
}
function dlgShow() {
  const [who, text] = DLG.lines[DLG.i], id = who === 'me' ? stats.char || 'lumi' : who, ch = charOf(id);
  $('dlgName').textContent = who === 'me' ? `${ch.name} (나)` : ch.name;
  $('dlgName').style.background = ch.col;
  const cv2 = $('dlgFace'), g = fitCanvas(cv2);
  if (g) drawChar(g.x, id, g.w / 2, g.h / 2 + 4, Math.min(g.w, g.h) * 0.82, 'happy');
  DLG.shown = 0; clearInterval(DLG.t);
  DLG.t = setInterval(() => { DLG.shown++; $('dlgText').textContent = text.slice(0, DLG.shown); if (DLG.shown >= text.length) clearInterval(DLG.t); if (DLG.shown % 2) voice(ch, 0); }, 28);
}
function dlgNext() {
  const text = DLG.lines[DLG.i][1];
  if (DLG.shown < text.length) { clearInterval(DLG.t); DLG.shown = text.length; $('dlgText').textContent = text; return; }   // 글자 한 번에
  DLG.i++;
  if (DLG.i < DLG.lines.length) { dlgShow(); return; }
  dlgClose();
}
function dlgClose() { clearInterval(DLG.t); $('dlg').classList.add('hidden'); const d = DLG.done; DLG.done = null; d && d(); }
function dlgKey(e) {
  e.preventDefault();
  if (e.repeat) return;
  if (e.key === 'Escape') dlgClose(); else if (e.key === 'Enter' || e.key === ' ' || e.key === 'z' || e.key === 'x') dlgNext();
}

/* ---------- 화면 ---------- */
function renderAdv() {
  stats = loadStats();
  const sec = $('sc-adv'), ch = ADV[advChap];
  const total = ADV.reduce((a, c, ci) => a + c.stages.reduce((b, _, si) => b + advStars(ci, si), 0), 0), max = ADV.reduce((a, c) => a + c.stages.length * 3, 0);
  sec.innerHTML = `<div class="stylebar"><span class="lab">장</span><div class="segs">` +
    ADV.map((c, i) => `<button class="seg" style="--c:#ff4559" data-act="advc:${i}" data-desc="${esc(c.title)}"${advOpen(i, 0) ? '' : ' disabled'}>${i + 1}장</button>`).join('') +
    `</div><span class="lab">${esc(ch.title)}</span><span class="lab" style="margin-left:auto">★ ${total} / ${max}</span></div>` +
    ch.stages.map((s, i) => {
      const open = advOpen(advChap, i), st = advStars(advChap, i), opp = s.opp.map(id => charOf(id).name).join(' · ');
      const info = [RULES[s.rule || 'tsu'].ko, s.board ? BOARDS[s.board].ko : null, s.players ? `${s.players}인` : null, s.ft ? `${s.ft}선승` : null, ['쉬움', '보통', '어려움'][s.diff]].filter(Boolean).join(' · ');
      return `<button class="tile ${open ? 't-red' : 't-blue'} advst" id="adv-${i}" data-act="${open ? `adv:${i}` : ''}" data-desc="${open ? `상대 ${esc(opp)} · ${esc(info)} · ★ 목표: 클리어 / ${s.my === 'tetris' ? 'REN' : '연쇄'} ${s.chain} 이상 / ${Math.round(s.time / 1000)}초 안에` : '앞 스테이지를 깨면 열려.'}">` +
        `<span class="in"></span><canvas data-char="${s.opp[0]}" style="${open ? '' : 'opacity:0.35'}"></canvas>` +
        `<span class="tt"><small>스테이지 ${advChap + 1}-${i + 1}</small>${open ? esc(opp) : '잠김'}</span>` +
        `<span class="rec">${open ? '★'.repeat(st) + '☆'.repeat(3 - st) : '🔒'}</span></button>`;
    }).join('');
  sec.querySelectorAll('.seg').forEach(b => { b.classList.toggle('on', b.dataset.act === 'advc:' + advChap); b.addEventListener('click', () => act(b.dataset.act)); b.addEventListener('focus', () => { $('mDesc').textContent = b.dataset.desc || ''; }); });
  sec.querySelectorAll('.tile').forEach(t => {
    t.addEventListener('click', () => t.dataset.act && act(t.dataset.act));
    t.addEventListener('mouseenter', () => t.focus({ preventScroll: true }));
    t.addEventListener('focus', () => { $('mDesc').textContent = t.dataset.desc; });
  });
  requestAnimationFrame(() => sec.querySelectorAll('canvas[data-char]').forEach(c => { const g = fitCanvas(c); if (g) drawChar(g.x, c.dataset.char, g.w / 2, g.h / 2 + 4, Math.min(g.w, g.h) * 0.8, 'happy'); }));
}
function advPlay(i, skipTalk, c = advChap) {
  advChap = c;
  const s = ADV[c].stages[i];
  const go = () => {
    game.adv = { c: advChap, s: i, st: s }; game.advGo = true;
    game.diff = s.diff; game.cpuChars = s.opp;
    const my = s.my || stats.style || 'puyo', ops = s.opp.map((_, k) => s.op === 'random' ? (Math.random() < 0.5 ? 'puyo' : 'tetris') : s.op);
    start('vs', null, { me: my, op: ops[0], ops: ops.slice(1) }, s.board || 'wide', s.rule || 'tsu');
  };
  if (skipTalk) go(); else dialog(s.pre, go);
}
// 판이 끝나면(시리즈가 끝났을 때) 결과 저장. 돌려주는 값: 이번에 받은 별(0이면 실패)
function advFinish() {
  const A = game.adv; if (!A) return 0;
  const me = game.fields[0], s = A.st, sr = game.series, done = !sr || sr.to <= 1 || sr.me >= sr.to || sr.op >= sr.to;
  if (!done) return -1;
  const won = sr && sr.to > 1 ? sr.me >= sr.to : me.won;
  if (!won) return 0;
  const stars = 1 + (me.maxChain >= s.chain ? 1 : 0) + (game.el <= s.time ? 1 : 0);
  stats = loadStats(); stats.adv = stats.adv || {};
  const k = advKey(A.c, A.s); stats.adv[k] = Math.max(stats.adv[k] || 0, stars); saveStats();
  return stars;
}
function advNext() {           // 클리어 후: 클리어 대사 → 다음 스테이지 대사 → 시작 (마지막이면 어드벤처 화면)
  const A = game.adv; if (!A) return;
  const s = A.st;
  let c = A.c, i = A.s + 1; if (i >= ADV[c].stages.length) { c++; i = 0; }
  dialog(s.post, () => {
    if (c >= ADV.length) { game.adv = null; openMenu('adv'); return; }
    advChap = c; advPlay(i);
  });
}
function advToMenu(withTalk) {
  const A = game.adv; game.adv = null; game.cpuChars = null;
  if (A) advChap = A.c;
  const back = () => openMenu('adv', A ? `adv-${A.s}` : undefined);
  if (withTalk && A) dialog(A.st.post, back); else back();
}
