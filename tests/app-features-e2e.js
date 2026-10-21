// 앱 편의·최적화 기능 종단 테스트(Linux · xvfb · playwright 필요): 진짜 서버 + 진짜 앱 창
//  - 패치로 받는 업데이트(바뀐 파일만) + 업데이트 내용 안내 + update.log
//  - 창 크기 기억 · 방 코드 복사/붙여넣기 · 프레임 제한 · 그림 지연 로딩
//  - 매칭 대기 중 서버가 끊겼다 돌아와도 자동으로 다시 연결해서 이어서 매칭
// 실행: npm run test:features
const { chromium } = require('playwright'); const { spawn } = require('child_process'); const fs = require('fs'); const path = require('path'); const http = require('http'); const crypto = require('crypto');
const WebSocket = require('ws'); const ROOT = path.join(__dirname, '..'); const core = require(path.join(ROOT, 'electron', 'update-core'));
const sleep = ms => new Promise(r => setTimeout(r, ms)); let fail = 0; const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
const T = fs.mkdtempSync(path.join(require('os').tmpdir(), 'feat-')), xdg = path.join(T, 'xdg'), data = path.join(T, 'data'); fs.mkdirSync(xdg); fs.mkdirSync(data);
const SP = 4621 + Math.floor(Math.random() * 50), UP = 4671 + Math.floor(Math.random() * 50), EP = 9600 + Math.floor(Math.random() * 300);
const K = crypto.generateKeyPairSync('ed25519'), pub = K.publicKey.export({ type: 'spki', format: 'pem' }), prv = K.privateKey.export({ type: 'pkcs8', format: 'pem' });
const SECRET = 'feat-secret-feat-secret-feat-secret-feat';

// 업데이트 서버: 앱에 든 화면(public/)을 이전 버전으로 보고, index.html만 바꾼 새 버전을 패치로 내줌
const rel = d => { const o = {}; (function w(x) { for (const e of fs.readdirSync(x, { withFileTypes: true })) { const f = path.join(x, e.name); if (e.isDirectory()) w(f); else { const r = path.relative(d, f).split(path.sep).join('/'); if (core.safeRel(r)) o[r] = core.sha512(fs.readFileSync(f)); } } })(d); return o; };
const pubDir = fs.mkdtempSync(path.join(T, 'pub-')); fs.cpSync(path.join(ROOT, 'public'), pubDir, { recursive: true });
fs.writeFileSync(path.join(pubDir, 'index.html'), fs.readFileSync(path.join(pubDir, 'index.html'), 'utf8').replace('<body', '<body data-uiv="PATCHED"'));
const built = core.buildBundle({ publicDir: pubDir, version: '9.1.0', shellApi: 3, privatePem: prv, prevFiles: rel(path.join(ROOT, 'public')), notes: '캐릭터 화질을 높였어요\n매칭이 끊겨도 자동으로 이어져요' });
const served = []; const us = http.createServer((q, s) => { const n = q.url.split('/').pop(); served.push(n);
  const f = { 'ui-manifest.json': built.manifestBytes, 'ui-manifest.sig': built.sigB64, 'ui-bundle.json.gz': built.bundleBytes, 'ui-patch.json.gz': built.patchBytes }[n]; if (!f) { s.writeHead(404); return s.end(); } s.end(f); }).listen(UP, '127.0.0.1');

let srv = null;
const startServer = () => { srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: SP, HOST: '127.0.0.1', AUTH_DIR: data, RANK_FILE: path.join(data, 'ranks.json'), RANK_OPEN: '1', AUTH_SECRET: SECRET, BACKUP: '0' }, stdio: 'pipe' }); srv.stdout.on('data', () => {}); srv.stderr.on('data', () => {}); };
const stopServer = () => new Promise(r => { srv.once('exit', r); srv.kill('SIGTERM'); });
const launch = () => spawn('xvfb-run', ['-a', '-s', '-screen 0 1600x1000x24', 'node_modules/electron/dist/electron', '.', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${EP}`], { cwd: ROOT, detached: true,
  env: { ...process.env, PUYO_SERVER: `http://127.0.0.1:${SP}`, XDG_CONFIG_HOME: xdg, PUYO_UPDATE_BASE: `http://127.0.0.1:${UP}/`, PUYO_UPDATE_PUBKEY: pub }, stdio: 'pipe' });
const stopApp = async a => { try { process.kill(-a.pid, 'SIGTERM'); } catch (e) {} await sleep(1500); };
const attach = async () => { const b = await chromium.connectOverCDP(`http://127.0.0.1:${EP}`); const pg = () => b.contexts()[0].pages().find(p => p.url().startsWith('puyo://')); return { b, pg }; };
const userData = () => path.join(xdg, fs.readdirSync(xdg).find(n => fs.existsSync(path.join(xdg, n, 'puyopuyo'))) || '', 'puyopuyo');

(async () => {
  startServer(); await sleep(1000);
  let app = launch(); await sleep(11000);
  try {
    let { b, pg } = await attach(); let p = pg();
    // ---- 패치 업데이트 + 업데이트 내용 ----
    ok(await p.evaluate(() => document.body.dataset.uiv === 'PATCHED'), '켜면 새 화면을 받아 바로 적용');
    ok(served.includes('ui-patch.json.gz') && !served.includes('ui-bundle.json.gz'), `바뀐 파일만 담은 패치만 받음(전체 묶음은 받지 않음): ${served.join(', ')}`);
    ok(fs.existsSync(path.join(userData(), 'update.log')) && /패치/.test(fs.readFileSync(path.join(userData(), 'update.log'), 'utf8')), '업데이트 기록(update.log)에 패치로 받았다고 남음');
    await p.waitForTimeout(1500);
    ok(await p.evaluate(() => !document.getElementById('newsBox').classList.contains('hidden') && /캐릭터 화질/.test(document.getElementById('newsText').textContent)), '업데이트 내용 안내가 뜸');
    await p.evaluate(() => document.getElementById('newsOk').click());
    // ---- 그림 지연 로딩 ----
    ok(await p.evaluate(() => !CHAR_LOAD.card || document.getElementById('sc-chars') ? true : true) && await p.evaluate(() => typeof CHAR_LOAD === 'object' && !CHAR_LOAD.card), '캐릭터 카드 그림은 필요해지기 전엔 불러오지 않음');
    await p.evaluate(() => { try { dlgClose(); } catch (e) {} openMenu('chars'); }); await p.waitForTimeout(1500);
    ok(await p.evaluate(() => !!CHAR_LOAD.card && charImgOk('card')), '캐릭터 화면을 열면 카드 그림을 불러옴');
    // ---- 방 코드 복사/붙여넣기 ----
    ok(await p.evaluate(() => window.puyoApp.copyCode('ab12').then(r => r.ok)), '방 코드 복사');
    ok(await p.evaluate(() => window.puyoApp.pasteCode().then(r => r.code)) === 'AB12', '복사해 둔 방 코드를 붙여넣기로 읽음');
    ok(await p.evaluate(() => window.puyoApp.copyCode('<script>').then(r => !r.ok)), '코드 모양이 아닌 글자는 복사하지 않음');
    // ---- 프레임 제한 ----
    await p.evaluate(() => { openMenu('main'); const o = window.render; window.__n = 0; window.render = function (...a) { window.__n++; return o.apply(this, a); }; stats.fps = 30; start('vs'); game.diff = 0; });
    await p.waitForTimeout(500); await p.evaluate(() => { window.__n = 0; }); await p.waitForTimeout(2000);
    const n30 = await p.evaluate(() => window.__n); ok(n30 > 0 && n30 <= 2 * 31, `프레임 제한 30: 2초에 ${n30}번 그림(최대 62)`);
    await p.evaluate(() => { stats.fps = 0; window.__n = 0; }); await p.waitForTimeout(2000);
    const n0 = await p.evaluate(() => window.__n); ok(n0 > n30, `제한을 풀면 더 자주 그림(${n0}번)`);
    await p.evaluate(() => { stats.fps = 30; openMenu('main'); });
    // ---- 창 크기 기억 ----
    await p.evaluate(() => window.resizeTo(1111, 777)); await p.waitForTimeout(1800);
    const ws1 = JSON.parse(fs.readFileSync(path.join(userData(), 'window.json'), 'utf8')); ok(ws1.width === 1111 && ws1.height === 777, `창 크기를 파일에 기억: ${ws1.width}x${ws1.height}`);
    // ---- 매칭 대기 중 서버가 끊겼다 돌아와도 이어서 ----
    const reg = await p.evaluate(() => window.puyoApp.register('feat001', '기능', 'Zx9!kqwe12')); ok(reg.ok, '가입');
    await p.evaluate(() => { appCfg.account = { id: 'feat001', name: '기능' }; game.resetOnline = true; connect(() => nsend({ t: 'quick', style: 'puyo', board: 'wide', rule: 'tsu', size: 2 })); });
    await p.waitForTimeout(2000); ok(await p.evaluate(() => !!net.wait && !!net.queued), '빠른 매칭 대기 중');
    await stopServer(); await p.waitForTimeout(1500);
    ok(await p.evaluate(() => !!net.wait && /다시 연결/.test($('netStatus').textContent)), '서버가 끊겨도 대기 표시는 유지되고 "다시 연결하는 중" 안내');
    startServer(); await p.waitForTimeout(9000);
    ok(await p.evaluate(() => !!net.wait && net.ws && net.ws.readyState === 1 && net.authed), '서버가 돌아오자 자동으로 다시 연결·로그인');
    const reg2 = await (await fetch(`http://127.0.0.1:${SP}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'rival002', name: '라이벌', pw: 'Qm7#rtyu45' }) })).json();
    const tk = await (await fetch(`http://127.0.0.1:${SP}/auth/ticket`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + reg2.session.token }, body: '{}' })).json();
    const w = new WebSocket(`ws://127.0.0.1:${SP}`, { origin: 'puyo://app' }); const got = []; w.on('message', d => got.push(JSON.parse(d)));
    await new Promise(r => w.on('open', r)); w.send(JSON.stringify({ t: 'auth', ticket: tk.ticket, ver: '9.1.0' })); await sleep(300);
    w.send(JSON.stringify({ t: 'quick', style: 'puyo', board: 'wide', rule: 'tsu', size: 2 })); await sleep(3000);
    ok(got.some(m => m.t === 'start') && await p.evaluate(() => game.mode === 'online'), '다시 연결한 뒤에도 매칭이 잡혀 온라인 대전이 시작됨');
    ok(await p.evaluate(() => window.puyoApp.attention().then(r => r.ok)), '매칭 알림(창 앞으로) 호출이 오류 없이 처리됨');
    w.close(); await b.close();
    // ---- 다시 켜면 창 크기 복원 ----
    await stopApp(app); app = launch(); await sleep(9000);
    ({ b, pg } = await attach()); p = pg();
    const size = await p.evaluate(() => [window.outerWidth, window.outerHeight]); ok(Math.abs(size[0] - 1111) <= 2 && Math.abs(size[1] - 777) <= 40, `다시 켜면 지난번 창 크기로 열림: ${size.join('x')}`);
    await b.close();
  } catch (e) { console.error('오류', e); fail++; }
  await stopApp(app); try { srv.kill('SIGTERM'); } catch (e) {} us.close();
  console.log(fail ? `\n${fail}개 실패` : '\n모두 통과'); process.exit(fail ? 1 : 0);
})();
