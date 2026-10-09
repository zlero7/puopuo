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
  if (game.mode === 'replay') return;
  if (game.mode === 'online' && game.ranked) nsend({ t: 'rres', win: !!game.fields[0].won });   // 랭크전: 결과 보고(서버가 양쪽을 맞춰 봄)
  const rp = finishRecording();
  stats = loadStats();                   // 다른 탭이 저장한 기록 위에 더함
  const me = game.fields[0], ms = game.el;
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
  const many = game.fields.length > 2;
  const opLab = many ? ` · ${game.fields.length}인 ${me.place || 1}위` : game.fields[1] ? ` vs ${STYLE_KO[game.fields[1].kind]}` : '';
  if (game.mode === 'solo') {
    stats.practice.games++;
    const sm = game.soloMode || 'endless';
    stats.tRec = { sprint: 0, ultra: 0, marathon: 0, ...stats.tRec };
    game.newRecord = false;
    if (!isT && sm === 'efever') { const fb = stats.practice.fBest || 0; game.newRecord = me.score > fb; stats.practice.fBest = Math.max(fb, me.score); stats.practice.fChain = Math.max(stats.practice.fChain || 0, me.maxChain); }
    else if (!isT) { game.newRecord = me.score > stats.practice.best; stats.practice.best = Math.max(stats.practice.best, me.score); }
    else if (sm === 'endless') { game.newRecord = me.score > stats.practice.tBest; stats.practice.tBest = Math.max(stats.practice.tBest, me.score); }
    else if (sm === 'sprint') { if (me.done) { const t = me.doneAt; game.newRecord = !stats.tRec.sprint || t < stats.tRec.sprint; if (game.newRecord) stats.tRec.sprint = Math.round(t); } }
    else { game.newRecord = me.score > stats.tRec[sm]; stats.tRec[sm] = Math.max(stats.tRec[sm], me.score); }
    r = 'p'; mode = `연습 · ${STYLE_KO[me.kind]}${isT ? ' ' + SOLO_KO[sm] : sm === 'efever' ? ' 엔드리스 피버' : ''}`;
  }
  else if (game.mode === 'local') { r = me.won ? 'w' : 'l'; mode = `로컬 대전 · ${STYLE_KO[me.kind]}${opLab}`; }
  else if (game.mode === 'vs' && game.adv) { r = me.won ? 'w' : 'l'; mode = `어드벤처 ${game.adv.c + 1}-${game.adv.s + 1} · ${STYLE_KO[me.kind]}${opLab}`; }
  else if (game.mode === 'vs') { const a = stats.ai[game.diff]; me.won ? a.w++ : a.l++; r = me.won ? 'w' : 'l'; mode = `AI ${DIFF[game.diff]} · ${STYLE_KO[me.kind]}${opLab}`; }
  else { me.won ? stats.online.w++ : stats.online.l++; r = me.won ? 'w' : 'l'; mode = `${game.ranked ? '랭크전' : '대전'} · ${many ? `${game.fields.length}인` : game.fields[1].name} · ${STYLE_KO[me.kind]}${opLab}`; }
  if (BOARD !== 'wide' && !isT) mode += ` · ${BOARDS[BOARD].ko}`;
  // 기록 한 줄: 종목(cat) · 내 캐릭터 · 상대 캐릭터·이름 · 순위(3~4인). 랭크전 결과(RP·상대 티어)는 서버 결과가 오면 rk로 붙음
  const cat = game.mode === 'solo' ? 'solo' : game.mode === 'local' ? 'local' : game.mode === 'online' ? (game.ranked ? 'ranked' : 'online') : game.adv ? 'adv' : 'ai';
  const ops = game.fields.slice(1);
  stats.history.unshift({ d: Date.now(), m: mode, r, sc: me.score, ch: me.maxChain, k: isT ? 't' : 'p', rp, cat, mc: me.char || 'lumi',
    oc: ops.map(f => f.char || 'lumi'), on: ops.map(f => f.name).join(' · '), pl: game.fields.length > 2 ? me.place || null : null,
    sr: game.series && game.series.to > 1 ? [game.series.me, game.series.op] : null });
  stats.history = stats.history.slice(0, 100);
  saveStats();
}
const fmtTime = ms => { const m = Math.round(ms / 60000); return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간 ${m % 60}분`; };
const wins = () => stats.ai.reduce((a, x) => a + x.w, 0) + stats.online.w;
const losses = () => stats.ai.reduce((a, x) => a + x.l, 0) + stats.online.l;
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
  const pr = stats.practice || {};
  $('recPEndless').textContent = pr.best ? `최고 ${pr.best.toLocaleString()}점` : '기록 없음';
  $('recPEfever').textContent = pr.fBest ? `최고 ${pr.fBest.toLocaleString()}점 · ${pr.fChain || 0}연쇄` : '기록 없음';
  $('recOnline').textContent = `${stats.online.w}승 ${stats.online.l}패`;
  $('mainRec').textContent = `${stats.games}판 플레이`;
  const advSt = Object.values(stats.adv || {}).reduce((a, b) => a + b, 0);
  $('advRec').textContent = advSt ? `★ ${advSt}` : '처음부터';
}
