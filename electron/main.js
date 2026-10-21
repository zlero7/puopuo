// 뿌요뿌요 데스크톱 앱(Electron) — 화면만 보여 주는 클라이언트
// - 게임 화면은 앱 안의 파일을 puyo://app 으로 보여 줌(웹 서버·인터넷 없이도 연습·AI 대전·로컬 대전·어드벤처가 됨)
// - 온라인 대전·랭크전은 한 곳에서 돌리는 중앙 서버에 접속: 계정(아이디·비밀번호)은 서버가 확인하고, 세션은 이 본체가 OS 보안 저장소로 보관
// - 화면(렌더러)은 상자 안에 가둠: Node 없음, 엄격한 CSP(서버 주소 외 접속 불가), 외부 이동·새 창·권한 요청 거부
'use strict';
const { app, BrowserWindow, Menu, dialog, protocol, session, ipcMain, shell, screen, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const api = require('./server-api');
const updater = require('./updater');

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
  const base = updater.uiRoot() || PUBLIC;                 // 업데이트로 받은(서명·해시 확인된) 새 화면이 있으면 그것, 없으면 앱에 든 화면
  const file = path.normalize(path.join(base, rel));
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!file.startsWith(base + path.sep) || !type) return new Response('forbidden', { status: 403 });   // 화면 폴더 밖이나 정해진 종류가 아니면 거부
  let data; try { data = fs.readFileSync(file); } catch (e) { return new Response('not found', { status: 404 }); }
  return new Response(data, { headers: { 'Content-Type': type, 'Content-Security-Policy': csp(), 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-cache' } });
}

/* ---------- 창 ---------- */
const trusted = e => !!(win && e.sender === win.webContents && e.senderFrame && e.senderFrame.url.startsWith(HOME));   // 우리 화면에서 온 요청만
const handle = (ch, fn) => ipcMain.handle(ch, (e, v) => trusted(e) ? fn(v) : { ok: false, msg: '허용되지 않은 요청이에요.' });
function setupIpc() {
  handle('app:info', () => { const sv = api.getServer(), me = api.account(); return { version: updater.version(), shell: app.getVersion(), update: updater.state(), packaged: app.isPackaged, server: sv ? sv.baseUrl : '', ws: sv ? sv.wsUrl : '', canChangeServer: api.canChangeServer(), account: me }; });
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
  // 화면 업데이트: 화면이 제대로 떴다고 알리면 부팅 확인을 끝냄 · 받아 둔 새 화면을 지금 적용 · 설치 파일이 필요할 때 릴리스 페이지 열기(주소는 고정)
  handle('ui:ready', () => { clearTimeout(bootTimer); bootTimer = null; return { ok: true }; });
  handle('update:state', () => updater.state());
  handle('update:boot', async () => { if (!SMOKE) await startBootCheck(); return updater.state(); });   // 시작 화면이 기다림: 켠 직후 확인 결과(최대 12초)
  handle('update:apply', () => { if (!updater.apply()) return { ok: false }; setTimeout(() => { if (win) { armBoot(); win.webContents.reload(); } }, 50); return { ok: true, version: updater.version() }; });
  // 매칭이 잡혔을 때: 창이 가려져 있어도 알아채게 작업표시줄을 깜빡이고 앞으로 가져옴(창이 이미 앞이면 아무것도 안 함)
  let attnAt = 0;
  handle('app:attention', () => {
    if (!win || win.isFocused() || Date.now() - attnAt < 2000) return { ok: true };
    attnAt = Date.now(); if (win.isMinimized()) win.restore(); win.show(); win.flashFrame(true); return { ok: true };
  });
  // 방 코드 복사·붙여넣기: 화면에는 클립보드 권한을 주지 않고, 4글자 코드 모양일 때만 본체가 대신 읽고 씀
  const CODE = /^[A-Z0-9]{4}$/;
  // (Electron 버전에 따라 clipboard 함수가 글자를 바로 주거나 Promise를 주므로 await로 둘 다 받음)
  handle('app:copyCode', async v => { const t = String(v || '').trim().toUpperCase(); if (!CODE.test(t)) return { ok: false }; await clipboard.writeText(t); return { ok: true }; });
  handle('app:pasteCode', async () => { const t = String((await clipboard.readText()) || '').trim().toUpperCase(); return { ok: true, code: CODE.test(t) ? t : '' }; });
  handle('update:openLog', () => { shell.showItemInFolder(fs.existsSync(updater.logPath()) ? updater.logPath() : app.getPath('userData')); return { ok: true }; });
  handle('update:releases', () => { shell.openExternal('https://github.com/zlero7/puopuo/releases/latest'); return { ok: true }; });
}
// 새 화면으로 켠 뒤 일정 시간 안에 화면이 제대로 떴다는 신호(ui:ready)가 없으면 그 버전을 버리고 내장 화면으로 돌아감
let bootTimer = null, bootExtended = false, bootErrs = [];
// 새 화면이 제대로 떴는지 지켜봄: 화면이 'ui:ready'를 알려 오면 끝. 제시간에 안 오면 화면 상태를 직접 들여다보고(window.gameReady),
// 멀쩡하면 신호만 놓친 것이니 그대로 쓰고, 아직 읽는 중이면 한 번 더 기다리고, 정말 안 떴을 때만 이전 화면으로 되돌림
function armBoot() {
  clearTimeout(bootTimer); bootTimer = null; bootExtended = false; bootErrs = [];
  if (!updater.uiRoot()) return;
  bootTimer = setTimeout(bootExpired, updater.bootMs());
}
async function bootExpired() {
  bootTimer = null; if (!win || win.isDestroyed()) return;
  let ready = false, loading = false, url = '';
  try { ready = (await win.webContents.executeJavaScript('window.gameReady === true')) === true; loading = win.webContents.isLoading(); url = win.webContents.getURL(); } catch (e) {}
  if (ready) { updater.log(`새 화면 ${updater.version()}의 '잘 떴다' 신호는 못 받았지만 화면은 정상이라 그대로 써요.`); return; }
  if (loading && !bootExtended) { bootExtended = true; updater.log('화면을 아직 읽는 중이라 30초 더 기다려요.'); bootTimer = setTimeout(bootExpired, 30000); return; }
  updater.log(`화면 상태: 주소=${url || '?'} 읽는 중=${loading} 오류=${bootErrs.join(' | ') || '없음'}`);
  if (updater.failBoot() && win) win.webContents.reload();
}
// 업데이트 확인: 켠 직후 한 번, 그 뒤 6시간마다. 받아 두면 화면에 알려서 '지금 적용'을 고르게 함(적용 전에는 쓰던 화면 그대로)
async function checkUpdates() {
  const r = await updater.check(p => win && win.webContents.send('update-phase', p));
  if (win && (r === 'ready' || r === 'installer')) win.webContents.send('update', updater.state());
  return r;
}
// 켠 직후 한 번(시작 화면이 결과를 기다렸다가 새 화면이 있으면 바로 적용). 느리거나 안 되면 12초 뒤 그냥 들어가고, 뒤늦게 받으면 알림창으로 알림
let bootCheck = null;
function startBootCheck() {
  if (!bootCheck) bootCheck = Promise.race([checkUpdates(), new Promise(r => setTimeout(r, 12000))]);
  return bootCheck;
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
/* ---------- 창 크기·위치·전체화면 기억 ---------- */
const WIN_FILE = () => path.join(app.getPath('userData'), 'window.json');
let lastNormal = null, winSaveT = null;
function loadWinState() {
  try {
    const s = JSON.parse(fs.readFileSync(WIN_FILE(), 'utf8')), n = v => Number.isFinite(v) ? Math.round(v) : null;
    const w = n(s.width), h = n(s.height); if (!w || !h || w < 640 || h < 480 || w > 10000 || h > 10000) return null;
    const out = { width: w, height: h, max: s.max === true, full: s.full === true }, x = n(s.x), y = n(s.y);
    if (x != null && y != null) {                         // 저장한 자리가 지금 모니터 안에 있을 때만 그 자리에(모니터를 뺐으면 가운데)
      const vis = screen.getAllDisplays().some(d => { const a = d.workArea; return x + 100 < a.x + a.width && x + w - 100 > a.x && y + 40 < a.y + a.height && y > a.y - 20; });
      if (vis) { out.x = x; out.y = y; }
    }
    return out;
  } catch (e) { return null; }
}
function saveWinState() {
  if (!win || win.isDestroyed() || SMOKE) return;
  const b = win.isMaximized() || win.isFullScreen() || win.isMinimized() ? lastNormal : win.getBounds(); if (!b) return;
  try { fs.writeFileSync(WIN_FILE(), JSON.stringify({ ...b, max: win.isMaximized(), full: win.isFullScreen() })); } catch (e) {}
}
function createWindow() {
  const ws = SMOKE ? null : loadWinState();
  win = new BrowserWindow({
    width: ws ? ws.width : 1280, height: ws ? ws.height : 820, ...(ws && ws.x != null ? { x: ws.x, y: ws.y } : {}), minWidth: 640, minHeight: 480, show: false, title: '뿌요뿌요', backgroundColor: '#e9ebf2', autoHideMenuBar: true,   // 메뉴는 Alt를 누르면 보임
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, allowRunningInsecureContent: false,
      webviewTag: false, spellcheck: false, devTools: !app.isPackaged },
  });
  if (ws && ws.max) win.maximize();
  win.once('ready-to-show', () => { win.show(); if (ws && ws.full) win.setFullScreen(true); });
  const track = () => { if (win && !win.isMaximized() && !win.isFullScreen() && !win.isMinimized()) lastNormal = win.getBounds(); clearTimeout(winSaveT); winSaveT = setTimeout(saveWinState, 600); };
  ['resize', 'move', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'].forEach(ev => win.on(ev, track));
  win.on('close', saveWinState);
  win.webContents.on('console-message', (ev, lv, msg, ln, src) => {            // 켜지는 동안 난 화면 오류를 기록(왜 안 떴는지 알 수 있게)
    const d = ev && ev.message !== undefined ? ev : { level: lv, message: msg, lineNumber: ln, sourceId: src };
    if (bootTimer && (d.level === 'error' || d.level === 3 || d.level === 2) && bootErrs.length < 5) bootErrs.push(`${String(d.message).slice(0, 120)} (${path.basename(String(d.sourceId || ''))}:${d.lineNumber})`);
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => { if (isMain && code !== -3) updater.log(`화면 읽기 실패: ${desc}(${code}) ${String(url).slice(0, 80)}`); });
  win.webContents.on('render-process-gone', (_e, d) => updater.log(`화면 프로세스가 멈췄어요: ${d && d.reason}`));
  win.on('focus', () => win.flashFrame(false));
  lastNormal = win.getBounds();
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
  api.resolveServer(); setupIpc(); updater.init();
  await api.restore().catch(() => {});                 // 저장된 로그인이 있으면 갱신
  Menu.setApplicationMenu(buildMenu());
  createWindow(); armBoot();
  if (SMOKE) smoke();
  else { startBootCheck(); setInterval(checkUpdates, 6 * 3600 * 1000).unref(); }
});
app.on('web-contents-created', (_e, wc) => {           // 어떤 화면이든 밖으로 못 나가고 새 창·webview를 못 만듦
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (e, url) => { if (!url.startsWith(HOME)) e.preventDefault(); });
  wc.on('will-attach-webview', e => e.preventDefault());
});
app.on('window-all-closed', () => app.quit());
