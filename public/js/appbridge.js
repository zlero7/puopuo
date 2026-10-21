// 데스크톱 앱 연결 — 앱(Electron)에서만 켜지고, 웹에서는 아무것도 하지 않음
// 앱 본체(main)가 서버 주소·로그인 세션을 갖고, 화면은 본체가 내주는 기능(window.puyoApp)만 씀
'use strict';
const APP = typeof window.puyoApp === 'object' && window.puyoApp ? window.puyoApp : null;
const appCfg = { version: '0.0.0', server: '', ws: '', canChangeServer: true, account: null };
const appReady = APP ? APP.info().then(i => Object.assign(appCfg, i)).catch(() => {}) : Promise.resolve();
// 서버에 접속할 수 있는 환경인지: 앱은 서버 주소가 정해져 있어야, 웹은 서버에서 연 주소여야
const serverOk = () => APP ? !!appCfg.server : location.protocol.startsWith('http');
// 서버 조회(랭크·순위표): 앱은 본체를 거쳐서(세션은 본체만 갖고 있음), 웹은 예전처럼 직접
function apiGet(path, params = {}) {
  if (APP) return APP.api(path, params).then(r => { if (r && r.ok) return r.data; const e = new Error((r && r.msg) || '불러오지 못했어요'); e.auth = !!(r && r.err === 'auth'); throw e; });
  const q = new URLSearchParams({ ...params, token: rankToken });
  return fetch(`${path}?${q}`).then(r => { if (!r.ok) throw new Error('불러오지 못했어요'); return r.json(); });
}
// 온라인 기능을 쓰려는데 로그인 전이면 로그인 창을 띄우고, 로그인하면 하려던 일을 이어서 함. 창을 띄웠으면 true
function needLogin(then) {
  if (!APP || appCfg.account) return false;
  openAcct('login', then); return true;
}

/* ---------- 화면 업데이트 알림(앱) ---------- */
// 새 화면이 받아져 있으면 "지금 적용"(다시 불러오기), 앱 본체 교체가 필요하면 설치 파일 받는 곳으로 안내
function showUpdate(st) {
  if (document.getElementById('splash')) return;     // 시작 화면이 떠 있는 동안은 시작 화면이 알아서 처리
  const bar = document.getElementById('updBar'); if (!bar || !st) return;
  if (st.rolledBack && !st.pending && !st.installer) { document.getElementById('updMsg').textContent = `새 화면 ${st.rolledBack.from}이 제대로 켜지지 않아 ${st.rolledBack.to}으로 돌아왔어요`; const g = document.getElementById('updGo'); g.textContent = '업데이트 기록'; g.onclick = () => APP.openUpdateLog(); document.getElementById('updLater').onclick = () => bar.classList.add('hidden'); bar.classList.remove('hidden'); return; }
  const msg = document.getElementById('updMsg'), go = document.getElementById('updGo');
  if (st.pending) {
    msg.textContent = `새 버전 ${st.pending.version} 준비 완료`; go.textContent = '지금 적용';
    go.onclick = () => { if (game.state === 'play' && !confirm('게임 중이에요. 지금 다시 불러올까요?')) return; APP.applyUpdate(); };
  } else if (st.installer) {
    msg.textContent = `새 버전 ${st.installer.version}은 앱을 새로 설치해야 해요`; go.textContent = '받으러 가기';
    go.onclick = () => APP.openReleases();
  } else { bar.classList.add('hidden'); return; }
  document.getElementById('updLater').onclick = () => bar.classList.add('hidden');
  bar.classList.remove('hidden');
}
if (APP) {
  document.body.classList.add('app');            // 앱 전용 화면 손질(웹에 있던 폰용 항목 숨김 등)
  if (APP.onUpdate) APP.onUpdate(showUpdate);
  if (APP.updateState) APP.updateState().then(showUpdate).catch(() => {});
}

/* ---------- 업데이트 내용 안내: 새 화면 버전으로 처음 켰을 때 한 번 ---------- */
async function showNews() {
  if (!APP || !APP.updateState) return;
  try {
    const st = await APP.updateState(); showUpdate(st);                // 새 화면이 켜지지 않아 되돌아왔으면 그 사실을 알림(시작 화면이 닫힌 뒤)
    if (!st || !st.notes) return;
    let seen = ''; try { seen = localStorage.getItem('puyo-news-ver') || ''; } catch (e) {}
    if (seen === st.version) return;
    try { localStorage.setItem('puyo-news-ver', st.version); } catch (e) {}
    document.getElementById('newsTitle').textContent = `v${st.version} 업데이트 내용`; document.getElementById('newsText').textContent = st.notes;
    const box = document.getElementById('newsBox'), ok = document.getElementById('newsOk'); box.classList.remove('hidden'); ok.focus();
    const done = () => box.classList.add('hidden'); ok.onclick = done; box.onclick = e => { if (e.target === box) done(); }; box.onkeydown = e => { e.stopPropagation(); if (e.key === 'Escape' || e.key === 'Enter') done(); };
  } catch (e) {}
}
/* ---------- 시작 화면: 켜면 먼저 업데이트를 확인하고, 새 화면이 있으면 받아서 바로 적용한 뒤 메인으로 ---------- */
(async function splash() {
  const el = document.getElementById('splash'); if (!el) return;
  if (!APP || !APP.updateBoot) { el.remove(); return; }
  const msg = document.getElementById('spMsg'), fill = document.getElementById('spFill'), pctEl = document.getElementById('spPct'), t0 = Date.now();
  let pct = 0; const setPct = v => { pct = Math.max(pct, Math.min(100, v)); fill.style.width = pct + '%'; pctEl.textContent = Math.round(pct) + '%'; };
  const TIPS = ['같은 색 뿌요를 4개 이상 모으면 터져요.', '연쇄가 이어질수록 상대에게 보내는 방해 뿌요가 크게 늘어요.', '랭크전은 서버가 승패를 다시 계산해서 조작할 수 없어요.',
    '매칭을 기다리는 동안 연습을 해도 매칭은 끊기지 않아요.', '캐릭터마다 AI 성격이 달라요. 도전해 보세요!', '게임 중 Esc를 누르면 일시정지해요.', 'F11로 전체 화면을 켜고 끌 수 있어요.'];
  document.getElementById('spTip').textContent = '💡 ' + TIPS[Math.floor(Math.random() * TIPS.length)];
  const close = () => { setPct(100); el.classList.add('out'); setTimeout(() => { el.remove(); window.dispatchEvent(new Event('puyo-splash-out')); showNews(); }, 500); };
  const PH = { checking: ['업데이트 확인 중…', 30], downloading: ['새 버전을 받는 중…', 62], installing: ['설치하는 중…', 88] };
  if (APP.onPhase) APP.onPhase(p => { if (PH[p]) { msg.textContent = PH[p][0]; setPct(PH[p][1]); } });
  appReady.then(() => { document.getElementById('spVer').textContent = `v${appCfg.version}`; });
  msg.textContent = PH.checking[0]; setPct(12);
  const creep = setInterval(() => { if (pct < 26) setPct(pct + 2); }, 250);    // 확인하는 동안 조금씩 차오름
  let st = null; try { st = await APP.updateBoot(); } catch (e) {}
  clearInterval(creep);
  if (st && st.pending) {                          // 새 화면을 받아 뒀으면 바로 적용(화면이 다시 불러와지며 새 버전으로 시작)
    msg.textContent = `새 버전 ${st.pending.version} 적용 중…`; setPct(96);
    const r = await APP.applyUpdate().catch(() => null); if (r && r.ok) return;
  }
  setPct(100);
  msg.textContent = st && st.installer ? `새 버전 ${st.installer.version}은 앱을 새로 설치해야 해요` : st && st.error ? `업데이트를 확인하지 못했어요 — ${st.error}` : '준비 완료!';
  await new Promise(r => setTimeout(r, Math.max(st && st.error ? 2200 : 0, 1100 - (Date.now() - t0))));     // 너무 번쩍 지나가지 않게 잠깐 보여 줌
  if (st && st.installer) {
    const ask = document.getElementById('spAsk'); ask.classList.remove('hidden');
    document.getElementById('spGo').onclick = () => APP.openReleases();
    document.getElementById('spSkip').onclick = close; return;
  }
  close();
})();
