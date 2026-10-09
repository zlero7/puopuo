// 계정: 로그인 · 회원가입 창, 내 정보의 계정 칸. 랭크전은 로그인해야 할 수 있음
'use strict';

let acct = null, logMode = 'login', logThen = null;
const acctReady = location.protocol.startsWith('http')
  ? fetch('/auth/me').then(r => r.json()).then(r => { acct = r.user; acctSync(); }).catch(() => {})
  : Promise.resolve();

function post(url, body) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
    .then(r => r.json().catch(() => ({ error: '서버 응답이 이상해요.' })));
}
// 로그인 상태가 바뀌면: 닉네임 맞추고, 열린 연결은 끊어서 다음 연결 때 새 쿠키로
function acctSync() {
  if (acct) { stats = loadStats(); stats.name = acct.name; saveStats(); }
  if (net.ws) { const ws = net.ws; net.ws = null; try { ws.close(); } catch (e) {} }
  renderAcct();
  if (cur === 'stats') renderStats();
  if (cur === 'vs') showRankRec();
}
function renderAcct() {
  const box = $('acctBox'); if (!box) return;
  if (!location.protocol.startsWith('http')) { box.innerHTML = '<span>계정은 서버 주소로 열었을 때 쓸 수 있어요</span>'; return; }
  box.innerHTML = acct
    ? `<span>계정 <b>${esc(acct.id)}</b></span><button data-ac="logout">로그아웃</button>`
    : `<span>로그인하면 랭크전을 할 수 있어요</span><button data-ac="login">로그인</button><button data-ac="signup">회원가입</button>`;
}
$('acctBox').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.ac === 'logout') post('/auth/logout').then(() => { acct = null; acctSync(); });
  else openLogin(b.dataset.ac);
});

/* ---------- 로그인 창 ---------- */
function openLogin(mode = 'login', note = '', then = null) {
  logThen = then; $('logNote').textContent = note; $('logErr').textContent = '';
  setLogMode(mode);
  $('login').classList.remove('hidden');
  setTimeout(() => $('lgId').focus(), 0);
}
function closeLogin() { $('login').classList.add('hidden'); logThen = null; }
function setLogMode(mode) {
  logMode = mode;
  document.querySelectorAll('.logtabs .seg').forEach(b => b.classList.toggle('on', b.dataset.lt === mode));
  document.querySelector('.logcard').classList.toggle('in', mode === 'login');
  $('bLogGo').textContent = mode === 'login' ? '로그인' : '가입하기';
  $('lgPw').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  if (mode === 'signup' && !$('lgName').value) $('lgName').value = loadStats().name === '플레이어' ? '' : loadStats().name;
  $('logErr').textContent = '';
}
function submitLogin() {
  const id = $('lgId').value.trim().toLowerCase(), pw = $('lgPw').value;
  if (logMode === 'signup' && pw !== $('lgPw2').value) { $('logErr').textContent = '비밀번호 확인이 달라요.'; return; }
  $('bLogGo').disabled = true;
  post(`/auth/${logMode}`, { id, pw, name: $('lgName').value.trim(), old: rankToken }).then(r => {
    $('bLogGo').disabled = false;
    if (r.error || !r.user) { $('logErr').textContent = r.error || '실패했어요.'; return; }
    acct = r.user; $('lgPw').value = $('lgPw2').value = '';
    const then = logThen; closeLogin(); acctSync();
    if (r.moved) status(`이 브라우저의 랭크 기록을 계정 ${acct.id}(으)로 옮겼어요.`);
    if (then) then();
  }).catch(() => { $('bLogGo').disabled = false; $('logErr').textContent = '서버에 연결할 수 없어요.'; });
}
document.querySelectorAll('.logtabs .seg').forEach(b => b.addEventListener('click', () => setLogMode(b.dataset.lt)));
$('bLogGo').addEventListener('click', submitLogin);
$('bLogClose').addEventListener('click', closeLogin);
$('login').addEventListener('click', e => { if (e.target.id === 'login') closeLogin(); });
$('login').addEventListener('keydown', e => {          // 창 안의 입력은 게임 조작으로 넘기지 않음
  e.stopPropagation();
  if (e.key === 'Escape') closeLogin();
  else if (e.key === 'Enter' && e.target.tagName === 'INPUT') submitLogin();
});
// 로그인한 상태에서 닉네임을 바꾸면 계정 닉네임도 바꿈
$('pName').addEventListener('change', () => { if (acct) post('/auth/name', { name: $('pName').value }).then(r => { if (r.user) acct = r.user; }); });
// 랭크전: 로그인 안 했으면 로그인 창부터
function needLogin(then) {
  if (acct) return false;
  openLogin('login', '랭크전은 로그인해야 할 수 있어요. 계정이 없으면 회원가입을 눌러 주세요.', then);
  return true;
}
renderAcct();
