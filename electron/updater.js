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
let pem = '', installed = null, pending = null, installer = null, checking = false, enabled = false;
const bundled = () => app.getVersion();

function init() {
  try { pem = (DEV && process.env.PUYO_UPDATE_PUBKEY) || fs.readFileSync(path.join(__dirname, 'update-public-key.pem'), 'utf8'); } catch (e) { pem = ''; }
  enabled = !!core.publicKey(pem) && !!BASE;
  if (!enabled) { console.log('[업데이트] 공개키나 받는 주소가 없어서 자동 업데이트는 꺼져 있어요(내장 화면만 사용).'); installed = null; return; }
  core.prune(rootDir(), 2);
  installed = core.loadInstalled(rootDir(), pem);        // 서명·해시를 다시 확인한 것만
  if (installed && core.cmp(installed.version, bundled()) <= 0) installed = null;   // 앱 본체에 든 화면이 더 높으면 그쪽을 씀
}
// 화면 파일을 어디서 읽을지: 설치된 새 화면이 있으면 그 폴더, 없으면 null(내장)
const uiRoot = () => installed ? installed.dir : null;
const version = () => installed ? installed.version : bundled();       // 서버가 확인하는 '클라이언트 버전'은 화면 버전
const state = () => ({ enabled, version: version(), shell: app.getVersion(), pending, installer });

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
    if (r.reason === 'shell') { installer = { version: r.manifest.version }; return 'installer'; }
    if (!r.ok) { if (r.reason !== 'old') console.log('[업데이트] 새 매니페스트를 거부했어요:', r.reason); return 'none'; }
    if (pending && pending.version === r.manifest.version) return 'ready';
    onPhase('downloading');
    const bundle = await get(BASE + r.manifest.bundle.name, r.manifest.bundle.size + 1);
    onPhase('installing');
    core.stage(r.manifest, mb, sig, bundle, rootDir());
    pending = { version: r.manifest.version };
    console.log('[업데이트] 새 화면', r.manifest.version, '을 받았어요(적용 전).');
    return 'ready';
  } catch (e) { console.log('[업데이트] 확인 실패:', e && e.message); return 'error'; }
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
  core.markBad(rootDir(), installed.version); installed = core.loadInstalled(rootDir(), pem);
  if (installed && core.cmp(installed.version, bundled()) <= 0) installed = null;
  return true;
}
const bootMs = () => (DEV && +process.env.PUYO_UPDATE_BOOT_MS) || 25000;

module.exports = { init, uiRoot, version, state, check, apply, failBoot, bootMs, enabled: () => enabled };
