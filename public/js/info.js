// 내 정보 오른쪽 탭: 요약 · 기록 · 랭크 · 순위표
'use strict';

let infoTab = 'sum', histFilter = 'all', rkStyle = null, infoSeq = 0;
const board = { style: null, season: 0, page: 1, q: '' };
const HIST_CATS = [['all', '전체'], ['ai', 'AI 대전'], ['online', '대전'], ['ranked', '랭크전'], ['local', '로컬 대전'], ['adv', '어드벤처'], ['solo', '연습']];
// 예전 기록(종목 칸이 없던 때)은 모드 글자로 종목을 짐작
const histCat = h => h.cat || (/^연습/.test(h.m) ? 'solo' : /^로컬/.test(h.m) ? 'local' : /^어드벤처/.test(h.m) ? 'adv' : /^AI/.test(h.m) ? 'ai' : /^랭크전/.test(h.m) ? 'ranked' : 'online');
const pad2 = n => String(n).padStart(2, '0');
const fmtDate = t => { const d = new Date(t); return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const emCv = (g, d, cls = '') => `<canvas class="${cls}" data-em="${g},${d}"></canvas>`;
const chCv = id => `<canvas data-char="${esc(id || 'lumi')}"></canvas>`;
const httpOk = () => location.protocol.startsWith('http');

function renderStats() {
  stats = loadStats();
  $('pName').value = stats.name;
  $('pGames').textContent = stats.games;
  const w = wins(), l = losses();
  $('pWins').textContent = w;
  $('pRate').textContent = w + l ? Math.round(w / (w + l) * 100) + '%' : '-';
  $('pTime').textContent = fmtTime(stats.playMs);
  renderInfo();
}
function renderInfo() {
  document.querySelectorAll('.itabs .seg').forEach(b => b.classList.toggle('on', b.dataset.act === 'itab:' + infoTab));
  rkStyle = rkStyle || stats.style || 'puyo'; board.style = board.style || stats.style || 'puyo';
  const seq = ++infoSeq;
  ({ sum: infoSum, hist: infoHist, rank: infoRank, board: infoBoard })[infoTab](seq);
}
// innerHTML로 넣은 캔버스(캐릭터 얼굴 · 티어 엠블럼)를 그림
function paintInfo() {
  requestAnimationFrame(() => $('infoCard').querySelectorAll('canvas[data-char], canvas[data-em]').forEach(c => {
    const g = fitCanvas(c); if (!g) return;
    const s = Math.min(g.w, g.h);
    if (c.dataset.char) drawChar(g.x, c.dataset.char, g.w / 2, g.h / 2 + s * 0.04, s * 0.92, 'happy');
    else { const [gr, dv] = c.dataset.em.split(',').map(Number); drawTierEmblem(g.x, g.w / 2, g.h / 2, s * 0.92, gr, dv); }
  }));
}
const setInfo = (bar, body) => { $('iBar').innerHTML = bar; $('iBody').innerHTML = body; paintInfo(); };
const styleSegs = cur => ['puyo', 'tetris'].map(s => `<button class="seg${s === cur ? ' on' : ''}" style="--c:${s === 'puyo' ? '#ff4559' : '#2f78f0'}" data-ist="${s}">${STYLE_KO[s]}</button>`).join('');
const styleBox = cur => `<div class="segs">${styleSegs(cur)}</div>`;

/* ---------- 요약 ---------- */
function infoSum() {
  const C = ['#39c63c', '#ffb400', '#ff4559', '#2f78f0', '#ff8a1c', '#9a4fd8'];
  const w = wins(), l = losses(), tr = stats.tRec || {}, pr = stats.practice || {};
  const rate = (a, b) => a + b ? `승률 ${Math.round(a / (a + b) * 100)}%` : '아직 경기 없음';
  const aw = stats.ai.reduce((a, x) => a + x.w, 0), al = stats.ai.reduce((a, x) => a + x.l, 0);
  const cnt = c => stats.history.filter(h => histCat(h) === c).length;
  const SEC = [
    ['요약', [['플레이 횟수', `${stats.games}판`], ['승률', w + l ? Math.round(w / (w + l) * 100) + '%' : '-', `${w}승 ${l}패`], ['플레이 시간', fmtTime(stats.playMs)],
      ['보낸 공격', stats.sent.toLocaleString()], ['최고 연쇄', `${stats.bestChain}연쇄`, '뿌요뿌요'], ['최고 REN', `${stats.bestRen || 0} REN`, '테트리스']]],
    ['AI 대전', [0, 1, 2].map(i => [`AI ${DIFF[i]}`, `${stats.ai[i].w}승 ${stats.ai[i].l}패`, rate(stats.ai[i].w, stats.ai[i].l)]).concat([['AI 전체', `${aw}승 ${al}패`, rate(aw, al)]])],
    ['대전', [['온라인 대전', `${stats.online.w}승 ${stats.online.l}패`, rate(stats.online.w, stats.online.l)], ['랭크전(최근)', `${cnt('ranked')}판`, '최근 경기 목록 기준'],
      ['로컬 대전(최근)', `${cnt('local')}판`, '최근 경기 목록 기준']]],
    ['뿌요뿌요', [['최고 연쇄', `${stats.bestChain}연쇄`], ['터뜨린 뿌요', stats.pops.toLocaleString()], ['2연쇄 이상', `${stats.chains}번`],
      ['더블 이상', `${stats.doubles}번`, '2색 이상 동시 소거'], ['전멸', `${stats.allClear}번`]]],
    ['테트리스', [['지운 줄', (stats.tLines || 0).toLocaleString()], ['테트리스', `${stats.tTetris || 0}번`, '4줄 한 번에'], ['T스핀', `${stats.tSpins || 0}번`],
      ['퍼펙트 클리어', `${stats.tPC || 0}번`], ['최고 REN', `${stats.bestRen || 0} REN`]]],
    ['연습', [['뿌요뿌요 연습', (pr.best || 0).toLocaleString() + '점', '최고 점수'], ['엔드리스 피버', (pr.fBest || 0).toLocaleString() + '점', `최고 ${pr.fChain || 0}연쇄`],
      ['테트리스 끝없이', (pr.tBest || 0).toLocaleString() + '점', '최고 점수'], ['스프린트', tr.sprint ? fmtClock(tr.sprint) : '-', '40줄 최단 시간'],
      ['울트라', (tr.ultra || 0).toLocaleString() + '점', '3분 최고 점수'], ['마라톤', (tr.marathon || 0).toLocaleString() + '점', '150줄 최고 점수']]],
  ];
  setInfo('', SEC.map(([t, cs]) => `<h4>${t}</h4><div class="chips">` +
    cs.map(([k, v, sub], i) => `<div class="chip" style="--c:${C[i % C.length]}"><span>${k}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`).join('') + '</div>').join(''));
}

/* ---------- 기록 ---------- */
// 랭크전 결과 칸: 내 티어 엠블럼 · RP 변화 · 결과 티어 · 상대 티어
function rankCell(k) {
  if (!k) return '<div class="mrank"></div>';
  const rp = `<b class="${k.d > 0 ? 'up' : k.d < 0 ? 'down' : ''}">${k.d > 0 ? '+' : ''}${k.d} RP</b>`;
  const top = k.event === 'placed' ? (k.d ? rp : '<b>배치 완료</b>') : k.placing ? '<b>배치 경기</b>' : k.d == null ? '<b>-</b>' : rp;
  const ev = { placed: '배치 완료 · ', promote: '승급 · ', master: '마스터 달성 · ', demote: '강등 · ', shield: '강등 보호 · ' }[k.event] || '';
  return `<div class="mrank">${emCv(k.group == null ? -1 : k.group, k.div || 0)}<div>${top}<small>${ev}${esc(k.after || '')}</small>` +
    (k.opp ? `<small>상대 ${esc(k.opp.text || '')}</small>` : '') + '</div></div>';
}
function infoHist() {
  const counts = {}; stats.history.forEach(h => { const c = histCat(h); counts[c] = (counts[c] || 0) + 1; });
  const bar = `<select id="hFilter" title="종목">${HIST_CATS.map(([v, t]) => `<option value="${v}"${v === histFilter ? ' selected' : ''}>${t} (${v === 'all' ? stats.history.length : counts[v] || 0})</option>`).join('')}</select>` +
    '<button data-ib="load" title="파일로 저장한 리플레이를 불러와 봐요">리플레이 불러오기</button><button data-ib="reset" class="warn">기록 초기화</button>';
  const reps = new Map(loadReplays().map(r => [r.id, r]));
  const list = stats.history.filter(h => histFilter === 'all' || histCat(h) === histFilter);
  const body = list.length ? list.map(h => {
    const lab = { w: '승리', l: '패배', p: '연습' }[h.r], ops = h.oc || [];
    const vs = ops.length ? `${chCv(h.mc)}<span>vs</span>${ops.slice(0, 3).map(chCv).join('')}<span>${esc(h.on || '')}</span>` : h.mc ? chCv(h.mc) : '';
    const sub = [h.k === 't' ? `${h.ch} REN` : `${h.ch}연쇄`, h.sr ? `${h.sr[0]} : ${h.sr[1]}` : '', h.pl ? `${h.pl}위` : ''].filter(Boolean).join(' · ');
    const r = h.rp && reps.get(h.rp);
    const btn = !h.rp ? '' : !r ? '<span class="none">리플레이 없음</span>'
      : r.keep ? `<button data-play="${esc(h.rp)}" title="다시 보기">▶</button><button class="file" data-exp="${esc(h.rp)}" title="파일로 저장">💾</button>`
      : `<button class="dl" data-keep="${esc(h.rp)}" title="리플레이 받기(브라우저에 보관)">⤓</button>`;
    return `<div class="mrow ${h.r}"><i class="bar"></i><div class="mmode"><b>${lab}</b><small>${esc(h.m)}</small><small>${fmtDate(h.d)}</small></div>` +
      `<div class="mvs">${vs}</div><div class="mres"><b>${h.sc.toLocaleString()}점</b><small>${sub}</small></div>${rankCell(h.rk)}<div class="mact">${btn}</div></div>`;
  }).join('') : `<div class="empty">${stats.history.length ? '이 종목 기록이 없어요.' : '아직 기록이 없어요. AI 대전이나 대전으로 첫 판을 시작해 보세요.'}</div>`;
  setInfo(bar, body);
}

/* ---------- 랭크 ---------- */
function infoRank(seq) {
  const bar = styleBox(rkStyle);
  if (!httpOk()) { setInfo(bar, '<div class="empty">랭크는 서버에 접속한 주소(http://…)로 열어야 볼 수 있어요.</div>'); return; }
  if (!acct) { setInfo(bar, '<div class="empty">로그인하면 내 랭크를 볼 수 있어요.<br><br><button class="mini" data-ib="login">로그인 · 회원가입</button></div>'); return; }
  setInfo(bar, '<div class="empty">불러오는 중…</div>');
  fetch(rankUrl('me', rkStyle)).then(r => r.json()).then(m => {
    if (seq !== infoSeq) return;
    if (!m || m.error) { setInfo(bar, `<div class="empty">${esc((m && m.error) || '불러오지 못했어요.')}</div>`); return; }
    const s = m.season, master = !m.placing && m.group === 5;
    const sub = m.placing ? `배치 ${m.placed}/${m.need} · ${m.pw}승 ${m.pl}패` : master ? `${m.rp} RP` : `${m.rp} / 100 RP`;
    const note = m.placing ? (m.need >= 10 ? '첫 배치 · 해가 바뀐 첫 배치는 10판이에요(MMR 초기화).' : '같은 해 새 시즌은 5판 배치 · 아주 잘하거나 못하지 않으면 지난 티어를 그대로 이어가요.')
      : '승급 직후 한 번은 강등을 막아 줘요.';
    const hero = `<div class="rkhero">${emCv(m.group, m.placing ? 0 : m.div)}<div><div class="t">${esc(m.placing ? '배치 중' : m.text)}</div>` +
      `<div class="s">${STYLE_KO[rkStyle]} · ${esc(s.name)} (${s.months}) · ${s.daysLeft}일 남음</div><div class="s">${sub}</div>` +
      (m.placing ? `<div class="rpbar"><i style="width:${Math.round(m.placed / m.need * 100)}%"></i></div>` : master ? '' : `<div class="rpbar"><i style="width:${m.rp}%"></i></div>`) +
      `<div class="s note">${note}</div></div></div>`;
    const badge = (t, v) => `<div class="badge">${t}<b>${v}</b></div>`;
    const season = `<h4>이번 시즌</h4><div class="badges">${badge('시즌 전적', `${m.sw}승 ${m.sl}패`)}${badge('시즌 최고', esc(m.placing ? '-' : m.peak))}${badge('통산', `${m.w}승 ${m.l}패`)}</div>`;
    const past = (m.hist || []).length ? `<h4>지난 시즌</h4><div class="badges">${m.hist.map(h => badge(esc(h.name), esc(h.finalRank ? `마스터 #${h.finalRank}` : h.final) + `<small> · 최고 ${esc(h.peak)}</small>`)).join('')}</div>` : '';
    const ms = (m.matches || []).map(x => `<div class="mrow ${x.win ? 'w' : 'l'}"><i class="bar"></i><div class="mmode"><b>${x.win ? '승리' : '패배'}</b><small>랭크전 · ${STYLE_KO[rkStyle]}</small><small>${fmtDate(x.at)}</small></div>` +
      `<div class="mvs">${x.opp ? chCv(x.opp.char) + `<span>${esc(x.opp.name || '상대')}</span>` : ''}</div><div class="mres"><b>${x.score ? `${x.score[0]} : ${x.score[1]}` : '-'}</b><small>시리즈</small></div>${rankCell(x)}<div class="mact"></div></div>`).join('');
    setInfo(bar, hero + season + past + `<h4>최근 랭크전</h4>` + (ms || '<div class="empty">아직 랭크전 기록이 없어요.</div>'));
  }).catch(() => { if (seq === infoSeq) setInfo(bar, '<div class="empty">랭크 정보를 불러오지 못했어요.</div>'); });
}

/* ---------- 순위표 ---------- */
function infoBoard(seq) {
  const bar0 = styleBox(board.style);
  if (!httpOk()) { setInfo(bar0, '<div class="empty">순위표는 서버에 접속한 주소(http://…)로 열어야 볼 수 있어요.</div>'); return; }
  if (!$('iBody').querySelector('.lbrow, .lbhead')) setInfo(bar0, '<div class="empty">불러오는 중…</div>');
  fetch(`/rank/top?style=${board.style}&season=${board.season}&page=${board.page}&q=${encodeURIComponent(board.q)}&token=${rankToken}`).then(r => r.json()).then(t => {
    if (seq !== infoSeq) return;
    board.page = t.page;
    const s = t.season, cur = t.seasons[0] && t.seasons[0].n === s.n;
    const bar = bar0 + `<select id="lbSeason" title="시즌">${t.seasons.map(x => `<option value="${x.n}"${x.n === s.n ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`;
    const head = `<div class="lbhead">${emCv(5, 0)}<div class="t">순위표</div><div class="s">${STYLE_KO[board.style]} · 플래티넘 이상 ${t.total}명<br>${esc(s.name)} · ${cur ? `${s.daysLeft}일 남음` : '종료된 시즌'}</div></div>`;
    const cols = '<div class="lbcols"><span>순위</span><span>티어</span><span>랭크 점수</span><span></span><span>플레이어</span><span style="text-align:right">승리</span></div>';
    const rows = t.rows.map(r => `<div class="lbrow${r.place === 1 ? ' first' : ''}${r.me ? ' me' : ''}"><div class="pl">${r.place}${r.place === 1 ? '<span class="star">★</span>' : ''}</div>` +
      `<div>${emCv(r.group, r.div, 'em')}</div><div><span class="pt">${r.rp}</span><small>${esc(r.label)}</small></div><div>${chCv(r.char)}</div>` +
      `<div class="nm"><b>${esc(r.name)}${r.me ? ' (나)' : ''}</b><small>${esc(r.title || '')}</small></div><div class="wn">${r.wins}승</div></div>`).join('');
    const foot = `<div class="lbfoot"><input id="lbQ" placeholder="플레이어 이름 검색" maxlength="20" value="${esc(board.q)}" spellcheck="false">` +
      `<div class="pg"><button data-pg="-1"${t.page <= 1 ? ' disabled' : ''}>‹</button><span>${t.page} / ${t.pages}</span><button data-pg="1"${t.page >= t.pages ? ' disabled' : ''}>›</button></div></div>`;
    setInfo(bar, head + cols + (rows || `<div class="empty">${board.q ? '찾는 플레이어가 없어요.' : '아직 순위표에 오른 사람이 없어요. 플래티넘 1 이상이면 여기에 올라와요.'}</div>`) + foot);
  }).catch(() => { if (seq === infoSeq) setInfo(bar0, '<div class="empty">순위표를 불러오지 못했어요.</div>'); });
}

/* ---------- 클릭 · 입력 ---------- */
$('infoCard').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.closest('.itabs')) return;
  const d = b.dataset;
  if (d.ist) { if (infoTab === 'rank') rkStyle = d.ist; else { board.style = d.ist; board.page = 1; } renderInfo(); }
  else if (d.ib === 'load') $('rpFile').click();
  else if (d.ib === 'login') openLogin('login', '', () => renderInfo());
  else if (d.ib === 'reset') {
    if (!confirm('지금까지의 기록을 모두 지울까요? 닉네임은 유지돼요.')) return;
    const name = loadStats().name; stats = defStats(); stats.name = name; saveStats(); renderStats(); renderRecords();
  }
  else if (d.keep) { if (!keepReplay(d.keep)) alert('브라우저 저장 공간이 모자라 리플레이를 받지 못했어요. 💾로 받아 둔 리플레이를 파일로 옮기고 지워 보세요.'); renderInfo(); }
  else if (d.play) { const rp = findReplay(d.play); if (rp) startReplay(rp); else renderInfo(); }
  else if (d.exp) { const rp = findReplay(d.exp); if (rp) exportReplay(rp); else renderInfo(); }
  else if (d.pg) { board.page += +d.pg; renderInfo(); }
});
$('infoCard').addEventListener('change', e => {
  if (e.target.id === 'hFilter') { histFilter = e.target.value; renderInfo(); }
  else if (e.target.id === 'lbSeason') { board.season = +e.target.value; board.page = 1; renderInfo(); }
});
$('infoCard').addEventListener('keydown', e => {
  if (e.target.tagName !== 'INPUT') return;
  e.stopPropagation();
  if (e.target.id === 'lbQ' && e.key === 'Enter') { board.q = e.target.value.trim(); board.page = 1; renderInfo(); }
});
$('rpFile').addEventListener('change', () => {
  const file = $('rpFile').files[0]; $('rpFile').value = '';
  if (!file) return;
  file.text().then(t => {
    let rp = null; try { rp = checkReplay(JSON.parse(t)); } catch (e) {}
    if (rp) startReplay(rp); else alert('리플레이 파일이 아니거나 손상된 파일이에요.');
  });
});
