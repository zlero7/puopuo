// 뿌요뿌요 데스크톱 앱(Electron)
// - 게임 서버(server.js)를 앱 안에서 켜고, 그 화면을 창으로 보여 줌. 인터넷·서버 없이도 연습·AI 대전·로컬 대전이 됨
// - 같은 와이파이의 친구와 대전하려면 메뉴 '네트워크'에서 열기(기본은 이 컴퓨터에서만 접속)
// - 기록(전적·설정·랭크)은 사용자 폴더에 저장되고, 앱을 지워도 남음
'use strict';
const { app, BrowserWindow, Menu, dialog, shell, session } = require('electron');
const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');

// 기록(localStorage)은 주소(포트 포함)별로 저장되므로 포트를 고정해 둠. 다르게 쓰려면 PUYO_PORT
const PORT = +process.env.PUYO_PORT || 38301;
app.setPath('userData', path.join(app.getPath('appData'), 'puyopuyo'));   // 폴더 이름을 영문으로 고정
const SETTINGS = path.join(app.getPath('userData'), 'app-settings.json');
const readSettings = () => { try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) || {}; } catch (e) { return {}; } };
const writeSettings = s => { try { fs.mkdirSync(path.dirname(SETTINGS), { recursive: true }); fs.writeFileSync(SETTINGS, JSON.stringify(s)); } catch (e) { console.error('설정 저장 실패:', e.message); } };

let win = null, host = '127.0.0.1';
const origin = () => `http://127.0.0.1:${PORT}`;

if (!app.requestSingleInstanceLock()) app.quit();            // 이미 켜져 있으면 그 창을 앞으로
else app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

// 이 포트를 쓸 수 있는지(다른 프로그램이 쓰고 있으면 서버가 못 켜짐)
const portFree = (h, p) => new Promise(res => {
  const s = net.createServer();
  s.once('error', () => res(false));
  s.once('listening', () => s.close(() => res(true)));
  s.listen(p, h);
});
// 서버가 응답할 때까지 기다림
const waitServer = (tries = 50) => new Promise((res, rej) => {
  const ping = n => http.get(`${origin()}/health`, r => { r.resume(); res(); }).on('error', () => n <= 0 ? rej(new Error('서버가 켜지지 않았어요')) : setTimeout(() => ping(n - 1), 100));
  ping(tries);
});

function buildMenu() {
  const lan = !!readSettings().lan;
  const tpl = [
    { label: '게임', submenu: [
      { label: '전체 화면', accelerator: 'F11', click: () => win && win.setFullScreen(!win.isFullScreen()) },
      { label: '새로고침', accelerator: 'CmdOrCtrl+R', click: () => win && win.webContents.reload() },
      { type: 'separator' },
      { label: '종료', accelerator: 'Alt+F4', role: 'quit' },
    ] },
    { label: '보기', submenu: [
      { label: '확대', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
      { label: '축소', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
      { label: '원래 크기', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
    ] },
    { label: '네트워크', submenu: [
      { label: '같은 와이파이 친구가 접속할 수 있게 열기(다시 시작)', type: 'checkbox', checked: lan, click: item => toggleLan(item.checked) },
      { label: '내 기록 폴더 열기', click: () => shell.openPath(app.getPath('userData')) },
    ] },
  ];
  return Menu.buildFromTemplate(tpl);
}
// 친구 접속 열기/닫기: 설정을 저장하고 앱을 다시 켬(서버가 켜질 때 주소가 정해지므로)
function toggleLan(on) {
  const msg = on
    ? '같은 와이파이(공유기)에 있는 친구가 이 컴퓨터로 접속할 수 있게 열어요.\nWindows 방화벽 알림이 뜨면 "개인 네트워크"를 허용해 주세요.\n앱이 다시 시작돼요.'
    : '이 컴퓨터에서만 접속할 수 있게 닫아요.\n앱이 다시 시작돼요.';
  if (dialog.showMessageBoxSync(win, { type: 'question', buttons: ['확인', '취소'], defaultId: 0, cancelId: 1, title: '네트워크', message: msg }) !== 0) { Menu.setApplicationMenu(buildMenu()); return; }
  writeSettings({ ...readSettings(), lan: on });
  app.relaunch(); app.exit(0);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 640, minHeight: 480, show: false, title: '뿌요뿌요', backgroundColor: '#e9ebf2',
    icon: path.join(__dirname, '..', 'build', 'icon.png'), autoHideMenuBar: true,          // 메뉴는 Alt를 누르면 보임
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: !app.isPackaged, spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(origin())) e.preventDefault(); });   // 게임 밖 주소로는 못 감
  win.loadURL(origin());
}

app.whenReady().then(async () => {
  host = readSettings().lan ? '0.0.0.0' : '127.0.0.1';
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'fullscreen'));   // 전체 화면만 허용
  if (!await portFree(host, PORT)) {
    dialog.showErrorBox('뿌요뿌요', `포트 ${PORT}을(를) 다른 프로그램이 쓰고 있어서 시작할 수 없어요.\n뿌요뿌요가 이미 켜져 있는지 확인해 주세요.\n(다른 포트를 쓰려면 환경 변수 PUYO_PORT를 지정하세요. 단, 기록은 포트별로 따로 저장돼요.)`);
    app.exit(1); return;
  }
  process.env.PORT = String(PORT); process.env.HOST = host;
  process.env.RANK_FILE = path.join(app.getPath('userData'), 'ranks.json');
  try { require('../server.js'); await waitServer(); }
  catch (e) { dialog.showErrorBox('뿌요뿌요', `게임 서버를 켜지 못했어요.\n${e && e.message || e}`); app.exit(1); return; }
  Menu.setApplicationMenu(buildMenu());
  createWindow();
});

app.on('window-all-closed', () => app.quit());
// 닫을 때 모아 두었던 랭크 기록을 바로 저장
app.on('before-quit', () => { try { require('../rank.js').flush(); } catch (e) { console.error(e); } });
