// 뿌요뿌요 데스크톱 앱(Electron) — 화면만 보여 주는 클라이언트
// - 게임 화면은 앱 안의 파일을 puyo://app 으로 보여 줌(웹 서버·인터넷 없이도 연습·AI 대전·로컬 대전·어드벤처가 됨)
// - 온라인 대전·랭크전은 한 곳에서 돌리는 중앙 서버에 접속: 계정(아이디·비밀번호)은 서버가 확인하고, 세션은 이 본체가 OS 보안 저장소로 보관
// - 화면(렌더러)은 상자 안에 가둠: Node 없음, 엄격한 CSP(서버 주소 외 접속 불가), 외부 이동·새 창·권한 요청 거부
'use strict';
const { app, BrowserWindow, Menu, dialog, protocol, session, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const api = require('./server-api');

app.setAppUserModelId('kr.puopuo.puyopuyo');
app.setPath('userData', path.join(app.getPath('appData'), 'puyopuyo'));   // 폴더 이름을 영문으로 고정
const SCHEME = 'puyo', HOME = `${SCHEME}://app/`;
const PUBLIC = path.join(app.getAppPath(), 'public');
const SMOKE = process.env.PUYO_SMOKE === '1' || process.argv.includes('--smoke');
protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

let win = null;
if (!app.requestSingleInstanceLock()) app.quit();
else app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

/* ---------- 앱 파일 제공(puyo://app/…) ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
// 화면이 할 수 있는 접속은 서버 웹소켓 하나뿐(그 밖의 주소는 CSP가 막음)
function csp() {
  const sv = api.getServer();
  return ["default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "media-src 'self' blob: data:", "font-src 'self'",
    `connect-src ${sv ? sv.wsUrl : "'none'"}`, "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'", "object-src 'none'"].join('; ');
}
function serveFile(req) {
  const u = new URL(req.url);
  if (u.hostname !== 'app') return new Response('forbidden', { status: 403 });
  let rel; try { rel = decodeURIComponent(u.pathname); } catch (e) { return new Response('bad request', { status: 400 }); }
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!file.startsWith(PUBLIC + path.sep) || !type) return new Response('forbidden', { status: 403 });   // public 밖이나 정해진 종류가 아니면 거부
  let data; try { data = fs.readFileSync(file); } catch (e) { return new Response('not found', { status: 404 }); }
  return new Response(data, { headers: { 'Content-Type': type, 'Content-Security-Policy': csp(), 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-cache' } });
}

/* ---------- 창 ---------- */
const trusted = e => !!(win && e.sender === win.webContents && e.senderFrame && e.senderFrame.url.startsWith(HOME));   // 우리 화면에서 온 요청만
const handle = (ch, fn) => ipcMain.handle(ch, (e, v) => trusted(e) ? fn(v) : { ok: false, msg: '허용되지 않은 요청이에요.' });
function setupIpc() {
  handle('app:info', () => { const sv = api.getServer(), me = api.account(); return { version: app.getVersion(), packaged: app.isPackaged, server: sv ? sv.baseUrl : '', ws: sv ? sv.wsUrl : '', canChangeServer: api.canChangeServer(), account: me }; });
  handle('app:setServer', v => {
    const sv = api.normalizeServer(v, !app.isPackaged);
    if (!api.canChangeServer()) return { ok: false, msg: '이 앱은 서버 주소를 바꿀 수 없어요.' };
    if (!sv) return { ok: false, msg: '서버 주소가 올바르지 않아요. https://로 시작하는 주소만 쓸 수 있어요(예: https://puyo.example.com).' };
    // 렌더러가 몰래 서버를 바꾸지 못하게 본체가 직접 확인 창을 띄움
    const pick = dialog.showMessageBoxSync(win, { type: 'warning', buttons: ['이 서버로 바꾸기', '취소'], defaultId: 1, cancelId: 1, title: '서버 바꾸기',
      message: `서버를 ${sv.host}(으)로 바꿀까요?`, detail: '아이디와 비밀번호가 이 서버로 전송돼요. 믿을 수 있는 서버인지 확인해 주세요. 바꾸면 로그아웃돼요.' });
    if (pick !== 0) return { ok: false, msg: '취소했어요.' };
    api.setServer(sv.baseUrl); setTimeout(() => win && win.webContents.reload(), 50);
    return { ok: true };
  });
  handle('auth:register', v => api.register(v)); handle('auth:login', v => api.login(v)); handle('auth:logout', () => api.logout());
  handle('auth:logoutAll', () => api.logoutAll()); handle('auth:password', v => api.changePassword(v)); handle('auth:ticket', () => api.ticket());
  handle('api:get', v => api.apiGet(v));
}
function buildMenu() {
  return Menu.buildFromTemplate([
    { label: '게임', submenu: [
      { label: '전체 화면', accelerator: 'F11', click: () => win && win.setFullScreen(!win.isFullScreen()) },
      { label: '새로고침', accelerator: 'CmdOrCtrl+R', click: () => win && win.webContents.reload() },
      { type: 'separator' }, { label: '종료', accelerator: 'Alt+F4', role: 'quit' },
    ] },
    { label: '보기', submenu: [
      { label: '확대', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' }, { label: '축소', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' }, { label: '원래 크기', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
    ] },
    { label: '계정', submenu: [{ label: '내 계정 · 서버', click: () => win && win.webContents.send('menu', 'account') }] },
  ]);
}
function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 640, minHeight: 480, show: false, title: '뿌요뿌요', backgroundColor: '#e9ebf2', autoHideMenuBar: true,   // 메뉴는 Alt를 누르면 보임
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, allowRunningInsecureContent: false,
      webviewTag: false, spellcheck: false, devTools: !app.isPackaged },
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });
  win.loadURL(HOME + 'index.html');
}

/* ---------- 확인용(CI): PUYO_SMOKE=1 이면 화면을 띄워 상자 안 상태를 점검하고 결과를 파일에 적은 뒤 끝냄 ---------- */
async function smoke() {
  const out = process.env.PUYO_SMOKE_OUT || path.join(app.getPath('userData'), 'smoke.json');
  const done = (r, code) => { try { fs.writeFileSync(out, JSON.stringify(r, null, 2)); } catch (e) {} app.exit(code); };
  const timer = setTimeout(() => done({ ok: false, err: 'timeout' }, 2), 40000);
  win.webContents.once('did-finish-load', async () => {
    try {
      await new Promise(r => setTimeout(r, 2500));
      const r = await win.webContents.executeJavaScript(`(async () => ({
        origin: location.origin, app: typeof window.puyoApp, game: typeof game, node: typeof require + '/' + typeof process,
        fonts: document.fonts.check("20px 'Black Han Sans'", '메인'), ls: (() => { try { localStorage.setItem('t', '1'); return localStorage.getItem('t') === '1'; } catch (e) { return false; } })(),
        outside: await fetch('https://example.com/').then(() => 'allowed', () => 'blocked'),
        info: window.puyoApp ? await window.puyoApp.info() : null,
      }))()`);
      clearTimeout(timer);
      const good = r.origin === 'puyo://app' && r.app === 'object' && r.game === 'object' && r.node === 'undefined/undefined' && r.outside === 'blocked' && r.fonts && r.ls;
      done({ ok: !!good, ...r, version: app.getVersion(), packaged: app.isPackaged }, good ? 0 : 1);
    } catch (e) { done({ ok: false, err: String(e && e.message || e) }, 1); }
  });
}

app.whenReady().then(async () => {
  protocol.handle(SCHEME, serveFile);
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, perm, cb, d) => cb(perm === 'fullscreen' && String(d.requestingUrl).startsWith(HOME)));   // 전체 화면만 허용
  ses.setPermissionCheckHandler((wc, perm) => perm === 'fullscreen');
  ses.webRequest.onBeforeRequest((d, cb) => {          // CSP에 더해, 앱 파일·서버 말고는 어떤 요청도 보내지 않음
    const sv = api.getServer(), u = d.url;
    cb({ cancel: !(u.startsWith(HOME) || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('devtools:') || (sv && (u === sv.wsUrl + '/' || u.startsWith(sv.wsUrl + '/') || u.startsWith(sv.baseUrl + '/')))) });
  });
  api.resolveServer(); setupIpc();
  await api.restore().catch(() => {});                 // 저장된 로그인이 있으면 갱신
  Menu.setApplicationMenu(buildMenu());
  createWindow();
  if (SMOKE) smoke();
});
app.on('web-contents-created', (_e, wc) => {           // 어떤 화면이든 밖으로 못 나가고 새 창·webview를 못 만듦
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (e, url) => { if (!url.startsWith(HOME)) e.preventDefault(); });
  wc.on('will-attach-webview', e => e.preventDefault());
});
app.on('window-all-closed', () => app.quit());
