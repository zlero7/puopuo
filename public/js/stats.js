// 기록(내 정보)
'use strict';

/* ================= 기록(내 정보) ================= */
const STATS_KEY = 'puyo-stats-v1';
const defStats = () => ({ name: '플레이어', games: 0, playMs: 0, ai: [{ w: 0, l: 0 }, { w: 0, l: 0 }, { w: 0, l: 0 }],
  online: { w: 0, l: 0 }, practice: { games: 0, best: 0, tBest: 0 }, bestChain: 0, pops: 0, chains: 0, allClear: 0, sent: 0, doubles: 0,
  tLines: 0, tTetris: 0, tSpins: 0, tPC: 0, bestRen: 0, style: 'puyo', cpuStyle: 'puyo', firstTo: 2,
  tRec: { sprint: 0, ultra: 0, marathon: 0 }, history: [] });
function loadStats() {
  try { const v = JSON.parse(localStorage.getItem(STATS_KEY)); return v ? { ...defStats(), ...v } : defStats(); }
  catch (e) { return defStats(); }
}
function saveStats() { try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) {} }
let stats = loadStats();
function recordGame() {
  if (game.recorded) return; game.recorded = true;
  stats = loadStats();                   // 다른 탭이 저장한 기록 위에 더함
  const me = game.fields[0], ms = performance.now() - game.t0;
  stats.games++; stats.playMs += ms;
  const isT = me.kind === 'tetris';
  stats.practice = { games: 0, best: 0, tBest: 0, ...stats.practice };
  if (isT) {
    stats.bestRen = Math.max(stats.bestRen || 0, me.maxChain);
    stats.tLines = (stats.tLines || 0) + me.pops; stats.tTetris = (stats.tTetris || 0) + me.chains2;
    stats.tSpins = (stats.tSpins || 0) + me.doubles; stats.tPC = (stats.tPC || 0) + me.allClears;
  } else {
    stats.bestChain = Math.max(stats.bestChain, me.maxChain);
    stats.pops += me.pops; stats.chains += me.chains2; stats.allClear += me.allClears; stats.doubles += me.doubles;
  }
  stats.sent += me.sent;
  let r, mode;
  const opLab = game.fields[1] ? ` vs ${STYLE_KO[game.fields[1].kind]}` : '';
  if (game.mode === 'solo') {
    stats.practice.games++;
    const sm = isT ? game.soloMode || 'endless' : 'endless';
    stats.tRec = { sprint: 0, ultra: 0, marathon: 0, ...stats.tRec };
    game.newRecord = false;
    if (!isT) { game.newRecord = me.score > stats.practice.best; stats.practice.best = Math.max(stats.practice.best, me.score); }
    else if (sm === 'endless') { game.newRecord = me.score > stats.practice.tBest; stats.practice.tBest = Math.max(stats.practice.tBest, me.score); }
    else if (sm === 'sprint') { if (me.done) { const t = me.doneAt - game.t0; game.newRecord = !stats.tRec.sprint || t < stats.tRec.sprint; if (game.newRecord) stats.tRec.sprint = Math.round(t); } }
    else { game.newRecord = me.score > stats.tRec[sm]; stats.tRec[sm] = Math.max(stats.tRec[sm], me.score); }
    r = 'p'; mode = `연습 · ${STYLE_KO[me.kind]}${isT ? ' ' + SOLO_KO[sm] : ''}`;
  }
  else if (game.mode === 'local') { r = me.won ? 'w' : 'l'; mode = `로컬 대전 · ${STYLE_KO[me.kind]}${opLab}`; }
  else if (game.mode === 'vs') { const a = stats.ai[game.diff]; me.won ? a.w++ : a.l++; r = me.won ? 'w' : 'l'; mode = `AI ${DIFF[game.diff]} · ${STYLE_KO[me.kind]}${opLab}`; }
  else { me.won ? stats.online.w++ : stats.online.l++; r = me.won ? 'w' : 'l'; mode = `대전 · ${game.fields[1].name} · ${STYLE_KO[me.kind]}${opLab}`; }
  if (BOARD !== 'wide' && !isT) mode += ` · ${BOARDS[BOARD].ko}`;
  stats.history.unshift({ d: Date.now(), m: mode, r, sc: me.score, ch: me.maxChain, k: isT ? 't' : 'p' });
  stats.history = stats.history.slice(0, 12);
  saveStats();
}
const fmtTime = ms => { const m = Math.round(ms / 60000); return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간 ${m % 60}분`; };
const wins = () => stats.ai.reduce((a, x) => a + x.w, 0) + stats.online.w;
const losses = () => stats.ai.reduce((a, x) => a + x.l, 0) + stats.online.l;
let recTab = 'sum';
function renderStats() {
  stats = loadStats();
  $('pName').value = stats.name;
  $('pGames').textContent = stats.games;
  const w = wins(), l = losses();
  $('pWins').textContent = w;
  $('pRate').textContent = w + l ? Math.round(w / (w + l) * 100) + '%' : '-';
  $('pTime').textContent = fmtTime(stats.playMs);
  const C = ['#39c63c', '#ffb400', '#ff4559', '#2f78f0', '#ff8a1c', '#9a4fd8'];
  const rate = (a, b) => a + b ? `승률 ${Math.round(a / (a + b) * 100)}%` : '아직 경기 없음';
  const tr = stats.tRec || {}, pr = stats.practice || {};
  const loc = stats.history.filter(h => h.m.startsWith('로컬'));
  const TABS = {
    sum: [['플레이 횟수', `${stats.games}판`], ['승률', w + l ? Math.round(w / (w + l) * 100) + '%' : '-', `${w}승 ${l}패`], ['플레이 시간', fmtTime(stats.playMs)],
      ['보낸 공격', stats.sent.toLocaleString()], ['최고 연쇄', `${stats.bestChain}연쇄`, '뿌요뿌요'], ['최고 REN', `${stats.bestRen || 0} REN`, '테트리스']],
    ai: [0, 1, 2].map(i => [`AI ${DIFF[i]}`, `${stats.ai[i].w}승 ${stats.ai[i].l}패`, rate(stats.ai[i].w, stats.ai[i].l)])
      .concat([['AI 전체', `${stats.ai.reduce((a, x) => a + x.w, 0)}승 ${stats.ai.reduce((a, x) => a + x.l, 0)}패`, rate(stats.ai.reduce((a, x) => a + x.w, 0), stats.ai.reduce((a, x) => a + x.l, 0))]]),
    online: [['온라인 대전', `${stats.online.w}승 ${stats.online.l}패`, rate(stats.online.w, stats.online.l)],
      ['로컬 대전(최근)', `${loc.length}판`, '최근 경기 목록 기준']],
    puyo: [['최고 연쇄', `${stats.bestChain}연쇄`], ['터뜨린 뿌요', stats.pops.toLocaleString()], ['2연쇄 이상', `${stats.chains}번`],
      ['더블 이상', `${stats.doubles}번`, '2색 이상 동시 소거'], ['전멸', `${stats.allClear}번`], ['연습 최고', (pr.best || 0).toLocaleString() + '점']],
    tetris: [['지운 줄', (stats.tLines || 0).toLocaleString()], ['테트리스', `${stats.tTetris || 0}번`, '4줄 한 번에'], ['T스핀', `${stats.tSpins || 0}번`],
      ['퍼펙트 클리어', `${stats.tPC || 0}번`], ['최고 REN', `${stats.bestRen || 0} REN`]],
    solo: [['뿌요뿌요 연습', (pr.best || 0).toLocaleString() + '점', '최고 점수'], ['테트리스 끝없이', (pr.tBest || 0).toLocaleString() + '점', '최고 점수'],
      ['스프린트', tr.sprint ? fmtClock(tr.sprint) : '-', '40줄 최단 시간'], ['울트라', (tr.ultra || 0).toLocaleString() + '점', '3분 최고 점수'],
      ['마라톤', (tr.marathon || 0).toLocaleString() + '점', '150줄 최고 점수']],
  };
  document.querySelectorAll('.rtabs .seg').forEach(b => b.classList.toggle('on', b.dataset.act === 'rtab:' + recTab));
  $('chips').innerHTML = TABS[recTab].map(([k, v, sub], i) => `<div class="chip" style="--c:${C[i % C.length]}"><span>${k}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`).join('');
  const pad2 = n => String(n).padStart(2, '0');
  $('hist').innerHTML = stats.history.length ? stats.history.map(h => {
    const d = new Date(h.d), lab = { w: '승리', l: '패배', p: '연습' }[h.r];
    return `<tr><td>${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}</td><td>${esc(h.m)}</td>` +
      `<td><span class="res ${h.r}">${lab}</span></td><td>${h.sc.toLocaleString()}점</td><td>${h.ch}${h.k === 't' ? ' REN' : '연쇄'}</td></tr>`;
  }).join('') : '<tr><td class="empty">아직 기록이 없어요. AI 대전이나 대전으로 첫 판을 시작해 보세요.</td></tr>';
}
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function renderRecords() {
  stats = loadStats();
  const pb = (stats.style === 'tetris' ? (stats.practice || {}).tBest : (stats.practice || {}).best) || 0;
  $('recSolo').textContent = pb ? `최고 ${pb.toLocaleString()}점` : '기록 없음';
  renderStyle();
  const tr = stats.tRec || {};
  $('recMarathon').textContent = tr.marathon ? `최고 ${tr.marathon.toLocaleString()}점` : '기록 없음';
  $('recSprint').textContent = tr.sprint ? `최고 ${fmtClock(tr.sprint)}` : '기록 없음';
  $('recUltra').textContent = tr.ultra ? `최고 ${tr.ultra.toLocaleString()}점` : '기록 없음';
  $('recEndless').textContent = (stats.practice || {}).tBest ? `최고 ${stats.practice.tBest.toLocaleString()}점` : '기록 없음';
  [0, 1, 2].forEach(i => { $('rec' + i).textContent = `${stats.ai[i].w}승 ${stats.ai[i].l}패`; });
  $('recOnline').textContent = `${stats.online.w}승 ${stats.online.l}패`;
  $('mainRec').textContent = `${stats.games}판 플레이`;
}
