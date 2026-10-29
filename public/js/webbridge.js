// 웹 브라우저용 puyoApp: 앱(Electron)이 아닐 때, 앱 본체가 하던 계정 일을 브라우저에서 대신해서 같은 화면 코드가 그대로 돌게 함
// 로그인 필수 서버(REQUIRE_AUTH=1)가 제공할 때만 이 파일이 내려가고(server.js), 그 밖의 웹(Pages·개발용)에서는 404라서 예전 웹 모드 그대로
// 보안: 세션은 서버가 심은 HttpOnly 쿠키에만 있고(스크립트가 읽을 수 없음) 이 파일은 토큰을 보관하지 않음. 요청마다 X-Puyo-Web 헤더를 붙이고, 서버는 이 헤더가 있을 때만 쿠키를 인정함(CSRF 방지)
'use strict';
(function () {
  if (window.puyoApp || !/^https?:$/.test(location.protocol)) return;
  const base = location.origin, ws = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host;
  const MSG = { net: '서버에 연결하지 못했어요. 인터넷을 확인해 주세요.', bad: '실패했어요' };
  let me = null;             // 화면 표시용 { id, name }(비밀 아님)
  async function call(method, path, body) {
    const h = { Accept: 'application/json', 'X-Puyo-Web': '1' }; if (body !== undefined) h['Content-Type'] = 'application/json';
    try {
      const r = await fetch(base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, cache: 'no-store', credentials: 'same-origin', redirect: 'error' });
      let json = null; try { json = await r.json(); } catch (e) {}
      return { status: r.status, json };
    } catch (e) { return { status: 0, err: 'net', msg: MSG.net }; }
  }
  const fail = r => ({ ok: false, msg: (r.json && r.json.msg) || r.msg || MSG.bad, err: (r.json && r.json.err) || r.err || 'bad', retry: r.json && r.json.retry });
  const str = (v, max) => typeof v === 'string' && v.length <= max ? v : '';
  const okAcct = r => { me = { id: r.json.id, name: r.json.name }; return { ok: true, id: me.id, name: me.name }; };
  async function entry(path, b) { const r = await call('POST', path, b); return r.status >= 200 && r.status < 300 && r.json && r.json.ok ? okAcct(r) : fail(r); }
  const GET_OK = { '/rank/top': ['style', 'season', 'page', 'q'], '/rank/me': ['style'] };
  const NOAUTH = { ok: false, err: 'auth', msg: '먼저 로그인해 주세요.' };
  let version = '0.0.0';
  const ready = (async () => {
    const i = await call('GET', '/info'); if (i.json && typeof i.json.version === 'string') version = i.json.version;
    const r = await call('POST', '/auth/refresh', {}); if (r.status === 200 && r.json && r.json.ok) okAcct(r);        // 쿠키가 유효하면 로그인 상태, 아니면 로그아웃 상태
  })();
  window.puyoApp = {
    isApp: false, isWeb: true,
    info: async () => { await ready; return { version, shell: version, server: base, ws, canChangeServer: false, account: me }; },
    setServer: async () => ({ ok: false, msg: '웹에서는 서버 주소를 바꿀 수 없어요.' }),
    register: (id, name, pw) => entry('/auth/register', { id: str(id, 32), name: str(name, 20), pw: str(pw, 128) }),
    login: (id, pw) => entry('/auth/login', { id: str(id, 32), pw: str(pw, 128) }),
    logout: async () => { me = null; await call('POST', '/auth/logout', {}); return { ok: true }; },
    logoutAll: async () => { if (!me) return { ok: true }; const r = await call('POST', '/auth/logout-all', {}); me = null; return r.status === 200 ? { ok: true } : fail(r); },
    changePassword: async (oldPw, newPw) => {
      if (!me) return NOAUTH;
      const r = await call('POST', '/auth/password', { old: str(oldPw, 128), new: str(newPw, 128) });
      return r.status === 200 && r.json && r.json.ok ? { ok: true } : fail(r);
    },
    ticket: async () => {
      if (!me) return NOAUTH;
      const r = await call('POST', '/auth/ticket', {});
      if (r.status === 200 && r.json && r.json.ticket) return { ok: true, ticket: r.json.ticket };
      if (r.status === 401) me = null; return fail(r);       // 세션이 만료됐거나 다른 곳에서 전체 로그아웃함
    },
    api: async (path, params) => {
      if (!GET_OK[path]) return { ok: false, msg: MSG.bad };
      const q = new URLSearchParams(); for (const k of GET_OK[path]) { const x = params && params[k]; if (x != null && (typeof x === 'string' || typeof x === 'number')) q.set(k, String(x).slice(0, 40)); }
      const r = await call('GET', path + (q.size ? '?' + q : ''));
      if (r.status === 401) { me = null; return { ok: false, err: 'auth', msg: '다시 로그인해 주세요.' }; }
      return r.status === 200 && r.json ? { ok: true, data: r.json } : fail(r);
    },
    uiReady: async () => ({ ok: true }), attention: async () => ({ ok: true }),
    applyUpdate: async () => { location.reload(); return { ok: true }; },
    copyCode: async code => { const t = String(code || '').trim().toUpperCase(); if (!/^[A-Z0-9]{4}$/.test(t)) return { ok: false }; try { await navigator.clipboard.writeText(t); return { ok: true }; } catch (e) { return { ok: false }; } },
    pasteCode: async () => { try { const t = String(await navigator.clipboard.readText() || '').trim().toUpperCase(); return { ok: true, code: /^[A-Z0-9]{4}$/.test(t) ? t : '' }; } catch (e) { return { ok: true, code: '' }; } },
    openUpdateLog: async () => ({ ok: true }), openReleases: async () => ({ ok: true }),
    onPhase() {}, onUpdate() {}, onMenu() {},       // updateBoot·updateState는 일부러 없음: 시작 화면이 바로 닫히고 업데이트 알림도 안 뜸
  };
  document.body.classList.add('web');
})();
