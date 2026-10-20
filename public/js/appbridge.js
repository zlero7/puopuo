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
