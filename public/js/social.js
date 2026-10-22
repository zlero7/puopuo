// 친구 · 프로필(남의 전적 보기) · 우클릭 메뉴 — 앱(로그인한 계정)에서만. 서버와는 열려 있는 웹소켓의 soc 메시지로 주고받음
'use strict';

const soc = { me: null, friends: [], inc: [], out: [], loaded: false, pend: [] };
const socOn = () => !!(APP && appCfg.account);
const pidKey = p => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const isFriend = p => soc.friends.some(f => pidKey(f.pid) === pidKey(p));

/* ---------- 서버와 주고받기 ---------- */
// 연결(+로그인)이 될 때까지 기다렸다가 보내고, 같은 종류 답(또는 오류)이 오면 돌려줌
function socReady(ms = 8000) {
  return new Promise(res => {
    if (!socOn()) { res(false); return; }
    const ok = () => net.ws && net.ws.readyState === 1 && net.authed;
    if (ok()) { res(true); return; }
    connect(() => {});
    const t0 = Date.now(), iv = setInterval(() => {
      if (ok()) { clearInterval(iv); if (!net.wait && !net.queued && game.mode !== 'online') status(''); res(true); }
      else if (Date.now() - t0 > ms || !net.ws) { clearInterval(iv); res(false); }
    }, 120);
  });
}
async function socAsk(msg, op) {
  if (!socOn()) return { op: 'err', msg: '로그인하면 쓸 수 있어요.' };
  if (!await socReady()) return { op: 'err', msg: '서버에 연결하지 못했어요. 잠시 뒤에 다시 해 주세요.' };
  return new Promise(res => {
    const w = { op, res, t: setTimeout(() => { soc.pend = soc.pend.filter(x => x !== w); res({ op: 'err', msg: '서버가 응답하지 않아요.' }); }, 8000) };
    soc.pend.push(w); net.ws.send(JSON.stringify({ t: 'soc', ...msg }));
  });
}
function socOnMsg(m) {
  if (m.op === 'ping') {                         // 상대가 보낸 알림(요청이 왔어요 · 수락했어요 · 대전 신청 · 거절)
    if (m.what === 'invite') { showInvite(m); return; }
    if (m.what === 'declined') {
      socToast(m.why === 'busy' ? `${m.name}님은 지금 다른 게임 중이에요` : `${m.name}님이 대전 신청을 거절했어요`);
      if (net.invitedPid && pidKey(net.invitedPid) === pidKey(m.pid)) { net.invitedPid = null; if (net.wait && game.mode !== 'online') cancelWait(); }
      return;
    }
    socToast(m.what === 'request' ? `${m.name}님이 친구 요청을 보냈어요` : `${m.name}님과 친구가 됐어요`);
    if (game.state === 'menu' && cur === 'stats' && infoTab === 'friends') renderInfo();
    return;
  }
  if (m.op === 'list') { soc.me = m.me; soc.friends = m.friends; soc.inc = m.inc; soc.out = m.out; soc.loaded = true; }
  const i = soc.pend.findIndex(w => w.op === m.op || m.op === 'err');
  if (i >= 0) { const w = soc.pend.splice(i, 1)[0]; clearTimeout(w.t); w.res(m); }
}
// 대표 캐릭터를 서버에 알림(친구·순위표에 보이는 캐릭터). 연결돼 있을 때만(일부러 연결하지 않음)
function socChar() {
  if (socOn() && net.ws && net.ws.readyState === 1 && net.authed) net.ws.send(JSON.stringify({ t: 'soc', op: 'char', char: stats.char || 'lumi' }));
}
let toastT = 0;
function socToast(msg) {
  const el = $('socToast'); el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.add('hidden'), 4000);
}

/* ---------- 작은 도우미 ---------- */
// innerHTML로 넣은 캐릭터 얼굴·티어 엠블럼 캔버스를 그림(root 안)
function paintCanvases(root) {
  requestAnimationFrame(() => root.querySelectorAll('canvas[data-char], canvas[data-em]').forEach(c => {
    const g = fitCanvas(c); if (!g) return;
    const s = Math.min(g.w, g.h);
    if (c.dataset.char) drawChar(g.x, c.dataset.char, g.w / 2, g.h / 2 + s * 0.04, s * 0.92, 'happy');
    else { const [gr, dv] = c.dataset.em.split(',').map(Number); drawTierEmblem(g.x, g.w / 2, g.h / 2, s * 0.92, gr, dv); }
  }));
}
const charIdx = id => Math.max(0, CHARS.findIndex(c => c.id === id));
const portrait = (id, cls = '') => { const ch = charOf(id); return `<div class="pv ${cls}" style="--n:${charIdx(ch.id)};--d:${ch.d}"></div>`; };
function copyText(text, inputEl) {                  // 앱 화면에는 클립보드 권한이 없어서, 글자를 선택해 복사 명령을 씀
  const t = inputEl || Object.assign(document.createElement('input'), { value: text, readOnly: true });
  if (!inputEl) { t.style.cssText = 'position:fixed;left:-999px;top:0'; document.body.appendChild(t); }
  t.focus(); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
  if (!inputEl) t.remove(); return ok;
}
const tierText = c => { const st = (stats.style || 'puyo'), r = c.rk && (c.rk[st] || c.rk[st === 'puyo' ? 'tetris' : 'puyo']); return r ? r.text : '랭크전 기록 없음'; };

/* ---------- 내 정보: 친구 탭 ---------- */
function infoFriends(seq) {
  if (!httpOk()) { setInfo('', `<div class="empty">${APP ? '서버 주소를 정하면 볼 수 있어요.' : '친구 기능은 앱에서 로그인하면 쓸 수 있어요.'}</div>`); return; }
  if (!socOn()) { needLoginMsg('', '로그인하면 친구를 추가하고 전적을 볼 수 있어요.'); return; }
  if (!soc.loaded) setInfo('', '<div class="empty">불러오는 중…</div>');
  socAsk({ op: 'list' }, 'list').then(m => {
    if (seq !== infoSeq) return;
    if (m.op === 'err') { setInfo('', `<div class="empty">${esc(m.msg)}<br><button class="mini" style="--d:#1747b0;margin-top:8px" data-sc="retry">다시 불러오기</button></div>`); return; }
    paintFriends();
  });
}
function paintFriends(note) {
  const row = (f, kind) => {
    const acts = { inc: `<button data-sc="acc" data-pid="${esc(f.pid)}">수락</button><button class="warn" data-sc="del" data-pid="${esc(f.pid)}">거절</button>`,
      out: `<button class="warn" data-sc="del" data-pid="${esc(f.pid)}">취소</button>`,
      fr: `<button data-sc="inv" data-pid="${esc(f.pid)}" title="${f.online ? '대전을 신청해요' : '접속 중일 때만 신청할 수 있어요'}"${f.online ? '' : ' disabled'}>대전</button><button data-sc="prof" data-pid="${esc(f.pid)}">전적</button><button class="warn" data-sc="del" data-pid="${esc(f.pid)}">삭제</button>` }[kind];
    return `<div class="frow" data-pid="${esc(f.pid)}"><div class="fc">${chCv(f.char)}</div><div class="nm"><b>${esc(f.name)}</b>` +
      `<small>${kind === 'fr' ? `<i class="dot${f.online ? ' on' : ''}"></i>${f.online ? '접속 중' : '오프라인'} · ` : ''}${esc(tierText(f))}</small></div><div class="acts">${acts}</div></div>`;
  };
  const sec = (title, list, kind, empty) => `<h4>${title}${list.length ? ` (${list.length})` : ''}</h4>` + (list.length ? list.map(f => row(f, kind)).join('') : empty ? `<div class="empty small">${empty}</div>` : '');
  const html = `<div class="socme"><span>내 친구 코드</span><input id="socMine" value="${esc(soc.me.pid)}" readonly size="9" spellcheck="false"><button data-sc="copy">복사</button><small>이 코드를 알려 주면 친구 요청을 받을 수 있어요</small></div>` +
    `<div class="socadd"><input id="socCode" maxlength="9" placeholder="친구 코드 (예: ABCD-EFGH)" spellcheck="false" autocomplete="off"><button data-sc="add">친구 요청 보내기</button></div>` +
    `<div class="socnote" id="socNote">${note ? esc(note) : ''}</div>` +
    (soc.inc.length ? sec('받은 요청', soc.inc, 'inc') : '') + sec('친구', soc.friends, 'fr', '아직 친구가 없어요. 위에 친구 코드를 넣거나, 순위표의 플레이어를 우클릭해 추가해 보세요.') + (soc.out.length ? sec('보낸 요청(상대가 수락하면 친구가 돼요)', soc.out, 'out') : '') +
    '<div class="hintclick">▶ 친구를 우클릭하면 대전 신청·전적 보기·삭제를 할 수 있어요</div>';
  setInfo('', html);
}
const socNote = (msg, bad) => { const n = $('socNote'); if (n) { n.textContent = msg; n.classList.toggle('bad', !!bad); } };
async function socAction(op, pid) {
  const r = await socAsk({ op, pid }, 'list');
  if (r.op === 'err') { socNote(r.msg, true); socToast(r.msg); return r; }
  if (game.state === 'menu' && cur === 'stats' && infoTab === 'friends') paintFriends(op === 'add' ? '친구 요청을 보냈어요. 상대가 수락하면 친구가 돼요.' : '');
  return r;
}

/* ---------- 전적 보기 창 ---------- */
let profPid = '', profStyle = null;
async function openProfile(pid, style) {
  if (!socOn()) { needLogin(() => openProfile(pid, style)); return; }
  profPid = pid; profStyle = style || profStyle || stats.style || 'puyo';
  $('profBody').innerHTML = '<div class="empty">불러오는 중…</div>'; $('profModal').classList.remove('hidden'); $('profClose').focus();
  const r = await socAsk({ op: 'prof', pid, sty: profStyle }, 'prof');
  if (profPid !== pid || $('profModal').classList.contains('hidden')) return;
  if (r.op === 'err') { $('profBody').innerHTML = `<div class="empty">${esc(r.msg)}</div>`; return; }
  paintProfile(r);
}
function paintProfile(r) {
  const u = r.user, p = r.profile, ch = charOf(u.char), st = r.style;
  const rel = { friend: `<button data-sc="inv" data-pid="${esc(u.pid)}"${u.online ? '' : ' disabled'}>대전 신청</button><button class="warn" data-sc="del" data-pid="${esc(u.pid)}">친구 삭제</button>`, none: `<button data-sc="add" data-pid="${esc(u.pid)}">친구 추가</button>`,
    outgoing: `<button class="warn" data-sc="del" data-pid="${esc(u.pid)}">요청 취소</button>`, incoming: `<button data-sc="acc" data-pid="${esc(u.pid)}">수락</button><button class="warn" data-sc="del" data-pid="${esc(u.pid)}">거절</button>`, me: '<small>나</small>' }[r.rel] || '';
  const since = u.since ? `${new Date(u.since).getFullYear()}.${pad2(new Date(u.since).getMonth() + 1)}.${pad2(new Date(u.since).getDate())} 가입` : '';
  const head = `<div class="phead">${portrait(u.char)}<div class="pinfo"><div class="pn">${esc(u.name)}<i class="dot${u.online ? ' on' : ''}" title="${u.online ? '접속 중' : '오프라인'}"></i></div>` +
    `<div class="ps">대표 캐릭터 · ${esc(ch.name)}</div><div class="ps">친구 코드 ${esc(u.pid)}${since ? ' · ' + since : ''}</div><div class="prel">${rel}</div></div></div>`;
  const segs = `<div class="segs">${['puyo', 'tetris'].map(s => `<button class="seg${s === st ? ' on' : ''}" style="--c:${s === 'puyo' ? '#ff4559' : '#2f78f0'}" data-psty="${s}">${STYLE_KO[s]}</button>`).join('')}</div>`;
  let body;
  if (!p.has) body = '<div class="empty">아직 이 종목의 랭크전 기록이 없어요.</div>';
  else {
    const master = !p.placing && p.group === 5;
    const sub = p.placing ? `배치 ${p.placed}/${p.need}` : master ? `${p.rp} RP` : `${p.rp} / 100 RP`;
    const hero = `<div class="rkhero">${emCv(p.group, p.placing ? 0 : p.div)}<div><div class="t">${esc(p.placing ? '배치 중' : p.text)}</div><div class="s">${STYLE_KO[st]} · ${esc(p.season)}</div><div class="s">${sub}</div></div></div>`;
    const badge = (t, v) => `<div class="badge">${t}<b>${v}</b></div>`;
    const stat = `<div class="badges" style="margin-top:10px">${badge('시즌 전적', `${p.sw}승 ${p.sl}패`)}${badge('통산', `${p.w}승 ${p.l}패`)}${badge('시즌 최고', esc(p.placing ? '-' : p.peak))}${(p.hist || []).slice(0, 2).map(h => badge(esc(h.name), esc(h.finalRank ? `마스터 #${h.finalRank}` : h.final))).join('')}</div>`;
    const ms = p.matches.map(x => `<div class="mrow ${x.win ? 'w' : 'l'}"><i class="bar"></i><div class="mmode"><b>${x.win ? '승리' : '패배'}</b><small>랭크전 · ${STYLE_KO[st]}</small><small>${fmtDate(x.at)}</small></div>` +
      `<div class="mvs">${x.opp ? chCv(x.opp.char) + `<span>${esc(x.opp.name || '상대')}</span>` : ''}</div><div class="mres"><b>${x.score ? `${x.score[0]} : ${x.score[1]}` : '-'}</b><small>시리즈</small></div>${rankCell(x)}<div class="mact"></div></div>`).join('');
    body = hero + stat + '<h4>최근 랭크전</h4>' + (ms || '<div class="empty">아직 랭크전 기록이 없어요.</div>');
  }
  $('profBody').innerHTML = head + segs + body; paintCanvases($('profBody'));
}
function closeProfile() { $('profModal').classList.add('hidden'); profPid = ''; }
$('profClose').addEventListener('click', closeProfile);
$('profModal').addEventListener('click', async e => {
  if (e.target === $('profModal')) { closeProfile(); return; }
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.psty) { openProfile(profPid, b.dataset.psty); return; }
  if (b.dataset.sc === 'inv') { closeProfile(); socInvite(b.dataset.pid); return; }
  if (b.dataset.sc) { await socAction(b.dataset.sc, b.dataset.pid); openProfile(profPid, profStyle); }
});
$('profModal').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closeProfile(); });

/* ---------- 우클릭 메뉴 ---------- */
function ctxClose() { $('ctxMenu').classList.add('hidden'); }
function ctxOpen(x, y, items) {
  const m = $('ctxMenu'); m.innerHTML = items.map((it, i) => `<button data-i="${i}"${it.warn ? ' class="warn"' : ''}>${esc(it.t)}</button>`).join('');
  m._items = items; m.classList.remove('hidden');
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(4, Math.min(x, innerWidth - w - 4)) + 'px'; m.style.top = Math.max(4, Math.min(y, innerHeight - h - 4)) + 'px';
  m.firstChild && m.firstChild.focus();
}
$('ctxMenu').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const it = $('ctxMenu')._items[+b.dataset.i]; ctxClose(); it.f(); });
$('ctxMenu').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Escape') ctxClose();
  const bs = [...$('ctxMenu').children], i = bs.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
});
document.addEventListener('mousedown', e => { if (!e.target.closest('#ctxMenu')) ctxClose(); }, true);
window.addEventListener('blur', ctxClose); window.addEventListener('resize', ctxClose);
$('iBody').addEventListener('scroll', ctxClose, true);
// 순위표 줄 · 친구 줄 · 전적 창의 이름을 우클릭
document.addEventListener('contextmenu', async e => {
  const r = e.target.closest('.lbrow[data-pid], .frow[data-pid], .prow[data-pid]'); if (!r) return;
  e.preventDefault(); const mx = e.clientX, my = e.clientY;
  if (!soc.loaded && socOn()) await socAsk({ op: 'list' }, 'list');      // 친구 목록을 아직 안 받았으면 먼저 받아서, 이미 친구인 사람에게 '친구 추가'가 뜨지 않게
  const pid = r.dataset.pid, items = [{ t: '전적 보기', f: () => openProfile(pid) }];
  if (r.classList.contains('frow') || (isFriend(pid) && !r.classList.contains('me'))) items.push({ t: '대전 신청', f: () => socInvite(pid) });
  if (r.classList.contains('frow')) items.push({ t: '친구 삭제', warn: true, f: () => { if (confirm('이 친구를 삭제할까요?')) socAction('del', pid); } });
  else if (!r.classList.contains('me') && !isFriend(pid)) items.push({ t: '친구 추가', f: async () => { if (needLogin(() => {})) return; const x = await socAction('add', pid); socToast(x.op === 'err' ? x.msg : '친구 요청을 보냈어요'); } });
  ctxOpen(mx, my, items);
});

/* ---------- 클릭 ---------- */
$('infoCard').addEventListener('click', async e => {
  const b = e.target.closest('button[data-sc]'); if (!b) return;
  const k = b.dataset.sc, pid = b.dataset.pid;
  if (k === 'retry') renderInfo();
  else if (k === 'copy') socNote(copyText('', $('socMine')) ? '친구 코드를 복사했어요.' : '복사하지 못했어요. 코드를 직접 선택해 복사해 주세요.');
  else if (k === 'add') { const v = $('socCode').value.trim(); if (!v) { socNote('친구 코드를 입력해 주세요.', true); return; } const r = await socAction('add', v); if (r.op !== 'err') { const c = $('socCode'); if (c) c.value = ''; } }
  else if (k === 'inv') socInvite(pid);
  else if (k === 'prof') openProfile(pid);
  else if (k === 'del') { if (!confirm('정말 삭제(거절·취소)할까요?')) return; socAction('del', pid); }
  else if (k === 'acc') socAction('acc', pid);
});
$('infoCard').addEventListener('keydown', e => { if (e.target.id === 'socCode' && e.key === 'Enter') { e.stopPropagation(); $('infoCard').querySelector('[data-sc="add"]').click(); } });

/* ---------- 친구에게 대전 신청 ---------- */
function socInvite(pid) {
  const f = soc.friends.find(x => pidKey(x.pid) === pidKey(pid));
  if (!f) { socToast('친구에게만 대전을 신청할 수 있어요'); return; }
  if (!f.online) { socToast(`${f.name}님은 지금 접속 중이 아니에요`); return; }
  if (net.wait || game.mode === 'online') { socToast('매칭을 기다리는 중이거나 대전 중이에요. 먼저 취소해 주세요'); return; }
  matchTarget = { pid: f.pid, name: f.name };
  openMatch('invite'); $('mmSub').textContent = `${f.name}님에게 대전을 신청해요. 친구가 수락하면 바로 시작해요.`;
}
// 방이 만들어지면(net.js 'created') 친구에게 방 코드를 실어 신청을 보냄. 안 되면(오프라인 등) 방을 접음
async function socSendInvite(code) {
  const iv = net.inviteTo; net.inviteTo = null; if (!iv) return;
  const r = await socAsk({ op: 'inv', pid: iv.pid, code, style: iv.style, rule: iv.rule, board: iv.board }, 'inv');
  if (r.op === 'err') { socToast(r.msg); if (net.wait) cancelWait(); return; }
  net.invitedPid = iv.pid; socToast(`${iv.name}님에게 신청했어요. 수락을 기다리는 중…`);
}
let invData = null, invT = 0;
function closeInvite() { clearTimeout(invT); $('invModal').classList.add('hidden'); invData = null; }
function showInvite(m) {
  if (game.state !== 'menu' || net.wait || game.mode === 'online' || invData) {       // 지금은 받을 수 없음 → 자동 거절(바쁨)
    if (net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify({ t: 'soc', op: 'dec', pid: m.pid, why: 'busy' })); return;
  }
  invData = m;
  const st = m.style ? STYLE_KO[m.style] : '', ru = RULES[m.rule] ? RULES[m.rule].ko : '', bd = BOARDS[m.board] ? BOARDS[m.board].ko : '';
  $('invTitle').textContent = '대전 신청'; $('invText').textContent = `${m.name}님이 대전을 신청했어요.` + ([st, ru, bd].filter(Boolean).length ? ` (${[st, ru, bd].filter(Boolean).join(' · ')})` : '');
  $('invModal').classList.remove('hidden'); $('invOk').focus(); if (APP && APP.attention && !document.hasFocus()) APP.attention();
  clearTimeout(invT); invT = setTimeout(closeInvite, 60000);
}
$('invNo').addEventListener('click', () => { const m = invData; closeInvite(); if (m && net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify({ t: 'soc', op: 'dec', pid: m.pid })); });
$('invOk').addEventListener('click', () => {
  const m = invData; closeInvite(); if (!m) return;
  pickChar(() => { game.resetOnline = true; connect(() => nsend({ t: 'join', code: m.code, style: stats.style || 'puyo' })); });
});
$('invModal').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') $('invNo').click(); });

/* ---------- 연습 글로벌 순위 ---------- */
const PMODES = [['pe', '뿌요뿌요 연습'], ['pf', '엔드리스 피버'], ['te', '테트리스 끝없이'], ['tm', '마라톤'], ['tu', '울트라'], ['ts', '스프린트']];
let pmode = 'pe', pSynced = false;
const pmKey = (sm, isT) => !isT ? (sm === 'efever' ? 'pf' : 'pe') : ({ endless: 'te', marathon: 'tm', ultra: 'tu', sprint: 'ts' }[sm] || '');
function pLocal(m) {                                      // 이 컴퓨터에 있는 내 최고 기록
  const pr = stats.practice || {}, tr = stats.tRec || {};
  return { pe: pr.best, pf: pr.fBest, te: pr.tBest, tm: tr.marathon, tu: tr.ultra, ts: tr.sprint }[m] || 0;
}
const pFmt = (m, v) => m === 'ts' ? fmtClock(v) : v.toLocaleString() + '점';
// 게임이 끝났을 때(stats.js): 이 모드의 최고 기록을 서버에 올림. 앱에서 로그인했을 때만
async function socPractice(sm, isT) {
  const m = pmKey(sm, isT), v = m && pLocal(m); if (!v || !socOn()) return;
  stats.psent = stats.psent || {}; if (stats.psent[m] === v) return;
  const r = await socAsk({ op: 'ps', mode: m, v }, 'ps');
  if (r.op === 'err') return;
  stats = loadStats(); stats.psent = { ...(stats.psent || {}), [m]: v }; saveStats();
  if (r.improved) socToast(`글로벌 연습 순위 ${r.rank}위 (${r.total}명 중)`);
}
// 이 컴퓨터에만 있던 기록도 한 번 올려서 순위에 들어가게(순위 탭을 처음 열 때)
async function pSyncAll() {
  if (pSynced) return; pSynced = true;
  for (const [m] of PMODES) { const v = pLocal(m); if (v && (stats.psent || {})[m] !== v) { const r = await socAsk({ op: 'ps', mode: m, v }, 'ps'); if (r.op !== 'err') { stats = loadStats(); stats.psent = { ...(stats.psent || {}), [m]: v }; saveStats(); } await new Promise(x => setTimeout(x, 1600)); } }
}
function infoPractice(seq) {
  const bar = '';
  if (!httpOk()) { setInfo(bar, `<div class="empty">${APP ? '서버 주소를 정하면 볼 수 있어요.' : '연습 순위는 앱에서 로그인하면 볼 수 있어요.'}</div>`); return; }
  if (!socOn()) { needLoginMsg(bar, '로그인하면 연습 기록을 올리고 전 세계 순위를 볼 수 있어요.'); return; }
  const segs = `<div class="pmodes">${PMODES.map(([m, t]) => `<button class="seg${m === pmode ? ' on' : ''}" style="--c:#d6482a" data-pm="${m}">${t}</button>`).join('')}</div>`;
  setInfo(bar, segs + '<div class="empty">불러오는 중…</div>');
  (async () => {
    const mine = pLocal(pmode); if (mine && (stats.psent || {})[pmode] !== mine) await socAsk({ op: 'ps', mode: pmode, v: mine }, 'ps');
    const r = await socAsk({ op: 'pl', mode: pmode }, 'pl');
    if (seq !== infoSeq) return;
    if (r.op === 'err') { setInfo(bar, segs + `<div class="empty">${esc(r.msg)}</div>`); return; }
    const row = x => `<div class="prow${x.me ? ' me' : ''}${x.place <= 3 ? ' top3' : ''}"${x.pid ? ` data-pid="${esc(x.pid)}" title="우클릭: 전적 보기 · 친구 추가 · 대전 신청"` : ''}><div class="pl">${x.place}</div><div>${chCv(x.char)}</div><div class="nm"><b>${esc(x.name)}${x.me ? ' (나)' : ''}</b></div><div class="sc">${pFmt(pmode, x.v)}</div></div>`;
    const meRow = r.me && r.me.place > r.rows.length ? `<h4>내 순위</h4>${row(r.me)}` : '';
    const head = `<div class="socnote">${esc(PMODES.find(x => x[0] === pmode)[1])} · 전 세계 ${r.total}명${r.me ? ` · 내 순위 ${r.me.place}위` : ' · 아직 내 기록이 없어요(연습을 한 판 해 보세요)'}</div>`;
    setInfo(bar, segs + head + (r.rows.length ? r.rows.map(row).join('') : '<div class="empty">아직 기록이 없어요. 첫 기록을 올려 보세요!</div>') + meRow);
    pSyncAll();
  })();
}
$('infoCard').addEventListener('click', e => { const b = e.target.closest('button[data-pm]'); if (b) { pmode = b.dataset.pm; renderInfo(); } });

/* ---------- 기록 동기화(다른 컴퓨터와 같은 계정의 기록 맞추기) ---------- */
// 로그인돼 있으면 켤 때·로그인할 때 서버의 기록을 받아 이 컴퓨터 기록과 합치고(큰 값·합집합), 기록이 바뀌면 몇 초 뒤 서버에 올림
let syncT = 0, syncLast = '', syncBusy = false, syncOk = false;
const syncPick = () => StatSync.pick(stats);
function syncApply(m) {
  stats = loadStats(); const before = JSON.stringify(StatSync.pick(stats));
  if (JSON.stringify(m) === before) return false;
  StatSync.apply(stats, m); localStorage.setItem(STATS_KEY, JSON.stringify(stats));      // 저장은 하되 다시 올리지는 않음
  if (game.state === 'menu') { try { renderRecords(); if (cur === 'stats') renderStats(); } catch (e) {} }
  return true;
}
async function socSyncBoot() {
  if (!socOn() || syncBusy) return; syncBusy = true;
  try {
    const r = await socAsk({ op: 'sg' }, 'sg'); if (r.op === 'err') return;
    stats = loadStats(); const acct = appCfg.account.id;
    if (stats.acct && stats.acct !== acct) {                  // 이 컴퓨터의 기록은 다른 계정 것: 섞지 않고 이 계정 기록으로 바꿈
      const keep = { ...stats }; stats = StatSync.apply({ ...defStats(), acct, name: keep.name, keys: keep.keys, vol: keep.vol, hand: keep.hand, speed: keep.speed, fps: keep.fps, style: keep.style }, StatSync.clean(r.data) || StatSync.clean({}));
      saveStats(); if (game.state === 'menu') { try { renderRecords(); if (cur === 'stats') renderStats(); } catch (e) {} }
    } else {
      stats.acct = acct; const merged = StatSync.merge(StatSync.pick(stats), r.data);
      syncApply(merged); stats = loadStats(); stats.acct = acct; localStorage.setItem(STATS_KEY, JSON.stringify(stats));
      if (!r.data || !StatSync.same(merged, r.data)) await socAsk({ op: 'sp', data: merged }, 'sp');       // 서버에 없는 기록이 있으면 올림
    }
    syncLast = JSON.stringify(syncPick()); syncOk = true;
  } finally { syncBusy = false; }
}
function socSyncDirty() {
  if (!syncOk || !socOn()) return;
  clearTimeout(syncT); syncT = setTimeout(async () => {
    const cur2 = JSON.stringify(syncPick()); if (cur2 === syncLast) return;
    const r = await socAsk({ op: 'sp', data: syncPick() }, 'sp'); if (r.op === 'err') return;
    syncLast = JSON.stringify(r.data); if (syncApply(r.data)) syncLast = JSON.stringify(syncPick());       // 다른 컴퓨터에서 올린 것이 있으면 받아 합침
  }, 2500);
}
