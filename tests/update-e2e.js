// 화면 업데이트 종단 테스트(Linux · xvfb · playwright 필요): 임시 서명키 + 로컬 업데이트 서버로 받기 → 알림 → 적용 → 재시작 유지 → 변조·다른 키 거부 → 안 뜨는 버전 자동 복귀
// 실행: npm run test:update-app
const { chromium } = require('playwright'); const { spawn } = require('child_process'); const fs = require('fs'); const path = require('path'); const http = require('http'); const crypto = require('crypto');
const ROOT = path.join(__dirname, '..'); const core = require(path.join(ROOT,'electron','update-core')); const D = require('os').tmpdir(); const sleep = ms => new Promise(r => setTimeout(r, ms));
let logRef; let fail = 0; const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519'); const pub = publicKey.export({ type: 'spki', format: 'pem' }), prv = privateKey.export({ type: 'pkcs8', format: 'pem' });
const other = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
function mk(version, marker, key, broken) {
  const d = fs.mkdtempSync(path.join(D, 'pub-')); fs.cpSync(path.join(ROOT,'public'), d, { recursive: true });
  let h = fs.readFileSync(path.join(d, 'index.html'), 'utf8'); h = h.replace('<body', `<body data-uiv="${marker}"`);
  if (broken) h = h.replace('<script src="js/main.js"></script>', '<script src="js/none.js"></script>'); fs.writeFileSync(path.join(d, 'index.html'), h);
  return core.buildBundle({ publicDir: d, version, shellApi: 1, privatePem: key });
}
let cur = null; const srv = http.createServer((q, s) => { if (!cur) { s.writeHead(404); return s.end(); } const n = q.url.split('/').pop();
  if (n === 'ui-manifest.json') return s.end(cur.manifestBytes); if (n === 'ui-manifest.sig') return s.end(cur.sigB64); if (n === 'ui-bundle.json.gz') return s.end(cur.bundleBytes); s.writeHead(404); s.end(); }).listen(4733, '127.0.0.1');
const xdg = fs.mkdtempSync(path.join(D, 'xdg-')); let EP = 9500 + Math.floor(Math.random()*300);
async function run(env, fn) {
  const ep = EP++; const app = spawn('xvfb-run', ['-a', '-s', '-screen 0 1400x900x24', 'node_modules/electron/dist/electron', '.', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${ep}`], { cwd: ROOT, detached: true, env: { ...process.env, XDG_CONFIG_HOME: xdg, PUYO_UPDATE_BASE: 'http://127.0.0.1:4733/', PUYO_UPDATE_PUBKEY: pub, ...env }, stdio: 'pipe' });
  let log = ''; logRef = () => log.split('\n').filter(l=>/업데이트/.test(l)).join('\n'); app.stdout.on('data', d => log += d); app.stderr.on('data', d => log += d); await sleep(5000);
  try { const b = await chromium.connectOverCDP(`http://127.0.0.1:${ep}`); const pg = () => b.contexts()[0].pages().find(p => p.url().startsWith('puyo://')); await fn(pg); await b.close(); } catch (e) { console.error('오류', e.message, log.slice(-600)); fail++; }
  try { process.kill(-app.pid, 'SIGTERM'); } catch (e) {} await sleep(1500); return log;
}
(async () => {
  cur = mk('9.0.1', 'V901', prv);
  await run({}, async pg => {
    await sleep(6000); const p = pg();                 // 켜자마자 시작 화면이 확인 → 받기 → 적용(다시 불러옴)까지 알아서 함
    ok(await p.evaluate(() => document.body.dataset.uiv === 'V901'), '켜면 시작 화면에서 새 화면 9.0.1을 받아 바로 적용');
    ok(await p.evaluate(() => window.puyoApp.info().then(i => i.version)) === '9.0.1', '화면 버전이 9.0.1');
    await sleep(1500);
    ok(await p.evaluate(() => !document.getElementById('splash')), '시작 화면이 닫히고 메인으로 들어감');
  });
  await run({}, async pg => { ok(await pg().evaluate(() => document.body.dataset.uiv === 'V901'), '다시 켜도 새 화면 유지(서명 재확인 통과)'); });
  // 변조: 저장된 파일을 고치면 걸러내고 내장 화면으로
  const ud = path.join(xdg, fs.readdirSync(xdg).find(n => fs.existsSync(path.join(xdg, n, 'ui'))), 'ui', '9.0.1'); fs.appendFileSync(path.join(ud, 'index.html'), '<!--hack-->');
  cur = null;
  await run({}, async pg => { ok(await pg().evaluate(() => !document.body.dataset.uiv), '저장된 파일이 변조되면 내장 화면으로 돌아감'); });
  // 서명이 다른 키 / 낮은 버전은 거부
  cur = mk('9.0.2', 'EVIL', other);
  await run({}, async pg => { await sleep(9000); const st = await pg().evaluate(() => window.puyoApp.updateState()); ok(!st.pending, '다른 키로 서명한 업데이트는 거부'); });
  // 망가진 새 화면은 자동 복귀
  cur = mk('9.0.3', 'BROKEN', prv, true);
  await run({ PUYO_UPDATE_BOOT_MS: '4000' }, async pg => { await sleep(16000);
    ok(await pg().evaluate(() => !document.body.dataset.uiv || document.body.dataset.uiv !== 'BROKEN') && await pg().evaluate(() => typeof gameReady !== 'undefined' && window.gameReady === true), '화면이 안 뜨는 새 버전은 이전 화면으로 자동 복귀'); });
  srv.close(); console.log(fail ? `\n${fail}개 실패` : '\n모두 통과'); process.exit(fail ? 1 : 0);
})();
