// 계정 창(앱 전용): 로그인 · 가입 · 로그아웃 · 비밀번호 바꾸기 · 서버 주소
// 비밀번호는 입력하자마자 앱 본체로 넘기고(window.puyoApp), 이 화면에는 세션·토큰이 남지 않음
'use strict';
(function () {
  if (!APP) return;
  $('srv').parentElement.classList.add('hidden');            // 앱은 서버 주소를 화면에서 바로 고치지 못함(계정 창에서 본체 확인을 거쳐서만)
  const el = id => $(id);
  let tab = 'login', after = null;
  const say = (msg, bad = true) => { const m = el('acMsg'); m.textContent = msg || ''; m.className = 'acmsg' + (msg && bad ? ' bad' : ''); };
  const fmtErr = r => (r && r.msg || '실패했어요') + (r && r.retry ? ` (${r.retry}초 뒤에 다시)` : '');

  function paint() {
    const me = appCfg.account;
    el('acIn').classList.toggle('hidden', !!me); el('acOut').classList.toggle('hidden', !me);
    el('acTabLogin').classList.toggle('on', tab === 'login'); el('acTabReg').classList.toggle('on', tab === 'reg');
    el('acRegOnly').classList.toggle('hidden', tab !== 'reg');
    el('acGo').textContent = tab === 'reg' ? '가입하기' : '로그인'; el('acGo').classList.toggle('hidden', !!me);
    ['acPw2L', 'acPw2'].forEach(i => el(i).classList.toggle('hidden', tab !== 'reg'));
    el('acPw').autocomplete = tab === 'reg' ? 'new-password' : 'current-password';
    if (me) el('acWho').textContent = `${me.name} (${me.id})`;
    el('acSrv').textContent = appCfg.server || '(정해지지 않음)';
    el('acSrvBox').classList.toggle('hidden', !appCfg.canChangeServer);
    el('acSrvNeeded').classList.toggle('hidden', !!appCfg.server);
  }
  function open(t, then) {
    if (t === 'login' || t === 'reg') tab = t; after = then || null;
    say(''); ['acPw', 'acPw2'].forEach(i => { el(i).value = ''; });
    paint(); el('acct').classList.remove('hidden');
    setTimeout(() => (appCfg.server ? (appCfg.account ? el('acClose') : el('acId')) : el('acSrvIn')).focus(), 50);
  }
  // 로그인·로그아웃 직후 로그인 상태에 따라 달라지는 화면(기록·랭크·캐릭터·내 정보/친구 탭·설정의 계정 탭)을 한꺼번에 다시 그림
  function refreshAuthUI() {
    try { paint(); if (typeof paintStAcct === 'function' && !$('settings').classList.contains('hidden')) paintStAcct(); } catch (e) {}
    try { showRankRec(); } catch (e) {}
    try { renderRecords(); if (typeof renderChars === 'function') renderChars(); } catch (e) {}
    try { if (game.state === 'menu' && cur === 'stats') renderInfo(); } catch (e) {}
  }
  // 로그아웃: 아직 못 올린 기록을 서버에 올리고, 이 컴퓨터에 남은 이 계정의 기록·닉네임·대표 캐릭터를 지움(서버에 있으니 다시 로그인하면 돌아옴). 키·소리 같은 이 컴퓨터 설정은 그대로
  const RECORD_KEYS = ['games', 'playMs', 'ai', 'online', 'practice', 'bestChain', 'pops', 'chains', 'allClear', 'sent', 'doubles', 'tLines', 'tTetris', 'tSpins', 'tPC', 'bestRen', 'tRec', 'history', 'adv', 'puz', 'tutSeen', 'psent', 'nameAsked', 'name'];
  async function localLogout(kicked) {
    if (!kicked && typeof socSyncFlush === 'function') { try { await socSyncFlush(); } catch (e) {} }
    try { await APP.logout(); } catch (e) {}
    appCfg.account = null; if (net.ws) { try { net.ws.close(); } catch (e) {} net.ws = null; }
    stats = loadStats(); const d = defStats(); for (const k of RECORD_KEYS) stats[k] = d[k]; delete stats.char; delete stats.acct; saveStats();
    if (typeof socReset === 'function') socReset();
    el('pName').value = stats.name; el('pName').readOnly = false; el('pName').title = ''; $('recRank').textContent = '로그인 필요';
    refreshAuthUI();
  }
  window.openAcct = open;
  // 같은 계정으로 다른 곳에서 로그인하면(서버가 이 연결을 끊음) 이 컴퓨터는 로그아웃하고 로그인 창을 띄움
  window.acctKicked = async () => {
    if (!appCfg.account) return; await localLogout(true);
    open('login'); say('다른 곳에서 같은 계정으로 로그인해서 이 컴퓨터는 로그아웃됐어요.', true);
  };
  const close = () => { el('acct').classList.add('hidden'); after = null; };
  function signedIn(r) {
    appCfg.account = { id: r.id, name: r.name };
    stats = loadStats(); stats.name = r.name; stats.nameAsked = true; saveStats();       // 닉네임은 계정 것
    el('pName').value = r.name; el('pName').readOnly = false; el('pName').title = '닉네임을 바꿀 수 있어요';
    paint(); showRankRec();
    refreshAuthUI();
    if (typeof socSyncBoot === 'function') Promise.resolve(socSyncBoot()).catch(() => {}).then(refreshAuthUI);   // 이 계정의 기록을 서버에서 받아 합친 뒤(다른 컴퓨터에서 쌓은 기록) 다시 그림
    const f = after; close(); if (f) f();
  }
  async function submit() {
    if (!appCfg.server) { say('먼저 서버 주소를 정해 주세요.'); return; }
    const id = el('acId').value.trim(), pw = el('acPw').value;
    if (!id || !pw) { say('아이디와 비밀번호를 적어 주세요.'); return; }
    if (tab === 'reg') {
      if (pw !== el('acPw2').value) { say('비밀번호 확인이 달라요.'); return; }
      if (!el('acNick').value.trim()) { say('닉네임을 적어 주세요.'); return; }
    }
    el('acGo').disabled = true; say('확인하는 중…', false);
    try { const r = tab === 'reg' ? await APP.register(id, el('acNick').value.trim(), pw) : await APP.login(id, pw); if (r.ok) { el('acPw').value = el('acPw2').value = ''; signedIn(r); } else say(fmtErr(r)); }
    finally { el('acGo').disabled = false; }
  }
  el('acClose').addEventListener('click', close);
  el('acTabLogin').addEventListener('click', () => { tab = 'login'; say(''); paint(); });
  el('acTabReg').addEventListener('click', () => { tab = 'reg'; say(''); paint(); });
  el('acGo').addEventListener('click', submit);
  el('acct').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') close(); else if (e.key === 'Enter' && !el('acIn').classList.contains('hidden') && e.target.tagName === 'INPUT' && e.target.id !== 'acSrvIn') submit(); });
  el('acct').addEventListener('click', e => { if (e.target === el('acct')) close(); });
  el('acLogout').addEventListener('click', async () => {
    await localLogout();
    paint(); say('로그아웃했어요.', false);
  });
  el('acLogoutAll').addEventListener('click', async () => {
    if (!confirm('이 계정으로 로그인한 모든 기기에서 로그아웃할까요?')) return;
    try { await socSyncFlush(); } catch (e) {}
    const r = await APP.logoutAll(); await localLogout(true); paint(); say(r.ok ? '모든 기기에서 로그아웃했어요.' : fmtErr(r), r.ok === false);
  });
  el('acSrvGo').addEventListener('click', async () => {
    const r = await APP.setServer(el('acSrvIn').value);       // 본체가 확인 창을 따로 띄움. 성공하면 화면이 새로고침됨
    if (!r.ok) say(r.msg || '바꾸지 못했어요.');
  });
  el('acSrvIn').addEventListener('keydown', e => { if (e.key === 'Enter') el('acSrvGo').click(); });
  /* ---- 설정 > 계정 탭: 로그인 상태 · 로그아웃 · 비밀번호 바꾸기 ---- */
  const stSay = (msg, bad = true) => { const m = el('stMsg'); m.textContent = msg || ''; m.className = 'acmsg' + (msg && bad ? ' bad' : ''); };
  window.paintStAcct = function () {
    const me = appCfg.account;
    el('stWho').innerHTML = me ? `로그인: <b>${esc(me.name)}</b> <small>(${esc(me.id)})</small>` : '로그인되어 있지 않아요.';
    el('stIn').classList.toggle('hidden', !!me); el('stOut').classList.toggle('hidden', !me);
    el('stVer').textContent = `앱 버전 v${appCfg.version}` + (appCfg.shell && appCfg.shell !== appCfg.version ? ` (본체 ${appCfg.shell})` : '');
    stSay('');
  };
  el('stLog').addEventListener('click', () => APP.openUpdateLog());
  el('stLogin').addEventListener('click', () => { closeSettings(); open('login'); });
  el('stLogout').addEventListener('click', async () => {
    await localLogout();
    paint(); paintStAcct(); stSay('로그아웃했어요.', false);
  });
  el('stLogoutAll').addEventListener('click', async () => {
    if (!confirm('이 계정으로 로그인한 모든 기기에서 로그아웃할까요?')) return;
    try { await socSyncFlush(); } catch (e) {}
    const r = await APP.logoutAll(); await localLogout(true); paint(); paintStAcct(); stSay(r.ok ? '모든 기기에서 로그아웃했어요.' : fmtErr(r), r.ok === false);
  });
  el('stPwGo').addEventListener('click', async () => {
    if (!el('stOld').value || !el('stNew').value) { stSay('지금 비밀번호와 새 비밀번호를 적어 주세요.'); return; }
    if (el('stNew').value !== el('stNew2').value) { stSay('새 비밀번호 확인이 달라요.'); return; }
    el('stPwGo').disabled = true;
    try {
      const r = await APP.changePassword(el('stOld').value, el('stNew').value);
      if (r.ok) { ['stOld', 'stNew', 'stNew2'].forEach(i => { el(i).value = ''; }); stSay('비밀번호를 바꿨어요. 다른 기기는 모두 로그아웃돼요.', false); } else stSay(fmtErr(r));
    } finally { el('stPwGo').disabled = false; }
  });
  ['stOld', 'stNew', 'stNew2'].forEach(i => el(i).addEventListener('keydown', e => { if (e.key === 'Enter') el('stPwGo').click(); }));
  APP.onMenu(w => { if (w === 'account') open(); });
  appReady.then(() => {
    if (appCfg.account) { stats = loadStats(); stats.name = appCfg.account.name; saveStats(); el('pName').readOnly = false; el('pName').title = '닉네임을 바꿀 수 있어요'; }
    paint(); if (!appCfg.server) say('서버 주소가 아직 정해지지 않았어요. 온라인 대전을 하려면 주소를 정해 주세요.', false);
  });
})();
