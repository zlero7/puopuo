// 화면(UI) 업데이트 — 앱 본체(main)에서만 동작. 검증은 update-core.js가 맡고, 여기는 받아 오기 · 상태 관리 · 부팅 확인을 함
// 받는 곳: GitHub Releases(공개 저장소)의 최신 릴리스. 허용한 주소 말고는 어디서도 받지 않음. 서명이 맞지 않으면 어떤 경우에도 쓰지 않음
// 공개키(electron/update-public-key.pem)가 없으면 자동 업데이트는 꺼져 있고, 내장 화면만 씀
'use strict';
const { app, net, session } = require('electron');
const fs = require('fs');
const path = require('path');
const core = require('./update-core');

const SHELL_API = require('./shell-api.json').api;
let CONFIG = {}; try { CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'app-config.json'), 'utf8')) || {}; } catch (e) {}
const DEV = !app.isPackaged;
const BASE = (DEV && process.env.PUYO_UPDATE_BASE) || CONFIG.updateBase || '';           // 예: https://github.com/zlero7/puopuo/releases/latest/download/
const ALLOWED = new Set(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com', 'github-releases.githubusercontent.com']);
const allowedUrl = (u, base) => (u.protocol === 'https:' && ALLOWED.has(u.hostname)) || (DEV && u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname) && !!base);
const rootDir = () => path.join(app.getPath('userData'), 'ui');
let pem = '', installed = null, pending = null, installer = null, checking = false, enabled = false, lastError = '';
const logFile = () => path.join(app.getPath('userData'), 'update.log');
// 업데이트 기록(문제가 생겼을 때 이유를 알 수 있게): 날짜와 한 줄씩. 200KB가 넘으면 예전 것은 .old로 넘김
function log(...a) {
  const line = `${new Date().toISOString()} ${a.join(' ')}`; console.log('[업데이트]', a.join(' '));
  try { const f = logFile(); try { if (fs.statSync(f).size > 200 * 1024) fs.renameSync(f, f + '.old'); } catch (e) {} fs.appendFileSync(f, line + '\n'); } catch (e) {}
}
// 사람이 읽을 이유 한 줄
const reason = e => { const m = String(e && e.message || e);
  if (/ERR_(INTERNET|NAME_NOT|CONNECTION|NETWORK|PROXY|TIMED|TUNNEL)|timeout/i.test(m)) return '인터넷에 연결되지 않았거나 너무 느려요';
  if (/http 404/.test(m)) return '릴리스에서 업데이트 파일을 찾을 수 없어요';
  if (/http 403|http 429/.test(m)) return 'GitHub가 잠시 접속을 막았어요(조금 뒤 다시)';
  if (/host|redirect/.test(m)) return '허용되지 않은 주소라서 막았어요';
  return '받는 중 오류가 났어요'; };
const bundled = () => app.getVersion();

function init() {
  try { pem = (DEV && process.env.PUYO_UPDATE_PUBKEY) || fs.readFileSync(path.join(__dirname, 'update-public-key.pem'), 'utf8'); } catch (e) { pem = ''; }
  enabled = !!core.publicKey(pem) && !!BASE;
  if (!enabled) { log('공개키나 받는 주소가 없어서 자동 업데이트는 꺼져 있어요(내장 화면만 사용).'); installed = null; return; }
  core.prune(rootDir(), 2);
  installed = core.loadInstalled(rootDir(), pem);        // 서명·해시를 다시 확인한 것만
  if (installed && core.cmp(installed.version, bundled()) <= 0) installed = null;   // 앱 본체에 든 화면이 더 높으면 그쪽을 씀
}
// 화면 파일을 어디서 읽을지: 설치된 새 화면이 있으면 그 폴더, 없으면 null(내장)
const uiRoot = () => installed ? installed.dir : null;
const version = () => installed ? installed.version : bundled();       // 서버가 확인하는 '클라이언트 버전'은 화면 버전
const notes = () => (installed && installed.manifest && installed.manifest.notes) || '';       // 지금 쓰는 화면 버전의 업데이트 내용
const state = () => ({ enabled, version: version(), shell: app.getVersion(), pending, installer, error: lastError, notes: notes() });
// 내 화면 파일 읽기(패치를 합칠 때 씀): 받아 둔 화면 폴더 → 없으면 앱에 든 화면
const readLocal = rel => { if (!core.safeRel(rel)) return null; for (const root of [installed && installed.dir, path.join(app.getAppPath(), 'public')]) { if (!root) continue; try { return fs.readFileSync(path.join(root, rel)); } catch (e) {} } return null; };

// 허용한 주소에서만 받음. 리다이렉트는 한 단계씩 직접 따라가며 매번 허용 목록인지 확인. 크기 상한을 넘으면 중단
// (화면용 기본 세션의 요청 차단 규칙과 섞이지 않게 전용 세션을 씀)
function get(url, max) {
  return new Promise((resolve, reject) => {
    const u0 = new URL(url); if (!allowedUrl(u0, BASE)) return reject(new Error('host'));
    const ses = session.fromPartition('puyo-update', { cache: false });
    const req = net.request({ url: u0.href, session: ses, redirect: 'manual', useSessionCookies: false, credentials: 'omit' });
    let hops = 0, done = false; const fin = (f, v) => { if (!done) { done = true; clearTimeout(t); f(v); } };
    const t = setTimeout(() => { try { req.abort(); } catch (e) {} fin(reject, new Error('timeout')); }, 90000);
    req.setHeader('User-Agent', `PuyoPuyo/${app.getVersion()}`);
    req.on('redirect', (code, method, loc) => {
      let u; try { u = new URL(loc); } catch (e) { req.abort(); return fin(reject, new Error('redirect')); }
      if (++hops > 5 || !allowedUrl(u, BASE)) { req.abort(); return fin(reject, new Error('redirect host')); }
      req.followRedirect();
    });
    req.on('response', res => {
      if (res.statusCode !== 200) { req.abort(); return fin(reject, new Error('http ' + res.statusCode)); }
      if (+res.headers['content-length'] > max) { req.abort(); return fin(reject, new Error('too big')); }
      const chunks = []; let n = 0;
      res.on('data', c => { n += c.length; if (n > max) { req.abort(); return fin(reject, new Error('too big')); } chunks.push(c); });
      res.on('end', () => fin(resolve, Buffer.concat(chunks)));
      res.on('error', e => fin(reject, e));
    });
    req.on('error', e => fin(reject, e));
    req.end();
  });
}
// 새 업데이트가 있는지 확인하고, 있으면 받아서 저장. 결과: 'none' | 'ready' | 'installer' | 'error'
async function check(onPhase = () => {}) {
  if (!enabled || checking) return 'none';
  checking = true;
  try {
    onPhase('checking');
    const mb = await get(BASE + 'ui-manifest.json', core.LIMITS.manifest), sig = (await get(BASE + 'ui-manifest.sig', 4096)).toString('utf8');
    const r = core.check(mb, sig, pem, { version: version(), shellApi: SHELL_API });
    lastError = '';
    if (r.reason === 'shell') { installer = { version: r.manifest.version }; log(`새 버전 ${r.manifest.version}은 앱 본체 교체가 필요해요.`); return 'installer'; }
    if (!r.ok) { if (r.reason !== 'old') log('새 매니페스트를 거부했어요:', r.reason); return 'none'; }
    if (pending && pending.version === r.manifest.version) return 'ready';
    onPhase('downloading');
    let files = null, how = '전체';
    if (r.manifest.patch && core.planPatch(r.manifest, readLocal)) {          // 바뀐 파일만 받기(내 파일이 한 단계 전 버전과 같을 때)
      try { files = core.openPatch(r.manifest, await get(BASE + r.manifest.patch.name, r.manifest.patch.size + 1), readLocal); how = '패치'; }
      catch (e) { log('패치를 쓰지 못해 전체를 받아요:', e && e.message); files = null; }
    }
    if (!files) files = core.openBundle(r.manifest, await get(BASE + r.manifest.bundle.name, r.manifest.bundle.size + 1));
    onPhase('installing');
    core.stageFiles(r.manifest, mb, sig, files, rootDir());
    pending = { version: r.manifest.version }; lastError = '';
    log(`새 화면 ${r.manifest.version}을 받았어요(${how}, 적용 전).`);
    return 'ready';
  } catch (e) { lastError = reason(e); log('확인 실패:', e && e.message); return 'error'; }
  finally { checking = false; }
}
// 받아 둔 새 화면을 쓰기 시작함(호출한 쪽이 창을 새로고침). 다시 한 번 서명·해시를 확인한 뒤에만 바꿈
function apply() {
  const next = core.loadInstalled(rootDir(), pem);
  if (!next || core.cmp(next.version, version()) <= 0) return false;
  installed = next; pending = null; return true;
}
// 새 화면이 켜지지 않으면(부팅 확인 시간 안에 'ui:ready'가 안 옴) 그 버전을 건너뛰고 내장 화면으로 돌아감
function failBoot() {
  if (!installed) return false;
  log(`새 화면 ${installed.version}이 켜지지 않아 건너뛰어요.`); core.markBad(rootDir(), installed.version); installed = core.loadInstalled(rootDir(), pem);
  if (installed && core.cmp(installed.version, bundled()) <= 0) installed = null;
  return true;
}
const bootMs = () => (DEV && +process.env.PUYO_UPDATE_BOOT_MS) || 25000;

const logPath = logFile;
module.exports = { logPath, init, uiRoot, version, state, check, apply, failBoot, bootMs, enabled: () => enabled };
