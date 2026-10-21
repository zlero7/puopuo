// 설정 창 · 메뉴
'use strict';

/* ================= 설정 창 ================= */
let keyWait = null, setTab = 'sound';
// 설정 탭: 소리 · 게임 · 조작 · 계정(앱)
function setSetTab(t) {
  if (t === 'account' && !APP) t = 'sound';
  setTab = t; keyWait = null;
  document.querySelectorAll('#settings .stabs button').forEach(b => b.classList.toggle('on', b.dataset.stab === t));
  document.querySelectorAll('#settings .spanel').forEach(p => p.classList.toggle('hidden', p.dataset.p !== t));
  if (t === 'keys') { renderKeys(); showHand(); }
}
document.querySelectorAll('#settings .stabs button').forEach(b => b.addEventListener('click', () => setSetTab(b.dataset.stab)));
function openSettings() {
  stats = loadStats(); stats.vol = { bgm: 0.5, sfx: 0.8, ...(stats.vol || {}) };
  $('vBgm').value = stats.vol.bgm; $('vSfx').value = stats.vol.sfx; $('oppRank').checked = !!stats.oppRank; $('skipChar').checked = !!stats.skipChar; $('ghost').checked = stats.ghost !== false; $('lowFx').checked = stats.lowFx === true || (stats.lowFx !== false && !!game.lowFx); $('vib').checked = stats.vib !== false; $('cbMode').checked = !!stats.cb; $('rankBot').checked = !!stats.rankBot; $('fpsCap').value = String(stats.fps || 0); showVol(); renderKeys();
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  $('padInfo').textContent = pads.length ? `게임패드 ${pads.length}개 연결됨 · 십자키 이동(↑ 하드드롭) · A 시계 · B 반시계 · X/LB 홀드 · Start 일시정지`
    : '게임패드: 연결 후 아무 버튼이나 누르면 인식돼요. 로컬 대전은 패드 2개로도 할 수 있어요.';
  showSpeed(); $('settings').classList.remove('hidden'); setSetTab(setTab); if (typeof paintStAcct === 'function') paintStAcct(); $('bSetClose').focus();
  if (game.state === 'play') openPause();
}
function closeSettings() { $('settings').classList.add('hidden'); keyWait = null; setHints(game.state === 'menu' ? 'menu' : 'game'); }
function showSpeed() { const v = +(stats.speed || 1); $('gSpeed').value = v; $('gSpeedV').textContent = v.toFixed(1) + '배'; }
$('gSpeed').addEventListener('input', () => { stats = loadStats(); stats.speed = Math.round(+$('gSpeed').value * 10) / 10; saveStats(); showSpeed(); });
function showVol() { $('vBgmV').textContent = Math.round($('vBgm').value * 100) + '%'; $('vSfxV').textContent = Math.round($('vSfx').value * 100) + '%'; }
// 테트리스 조작 감도(DAS·ARR·SDF)
function showHand() {
  const h = handOf(); $('hDas').value = h.das; $('hArr').value = h.arr; $('hSdf').value = h.sdf;
  $('hDasV').textContent = h.das + 'ms'; $('hArrV').textContent = h.arr + 'ms'; $('hSdfV').textContent = h.sdf >= 41 ? '즉시' : h.sdf + '배';
}
function saveHand(v) { stats = loadStats(); stats.hand = { ...(stats.hand || {}), ...v }; saveStats(); showHand(); }
['hDas', 'hArr', 'hSdf'].forEach(id => $(id).addEventListener('input', () => saveHand({ das: +$('hDas').value, arr: +$('hArr').value, sdf: +$('hSdf').value })));
$('hTetrio').addEventListener('click', () => saveHand({ das: HAND_DEF.das, arr: HAND_DEF.arr, sdf: HAND_DEF.sdf }));
$('hFast').addEventListener('click', () => saveHand({ das: 100, arr: 0, sdf: 41 }));
function renderKeys() {
  const b = { ...DEF_KEYS, ...(stats.keys || {}) };
  $('keyList').innerHTML = ACTIONS.map(([a, lab]) => `<span>${lab}</span>` + [0, 1].map(i =>
    `<button data-k="${a}" data-i="${i}" class="${keyWait && keyWait[0] === a && keyWait[1] === i ? 'wait' : ''}">${keyWait && keyWait[0] === a && keyWait[1] === i ? '키를 누르세요…' : esc(keyName(b[a][i] || ''))}</button>`).join('')).join('');
  $('keyList').querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => { keyWait = [btn.dataset.k, +btn.dataset.i]; renderKeys(); }));
}
['vBgm', 'vSfx'].forEach(id => $(id).addEventListener('input', () => {
  stats = loadStats(); stats.vol = { bgm: +$('vBgm').value, sfx: +$('vSfx').value }; saveStats(); applyVolume(); showVol();
  if (id === 'vSfx') sfx.rot();
}));
window.addEventListener('keydown', e => {          // 키 설정 입력(다른 입력보다 먼저 받음)
  if ($('settings').classList.contains('hidden')) return;
  e.stopImmediatePropagation();
  if (!keyWait) {
    if (e.key === 'Escape') { e.preventDefault(); closeSettings(); }
    else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.target.type !== 'range' && e.target.tagName !== 'INPUT') {
      const tabs = [...document.querySelectorAll('#settings .stabs button')].filter(b => getComputedStyle(b).display !== 'none'), i = tabs.findIndex(b => b.dataset.stab === setTab);
      e.preventDefault(); setSetTab(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].dataset.stab);
    }
    return;
  }
  e.preventDefault();
  stats = loadStats(); const keys = { ...DEF_KEYS, ...(stats.keys || {}) };
  const k = e.key === 'Delete' || e.key === 'Backspace' ? '' : e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k) for (const [a] of ACTIONS) keys[a] = keys[a].map(x => x.toLowerCase() === k.toLowerCase() ? '' : x);   // 같은 키 중복 제거
  keys[keyWait[0]] = keys[keyWait[0]].slice(); keys[keyWait[0]][keyWait[1]] = k;
  stats.keys = keys; saveStats(); keyWait = null; renderKeys();
}, true);
$('skipChar').addEventListener('change', () => { stats = loadStats(); stats.skipChar = $('skipChar').checked; saveStats(); });
$('oppRank').addEventListener('change', () => { stats = loadStats(); stats.oppRank = $('oppRank').checked; saveStats(); });
$('ghost').addEventListener('change', () => { stats = loadStats(); stats.ghost = $('ghost').checked; saveStats(); });
$('lowFx').addEventListener('change', () => { stats = loadStats(); stats.lowFx = $('lowFx').checked; saveStats(); game.lowFx = stats.lowFx; fit(); });   // 끄면 자동 감지만
$('vib').addEventListener('change', () => { stats = loadStats(); stats.vib = $('vib').checked; saveStats(); });
$('fpsCap').addEventListener('change', () => { stats = loadStats(); stats.fps = +$('fpsCap').value; saveStats(); });
$('cbMode').addEventListener('change', () => { stats = loadStats(); stats.cb = $('cbMode').checked; saveStats(); if (game.state === 'menu') drawArts(); });
$('rankBot').addEventListener('change', () => { stats = loadStats(); stats.rankBot = $('rankBot').checked; saveStats(); });
$('bKeyReset').addEventListener('click', () => { stats = loadStats(); stats.keys = null; saveStats(); keyWait = null; renderKeys(); });
$('bSetClose').addEventListener('click', closeSettings);
$('settings').addEventListener('click', e => { if (e.target.id === 'settings') closeSettings(); });
$('bSettings').addEventListener('click', openSettings);

/* ================= 메뉴 ================= */
let cur = 'main';
function setHints(kind) {
  $('hints').innerHTML = kind === 'menu'
    ? '<span><kbd>Esc</kbd> 뒤로</span><span><kbd>Enter</kbd> 결정</span>'
    : game.mode === 'replay' ? '<span><kbd>← →</kbd> 배속</span><span><kbd>Esc</kbd> 일시정지</span>'
    : game.mode === 'local' ? '<span>1P <kbd>WASD</kbd> <kbd>Q E</kbd> 회전 <kbd>R</kbd> 홀드</span><span>2P <kbd>방향키</kbd> <kbd>. /</kbd> 회전 <kbd>,</kbd> 홀드</span><span><kbd>Esc</kbd> 일시정지</span>'
    : (() => { const b = { ...DEF_KEYS, ...(stats.keys || {}) }, n = a => keyName(b[a][0]).replace('방향키 ', '');
      return `<span><kbd>${n('left')} ${n('right')}</kbd> 이동</span><span><kbd>${n('ccw')} ${n('cw')}</kbd> 회전</span><span><kbd>${n('hard')}</kbd> 하드드롭</span>` +
        `<span><kbd>${n('hold')}</kbd> 홀드</span>` + (game.vs && playersOf(game.mode) > 2 && !Object.values(b).some(ks => ks.some(x => String(x).toLowerCase() === 'tab')) ? '<span><kbd>Tab</kbd> 공격 대상</span>' : '') + `<span><kbd>${n('pause')}</kbd> ${game.net ? '나가기' : '일시정지'}</span>`; })();
}
// 캐릭터 고르기 화면(카드 8장)
function renderChars(focusId) {
  const sec = $('sc-chars'), mine = stats.char || 'lumi';
  if (!sec.children.length) {
    // 카드 그림은 캔버스가 아니라 일반 이미지(CSS 배경)로: 칸에 마우스를 올리면 커지고 기울어지는데, 캔버스는 그때 이미 만든 비트맵을 늘려서 뭉개지고
    // 이미지는 브라우저가 변형된 크기에 맞춰 원본에서 다시 그려서 선명함
    sec.innerHTML = CHARS.map((ch, i) => `<button class="tile charcard cardimg" id="ch-${ch.id}" data-act="char:${ch.id}" style="--c:${ch.col};--d:${ch.d}" data-desc="${esc(ch.name)} — ${esc(ch.desc)}">` +
      `<span class="in"></span><i class="cimg" style="--n:${i}"></i><span class="mine">내 캐릭터</span><span class="tt">${esc(ch.name)}</span></button>`).join('');
    sec.querySelectorAll('.tile').forEach(t => {
      t.addEventListener('click', () => act(t.dataset.act));
      t.addEventListener('mouseenter', () => t.focus({ preventScroll: true }));
      t.addEventListener('focus', () => { $('mDesc').textContent = t.dataset.desc; });
    });
  }
  sec.querySelectorAll('.tile').forEach(t => t.classList.toggle('sel', t.id === 'ch-' + mine));
}
function showScreen(id, focusId) {
  document.querySelectorAll('.screen').forEach(el => el.classList.toggle('hidden', el.id !== 'sc-' + id));
  cur = id; $('bandTitle').textContent = TITLES[id];
  $('bBack').classList.toggle('hidden', id === 'main'); if (typeof drawWait === 'function') drawWait();
  if (id !== 'main') guardBack();
  renderRecords();
  if (id === 'stats') renderStats();
  if (id === 'adv') { renderAdv(); focusId = focusId || 'adv-0'; }
  if (id === 'chars') { renderChars(); focusId = focusId || 'ch-' + (stats.char || 'lumi'); }
  if (id === 'vs') { showLan(); showRankRec(); if (typeof pasteCode === 'function') pasteCode(true); }
  setHints('menu');
  requestAnimationFrame(() => {
    drawArts();
    const t = focusId ? $(focusId) : $('sc-' + id).querySelector('.tile[data-act]');
    if (t) t.focus({ preventScroll: true }); else $('mDesc').textContent = '닉네임은 온라인 대전에서 상대에게 보여요.';
  });
}
function openMenu(id = 'main', focusId) {
  game.state = 'menu'; if (AC) bgmPlay('menu'); overlay.classList.add('hidden');
  document.body.classList.remove('ingame', 'local2', 'replay');
  $('game').classList.add('hidden'); $('menu').classList.remove('hidden');
  showScreen(id, focusId);
}
function showGame() {
  document.body.classList.add('ingame'); document.body.classList.toggle('local2', game.mode === 'local'); document.body.classList.toggle('replay', game.mode === 'replay'); $('bBack').classList.remove('hidden'); $('mmBadge').classList.add('hidden'); guardBack();   // 게임 중에도 ← 로 일시정지·나가기(가로 폰은 #gBack)
  $('menu').classList.add('hidden'); $('game').classList.remove('hidden');
  if (game.adv) { $('bandTitle').textContent = `어드벤처 ${game.adv.c + 1}-${game.adv.s + 1}`; setHints('game'); fit(); return; }
  const rl = game.rule && game.rule !== 'tsu' && game.mode !== 'solo' ? ` · ${RULES[game.rule].ko}` : '';
  $('bandTitle').textContent = (game.mode === 'replay' ? '리플레이' : game.mode === 'local' ? '로컬 대전' : game.mode === 'solo' ? (game.myStyle === 'tetris' ? `연습 · ${SOLO_KO[game.soloMode || 'endless']}` : game.soloMode === 'efever' ? '엔드리스 피버' : '연습') : game.mode === 'vs' ? `AI 대전 · ${DIFF[game.diff]}` : '대전') + rl;
  setHints('game'); fit();
}
function menuBack() {
  if (cur === 'main') return;
  if (cur === 'solo' || cur === 'psolo') { showScreen('ai', 't-solo'); return; }
  showScreen('main', 't-' + cur);
}
function renderStyle() {
  document.querySelectorAll('.seg').forEach(b => {
    if (!b.dataset.act) return;
    const [kind, who, st] = b.dataset.act.split(':');
    if (kind === 'itab') { b.classList.toggle('on', who === infoTab); return; }
    if (kind === 'ft') { b.classList.toggle('on', +who === (stats.firstTo || 2)); return; }
    if (kind === 'rule') { b.classList.toggle('on', who === (stats.rule || 'tsu')); return; }
    if (kind === 'pl') { b.classList.toggle('on', +who === (stats.players || 2)); return; }
    if (kind === 'board') { b.classList.toggle('on', who === (stats.board || 'wide')); return; }
    b.classList.toggle('on', (who === 'me' ? stats.style || 'puyo' : who === 'p2' ? stats.p2Style || 'puyo' : stats.cpuStyle || 'puyo') === st);
  });
}
function act(a) {
  const [k, v, w] = a.split(':');
  if (k === 'style') {
    stats = loadStats(); if (v === 'me') stats.style = w; else if (v === 'p2') stats.p2Style = w; else stats.cpuStyle = w; saveStats(); renderRecords();
    if (v === 'me') { nsend({ t: 'style', style: w }); showRankRec(); }   // 랭크 타일도 고른 스타일의 티어로
    return;
  }
  if (k === 'go') showScreen(v);
  else if (k === 'solo') showScreen((stats.style || 'puyo') === 'tetris' ? 'solo' : 'psolo');
  else if (k === 'psolo') pickChar(() => { game.soloMode = v; start('solo'); });
  else if (k === 'tut') puzzleGo('tut', 0);   // 튜토리얼은 처음부터
  else if (k === 'puz') { const i = PUZZLES.findIndex((_, j) => !pzDone('puz', j)); puzzleGo('puz', i < 0 ? 0 : i); }
  else if (k === 'tsolo') pickChar(() => { game.soloMode = v; start('solo'); });
  else if (MATCH[k]) openMatch(k);                          // 빠른 매칭·랭크전·방 만들기·방 참가·로컬 대전은 설정 창을 먼저 띄움
  else if (k === 'advc') { advChap = +v; renderAdv(); $('adv-0') && $('adv-0').focus(); }
  else if (k === 'adv') advPlay(+v);
  else if (k === 'char') { stats = loadStats(); stats.char = v; saveStats(); renderChars(v); socChar(); }
  else if (k === 'rule') { stats = loadStats(); stats.rule = v; saveStats(); renderStyle(); }
  else if (k === 'pl') { stats = loadStats(); stats.players = +v; saveStats(); renderStyle(); }
  else if (k === 'board') { stats = loadStats(); stats.board = v; saveStats(); renderStyle(); nsend({ t: 'board', board: v }); }
  else if (k === 'ft') { stats = loadStats(); stats.firstTo = +v; saveStats(); renderStyle(); }
  else if (k === 'itab') { infoTab = v; renderInfo(); }
  else if (k === 'diff') pickChar(() => { game.diff = +v; start('vs'); });
}
// 대전 설정 창에서 '시작'을 눌렀을 때 실제로 하는 일(예전에 칸을 눌렀을 때 하던 일)
function startMatch(k) {
  if ((k === 'ranked' || k === 'quick' || k === 'create' || k === 'invite') && needLogin(() => startMatch(k))) return;   // 앱: 로그인부터
  if ((k === 'ranked' || k === 'quick' || k === 'create' || k === 'invite') && askName(() => startMatch(k))) return;   // 처음 온라인: 닉네임부터
  pickChar(() => runMatch(k));
}
function runMatch(k) {
  if (k === 'invite') {                                      // 친구에게 대전 신청: 방을 만들고, 만들어지면(net.js 'created') 신청을 보냄
    if (!matchTarget) return;
    net.inviteTo = { pid: matchTarget.pid, name: matchTarget.name, style: stats.style || 'puyo', rule: stats.rule || 'tsu', board: stats.board || 'wide' };
    game.resetOnline = true; connect(() => nsend({ t: 'create', style: stats.style || 'puyo', board: stats.board || 'wide', rule: stats.rule || 'tsu', size: 2 })); return;
  }
  if (k === 'local') { start('local'); return; }
  if (k === 'ranked') { if (!serverOk()) { status(APP ? '서버 주소를 먼저 정해 주세요(계정 창).' : '랭크전은 서버에 접속한 주소(http://…)로 열어야 해요.'); return; } game.resetOnline = true; connect(() => nsend({ t: 'rq', token: APP ? undefined : rankToken, style: stats.style || 'puyo', name: stats.name, char: stats.char || 'lumi', bot: !!stats.rankBot })); return; }
  if (k === 'quick') { game.resetOnline = true; connect(() => nsend({ t: 'quick', style: stats.style || 'puyo', board: stats.board || 'wide', rule: stats.rule || 'tsu', size: stats.players || 2 })); return; }
  if (k === 'create') { game.resetOnline = true; connect(() => nsend({ t: 'create', style: stats.style || 'puyo', board: stats.board || 'wide', rule: stats.rule || 'tsu', size: stats.players || 2 })); }
}
/* ---------- 캐릭터 고르기 창: 게임을 시작할 때마다 먼저 띄움 ---------- */
let charCb = null;
function pickChar(cb) {
  stats = loadStats(); const mine = stats.char || 'lumi'; charCb = cb;
  if (stats.skipChar && CHARS.some(c => c.id === mine)) { cb(); return; }   // 설정: 지난번 캐릭터로 바로 시작
  $('cmList').innerHTML = CHARS.map((ch, i) => `<button class="cmbtn${ch.id === mine ? ' on' : ''}" data-id="${ch.id}" data-desc="${esc(ch.name)} — ${esc(ch.desc)}" style="--n:${i}"><i></i>${esc(ch.name)}</button>`).join('');
  $('cmDesc').textContent = ''; $('charModal').classList.remove('hidden');
  ($('cmList').querySelector('.on') || $('cmList').firstChild).focus();
}
function closeChar() { $('charModal').classList.add('hidden'); charCb = null; }
$('cmCancel').addEventListener('click', closeChar);
$('charModal').addEventListener('click', e => {
  if (e.target === $('charModal')) { closeChar(); return; }
  const b = e.target.closest('.cmbtn'); if (!b) return;
  const cb = charCb; stats = loadStats(); stats.char = b.dataset.id; saveStats(); renderChars(); socChar(); closeChar(); if (cb) cb();
});
$('charModal').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Escape') { closeChar(); return; }
  const bs = [...$('cmList').children], i = bs.indexOf(document.activeElement), d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[e.key];
  if (d && i >= 0) { e.preventDefault(); const t = bs[i + d]; if (t) t.focus(); }
});
$('charModal').addEventListener('focusin', e => { const b = e.target.closest('.cmbtn'); if (b) $('cmDesc').textContent = b.dataset.desc; });
$('charModal').addEventListener('mouseover', e => { const b = e.target.closest('.cmbtn'); if (b) $('cmDesc').textContent = b.dataset.desc; });
/* ---------- 대전 설정 창: 예전에 대전 화면 위쪽에 있던 선택(스타일·인원·규칙·판·로컬 2P)을 여기로 ---------- */
const MATCH = {
  quick:  { title: '빠른 매칭', sub: '먼저 기다리고 있던 사람과 바로 대전해요. 아래 설정이 같은 사람끼리 만나요.', rows: ['style', 'pl', 'rule', 'board'], go: '매칭 시작', tile: 't-quick' },
  ranked: { title: '랭크전', sub: '실력이 비슷한 사람과 1:1로 겨뤄요(원작 6×12 · 통상 · 2선승). 뿌요뿌요와 테트리스 랭크는 따로 쌓여요.', rows: ['style'], go: '랭크전 시작', tile: 't-rank' },
  create: { title: '방 만들기', sub: '방을 만들면 4자리 코드가 나와요. 친구에게 알려 주세요.', rows: ['style', 'pl', 'rule', 'board'], go: '방 만들기', tile: 't-create' },
  join:   { title: '방 참가', sub: '친구가 알려 준 4자리 방 코드를 넣어 주세요.', rows: ['code'], go: '', tile: 't-join' },
  invite: { title: '친구와 대전', sub: '', rows: ['style', 'rule', 'board'], go: '신청 보내기', tile: '' },
  local:  { title: '로컬 대전', sub: '한 컴퓨터에서 둘이 대전해요. 1P는 WASD·Q/E·R, 2P는 방향키·. /·, 를 써요.', rows: ['style', 'p2', 'pl', 'rule', 'board'], go: '시작', tile: 't-local' },
};
let matchKind = null, matchTarget = null;
const mmSay = m => { $('mmMsg').textContent = m || ''; };
function openMatch(k) {
  const M = MATCH[k]; if (!M) return; matchKind = k; stats = loadStats(); renderStyle();
  $('mDesc').textContent = ''; $('mmTitle').textContent = M.title; $('mmSub').textContent = M.sub; mmSay(''); $('mmDesc').textContent = '';
  document.querySelectorAll('#matchModal .mmrow').forEach(r => r.classList.toggle('hidden', !M.rows.includes(r.dataset.m)));
  $('matchModal').querySelector('.mmrow[data-m="style"] .lab').textContent = k === 'local' ? '1P 스타일' : '내 스타일';
  $('bJoin').classList.toggle('hidden', k !== 'join'); $('mmGo').classList.toggle('hidden', k === 'join'); $('mmGo').textContent = M.go;
  $('matchModal').classList.remove('hidden');
  if (k === 'join') { $('code').value = ''; if (typeof pasteCode === 'function') pasteCode(true); $('code').focus(); }
  else ($('matchModal').querySelector('.mmrow:not(.hidden) .seg.on') || $('mmGo')).focus();
}
function closeMatch() { $('matchModal').classList.add('hidden'); const t = matchKind && MATCH[matchKind].tile && $(MATCH[matchKind].tile); matchKind = null; if (t && game.state === 'menu') t.focus({ preventScroll: true }); }
$('mmCancel').addEventListener('click', closeMatch);
$('mmGo').addEventListener('click', () => { const k = matchKind; closeMatch(); startMatch(k); });
$('matchModal').addEventListener('click', e => { if (e.target === $('matchModal')) closeMatch(); });
$('matchModal').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Escape') closeMatch();
  else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON' && matchKind !== 'join') $('mmGo').click();
});
$('matchModal').addEventListener('focusin', e => { const b = e.target.closest('.seg'); if (b) $('mmDesc').textContent = b.dataset.desc || ''; });
$('matchModal').addEventListener('mouseover', e => { const b = e.target.closest('.seg'); if (b) $('mmDesc').textContent = b.dataset.desc || ''; });
function moveSel(dx, dy) {
  const ts = [...$('sc-' + cur).querySelectorAll('.tile[data-act], .seg')];
  if (!ts.length) return;
  const a = document.activeElement;
  if (!ts.includes(a)) { ts[0].focus(); return; }
  const r = a.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best = null, bs = Infinity;
  for (const t of ts) {
    if (t === a) continue;
    const q = t.getBoundingClientRect(), x = q.left + q.width / 2 - cx, y = q.top + q.height / 2 - cy;
    const along = x * dx + y * dy; if (along <= 4) continue;
    const overlap = dx ? Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top) : Math.min(r.right, q.right) - Math.max(r.left, q.left);
    const sc = along + (overlap > 0 ? 0 : Math.abs(x * dy - y * dx) * 2);
    if (sc < bs) { bs = sc; best = t; }
  }
  if (best) best.focus();
}
document.querySelectorAll('.seg').forEach(b => {
  b.addEventListener('click', () => act(b.dataset.act));
  b.addEventListener('focus', () => { if (!b.closest('#matchModal')) $('mDesc').textContent = b.dataset.desc || ''; });   // 대전 설정 창 안의 설명은 창 안에만 표시
});
document.addEventListener('pointerdown', () => { if (!AC) { audio(); applyVolume(); if (game.state === 'menu') bgmPlay('menu'); } }, { once: true });
document.addEventListener('keydown', () => { if (!AC) { audio(); applyVolume(); if (game.state === 'menu') bgmPlay('menu'); } }, { once: true });
document.querySelectorAll('.tile[data-desc]').forEach(t => {
  const d = document.createElement('span'); d.className = 'td'; d.textContent = t.dataset.desc; t.appendChild(d);
});
document.querySelectorAll('.tile[data-act]').forEach(t => {
  t.addEventListener('click', e => { if (e.target.closest('input, .mini')) return; act(t.dataset.act); });
  t.addEventListener('mouseenter', () => { if (document.activeElement.tagName !== 'INPUT') t.focus({ preventScroll: true }); });
  t.addEventListener('focus', () => { const d = t.querySelector('.td'); $('mDesc').textContent = d && getComputedStyle(d).display === 'none' ? t.dataset.desc : ''; });
});
$('pName').addEventListener('change', () => { stats = loadStats(); stats.name = cleanName($('pName').value); $('pName').value = stats.name; saveStats(); });
// 랭크 티어 엠블럼: 브론즈·실버·골드·플래티넘·다이아·마스터(-1은 배치 중). div: 세부 티어 1~3(별 개수)
const TIER_COL = [['#c9834a', '#7a4618'], ['#c3ccd6', '#6d7a88'], ['#ffd23d', '#b07a00'], ['#4fe0c4', '#14806c'], ['#7cb8ff', '#2556b8'], ['#d58cff', '#6b2aa8']];
// 티어 엠블럼 그림(img/tiers.webp): 브론즈 1·2·3 → … → 다이아 3, 마스터, 언랭(배치 중) 순서로 한 줄(칸마다 128px). 불러오기 전은 아래 도형으로
const TIER_IMG = new Image(), TIER_CELL = 128;
TIER_IMG.onload = () => onArtImage();
// 그림이 하나 읽히면 메뉴 그림을 다시 그림. 화면 준비(gameReady) 전에 읽힌 경우는 표시만 해 두고, 준비되면 main.js가 한 번 더 그림
function onArtImage() {
  if (!window.gameReady) { window.artPending = true; return; }
  if (typeof dlgFace === 'function' && dlgOpen()) dlgFace();
  if (game.state === 'menu') { drawArts(); if (cur === 'chars') renderChars(); if (cur === 'adv') renderAdv(); if (cur === 'stats' && typeof paintInfo === 'function') paintInfo(); }
}
TIER_IMG.src = 'img/tiers.webp?v=2';   // 그림을 바꾸면 v를 올려 캐시를 새로 받게
function drawTierEmblem(c, x, y, size, group, div) {
  const i = group === 5 ? 15 : group < 0 ? 16 : group >= 0 && group < 5 && div >= 1 && div <= 3 ? group * 3 + div - 1 : -1;
  if (i >= 0 && TIER_IMG.complete && TIER_IMG.naturalWidth >= (i + 1) * TIER_CELL) {   // 예전 그림(언랭 칸 없음)이 캐시에 남았으면 도형으로
    const s = size * 1.1;                     // 그림 안 여백만큼 조금 크게
    c.drawImage(TIER_IMG, i * TIER_CELL, 0, TIER_CELL, TIER_CELL, x - s / 2, y - s / 2, s, s); return;
  }
  const [col, dk] = TIER_COL[group] || ['#cfd1dc', '#6d6b80'], r = size / 2;
  c.save(); c.translate(x, y);
  c.beginPath(); c.moveTo(0, -r); c.lineTo(r * 0.85, -r * 0.55); c.lineTo(r * 0.7, r * 0.45); c.lineTo(0, r); c.lineTo(-r * 0.7, r * 0.45); c.lineTo(-r * 0.85, -r * 0.55); c.closePath();
  const g = c.createLinearGradient(0, -r, 0, r); g.addColorStop(0, mixW(col, 0.35)); g.addColorStop(1, col);
  c.fillStyle = g; c.fill(); c.lineWidth = r * 0.1; c.strokeStyle = dk; c.stroke();
  if (group === 5) drawStar(c, 0, -r * 0.05, r * 0.45, '#fff6c2');
  else if (group < 0) outlined(c, '?', 0, 2, r * 0.9, '#fff', dk, r * 0.12);
  else for (let i = 0; i < div; i++) drawStar(c, (i - (div - 1) / 2) * r * 0.42, r * 0.05, r * 0.2, '#fff');
  c.restore();
}
/* 타일 그림: 게임과 같은 뿌요 렌더러로 그림 */
const SCENES = {
  ai:     { rows: ['000000', '000040', '300440', '331240', '312222', '111322'] },
  solo:   { rows: ['000', '000', '040', '044', '214', '211', '331'] },
  easy:   { rows: ['000', '000', '000', '000', '010', '213', '223'] },
  normal: { rows: ['000', '000', '000', '230', '244', '214', '211'] },
  hard:   { rows: ['000', '102', '132', '332', '344', '314', '114'] },
};
function fitCanvas(c) {
  const w = c.clientWidth, h = c.clientHeight;
  if (!w || !h) return null;
  const S = Math.max(DPR, 2);                          // 보통 화면(배율 1)에서도 2배로 그려 둠: 칸에 마우스를 올리면 살짝 커지고 기울어지는데, 그림(비트맵)이 그때 다시 늘어나 흐려지지 않게
  c.width = Math.round(w * S); c.height = Math.round(h * S);
  const x = c.getContext('2d'); x.setTransform(S, 0, 0, S, 0, 0); x.clearRect(0, 0, w, h);
  return { x, w, h };
}
function miniField(x, rows, x0, y0, w, h) {
  const nr = rows.length, nc = rows[0].length, cell = Math.min(w / nc, h / nr);
  const ox = x0 + (w - nc * cell) / 2, oy = y0 + (h - nr * cell);
  x.fillStyle = '#1e174e'; x.fillRect(x0, y0, w, h);
  for (let r = 0; r < nr; r++) for (let q = 0; q < nc; q++) { x.fillStyle = (r + q) % 2 ? '#191342' : '#211a55'; x.fillRect(ox + q * cell, oy + r * cell, cell, cell); }
  const items = [], links = [], quads = [], map = {};
  rows.forEach((row, r) => [...row].forEach((ch, q) => { const v = +ch; if (!v) return; const it = { cx: q * CS + CS / 2, cy: r * CS + CS / 2, rx: R, ry: R, col: v }; items.push(it); map[r + ',' + q] = it; }));
  rows.forEach((row, r) => [...row].forEach((ch, q) => {
    const v = +ch, a = map[r + ',' + q]; if (!v || v === OJ) return;
    const rt = map[r + ',' + (q + 1)], dn = map[(r + 1) + ',' + q], dg = map[(r + 1) + ',' + (q + 1)];
    if (rt && rt.col === v) { a.mask = (a.mask || 0) | RT; rt.mask = (rt.mask || 0) | LT; links.push([a, rt]); }
    if (dn && dn.col === v) { a.mask = (a.mask || 0) | DN; dn.mask = (dn.mask || 0) | UP; links.push([a, dn]); }
    if (rt && dn && dg && rt.col === v && dn.col === v && dg.col === v) quads.push([a, rt, dn, dg]);
  }));
  x.save(); x.translate(ox, oy); x.scale(cell / CS, cell / CS); drawPuyos(x, items, links, quads); x.restore();
}
function drawArts() {
  document.querySelectorAll('#menu .screen:not(.hidden) canvas.art').forEach(c => {
    const g = fitCanvas(c); if (!g) return; const { x, w, h } = g, kind = c.dataset.art;
    if (SCENES[kind]) miniField(x, SCENES[kind].rows, 0, 0, w, h);
    else if (kind === 'vs') {
      const fw = w * 0.42;
      miniField(x, ['000', '000', '200', '234', '114'], 0, 0, fw, h);
      miniField(x, ['000', '000', '000', '403', '433'], w - fw, 0, fw, h);
      x.strokeStyle = '#ffd93d'; x.lineWidth = 4; x.lineCap = 'round'; x.setLineDash([2, 9]);
      x.beginPath(); x.moveTo(fw * 0.6, h * 0.55); x.quadraticCurveTo(w / 2, -h * 0.1, w - fw * 0.5, h * 0.18); x.stroke(); x.setLineDash([]);
      const gr = x.createRadialGradient(w - fw * 0.5, h * 0.18, 1, w - fw * 0.5, h * 0.18, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, '#ffd93d'); gr.addColorStop(1, 'rgba(255,217,61,0)');
      x.fillStyle = gr; x.beginPath(); x.arc(w - fw * 0.5, h * 0.18, 16, 0, Math.PI * 2); x.fill();
    } else if (kind === 'chars') {
      const ids = [stats.char || 'lumi', ...CHARS.map(c => c.id).filter(i => i !== (stats.char || 'lumi'))].slice(0, 3);
      [1, 2, 0].forEach(i => drawChar(x, ids[i], w * (0.5 + (i === 0 ? 0 : i === 1 ? -0.3 : 0.3)), h * (i ? 0.58 : 0.5), Math.min(w * 0.36, h * (i ? 0.7 : 0.9)), 'happy'));   // 가운데(내 캐릭터)를 맨 위에
    } else if (kind === 'adv') {
      const ids = ['toto', 'lumi', 'kuro'];
      x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(0, h * 0.62, w, h * 0.38);
      [0, 2, 1].forEach(i => drawChar(x, ids[i], w * (0.2 + i * 0.3), h * (i === 1 ? 0.48 : 0.56), Math.min(w * 0.3, h * (i === 1 ? 0.85 : 0.7)), 'happy'));
    } else if (kind === 'rank') {               // 내 티어 엠블럼(서버에서 받아온 뒤 다시 그림)
      const m = game.myRank;
      drawTierEmblem(x, w / 2, h / 2, Math.min(w, h) * 0.9, m ? m.group : -1, m && !m.placing ? m.div : 0);
    } else if (kind === 'stats') {
      x.fillStyle = '#f4f2fb'; x.fillRect(0, 0, w, h);
      const C = ['#39c63c', '#ffb400', '#ff4559', '#2f78f0'];
      for (let i = 0; i < 4; i++) {
        const y = h * (0.14 + i * 0.21), bw = w * [0.62, 0.8, 0.45, 0.7][i];
        x.fillStyle = '#dcd8ec'; x.fillRect(w * 0.1, y, w * 0.8, h * 0.11);
        x.fillStyle = C[i]; x.fillRect(w * 0.1, y, bw, h * 0.11);
      }
    }
  });
  document.querySelectorAll('#menu .screen:not(.hidden) canvas.ico').forEach(c => {
    const g = fitCanvas(c); if (!g) return; const { x, w, h } = g, s = Math.min(w, h) / (CS * 1.15);
    x.save(); x.translate(w / 2, h / 2 + 2); x.scale(s, s);
    drawPuyos(x, [{ cx: 0, cy: 0, rx: R, ry: R, col: +c.dataset.col }], []); x.restore();
  });
}
window.addEventListener('resize', () => { if (game.state === 'menu') drawArts(); });

// 뒤로 가기: 화면 위 ← 버튼(가로 폰 게임 중엔 #gBack), 폰·브라우저의 뒤로 가기(사이트를 나가지 않고 메뉴 한 단계 뒤로 / 게임 중이면 일시정지)
// 게임 중 ←: 시작 연출·플레이 중이면 일시정지(온라인은 기권 확인), 일시정지·결과 창이 떠 있으면 Esc와 같음(일시정지는 계속하기, 결과는 메뉴로)
function gameBack() {
  if (!overlay.classList.contains('hidden')) {
    if (game.ovKind === 'pause' || game.ovKind === 'forfeit') $('bResume').click();
    else ($('bMenu').classList.contains('hidden') ? $('bLeave') : $('bMenu')).click();
    return;
  }
  if (game.state === 'play' || game.state === 'intro') openPause();
}
$('bBack').addEventListener('click', () => { if (dlgOpen()) return; if (game.state === 'menu') menuBack(); else gameBack(); });
$('gBack').addEventListener('click', () => { if (!dlgOpen()) gameBack(); });
function guardBack() { try { if (!history.state || !history.state.pp) history.pushState({ pp: 1 }, ''); } catch (e) {} }
window.addEventListener('popstate', () => {
  if (dlgOpen()) { guardBack(); return; }
  if (game.state === 'menu') { if (cur === 'main') return; menuBack(); if (cur !== 'main') guardBack(); return; }
  if (game.state === 'play' || game.state === 'intro') openPause();   // 시작 연출 중에도 뒤로 가기가 먹게
  else if (!overlay.classList.contains('hidden')) ($('bMenu').classList.contains('hidden') ? $('bLeave') : $('bMenu')).click();
  if (game.state !== 'menu') guardBack();
});
// 메뉴 띠의 '이름표 + 버튼 묶음'을 하나로 묶음(좁은 화면에서 이름표만 줄 끝에 남지 않게)
document.querySelectorAll('.stylebar .lab').forEach(lab => {
  const g = document.createElement('span'); g.className = 'grp';
  lab.parentNode.insertBefore(g, lab); g.appendChild(lab); if (g.nextElementSibling && g.nextElementSibling.classList.contains('segs')) g.appendChild(g.nextElementSibling);
});

// 처음 온라인 대전을 할 때 닉네임 묻기(기본 이름 '플레이어'끼리는 누가 누군지 몰라서). 물었으면 true
function askName(then) {
  if (APP) return false;                                             // 앱은 닉네임이 계정에 있음
  stats = loadStats();
  if ((stats.name && stats.name !== '플레이어') || stats.nameAsked) return false;
  $('nameAsk').classList.remove('hidden'); $('naIn').value = ''; setTimeout(() => $('naIn').focus(), 50);
  const done = save => {
    $('nameAsk').classList.add('hidden'); stats = loadStats(); stats.nameAsked = true;
    if (save) { stats.name = cleanName($('naIn').value); $('pName').value = stats.name; }
    saveStats(); $('naOk').onclick = $('naSkip').onclick = null; then();
  };
  $('naOk').onclick = () => done(true); $('naSkip').onclick = () => done(false);
  $('naIn').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
  return true;
}
