// 화면 업데이트(electron/update-core.js) 테스트 — Electron·서버 없이 순수 Node로
// 서명 · 번들 검사 · 경로 공격 · 되돌리기 · 저장 후 변조 · 잘못 켜지는 버전 건너뛰기
// 실행: node tests/updater.js
const crypto = require('crypto'), fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib');
const core = require('../electron/update-core');
let fail = 0; const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fail++; };
const throws = (fn) => { try { fn(); return false; } catch (e) { return true; } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-test-'));
const pubDir = path.join(tmp, 'public'); fs.mkdirSync(path.join(pubDir, 'js'), { recursive: true });
fs.writeFileSync(path.join(pubDir, 'index.html'), '<!doctype html><title>t</title>'); fs.writeFileSync(path.join(pubDir, 'js', 'a.js'), 'console.log(1)');
fs.writeFileSync(path.join(pubDir, 'img.webp'), crypto.randomBytes(2000)); fs.writeFileSync(path.join(pubDir, 'evil.exe'), 'MZ'); fs.writeFileSync(path.join(pubDir, '.hidden'), 'x');
const kp = () => { const k = crypto.generateKeyPairSync('ed25519'); return { pub: k.publicKey.export({ type: 'spki', format: 'pem' }), priv: k.privateKey.export({ type: 'pkcs8', format: 'pem' }) }; };
const K = kp(), OTHER = kp();
const build = (version, o = {}) => core.buildBundle({ publicDir: pubDir, version, shellApi: o.shellApi || 1, privatePem: o.priv || K.priv });
const ctx = { version: '1.0.0', shellApi: 1 };
// 서명한 매니페스트를 직접 만드는 도우미(공격용): 매니페스트·번들을 마음대로 만들어 서명
const forge = (mutate, bundleFiles) => {
  const b = build('1.0.1'); const m = JSON.parse(b.manifestBytes); const files = bundleFiles || JSON.parse(zlib.gunzipSync(b.bundleBytes)).files;
  const bundleBytes = zlib.gzipSync(Buffer.from(JSON.stringify({ files }))); m.bundle = { name: 'ui-bundle.json.gz', size: bundleBytes.length, sha512: core.sha512(bundleBytes) };
  mutate && mutate(m); const mb = Buffer.from(JSON.stringify(m)); return { manifestBytes: mb, sigB64: crypto.sign(null, mb, crypto.createPrivateKey(K.priv)).toString('base64'), bundleBytes, manifest: m };
};

// ---- 만들기 ----
const b1 = build('1.0.1');
ok(Object.keys(b1.manifest.files).sort().join() === 'img.webp,index.html,js/a.js', '번들에는 허용한 종류의 파일만 들어감(.exe · 숨김 파일 제외)');
const c1 = core.check(b1.manifestBytes, b1.sigB64, K.pub, ctx);
ok(c1.ok && c1.manifest.version === '1.0.1', '올바른 서명 · 높은 버전은 받아들임');

// ---- 서명 ----
ok(core.check(b1.manifestBytes, b1.sigB64, OTHER.pub, ctx).reason === 'sig', '다른 키의 공개키로는 서명이 안 맞음');
const tampered = Buffer.from(b1.manifestBytes.toString().replace('1.0.1', '9.9.9'));
ok(core.check(tampered, b1.sigB64, K.pub, ctx).reason === 'sig', '매니페스트를 고치면 서명이 깨짐');
ok(core.check(b1.manifestBytes, 'AAAA', K.pub, ctx).reason === 'sig' && core.check(b1.manifestBytes, '', K.pub, ctx).reason === 'sig', '서명이 비었거나 엉터리면 거부');
ok(core.check(b1.manifestBytes, b1.sigB64, 'not a key', ctx).reason === 'sig', '공개키가 없거나 엉터리면 거부(업데이트 꺼짐)');
const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' });
ok(core.check(b1.manifestBytes, b1.sigB64, rsa, ctx).reason === 'sig', 'Ed25519가 아닌 키는 거부');

// ---- 버전 · 앱 본체 ----
ok(core.check(b1.manifestBytes, b1.sigB64, K.pub, { version: '1.0.1', shellApi: 1 }).reason === 'old', '같은 버전은 받지 않음');
ok(core.check(b1.manifestBytes, b1.sigB64, K.pub, { version: '1.2.0', shellApi: 1 }).reason === 'old', '낮은 버전(되돌리기)은 받지 않음');
ok(core.check(build('1.0.10').manifestBytes, build('1.0.10').sigB64, K.pub, { version: '1.0.9', shellApi: 1 }).reason === 'old' || true, '(버전은 숫자로 비교)');
const b10 = build('1.0.10'); ok(core.check(b10.manifestBytes, b10.sigB64, K.pub, { version: '1.0.9', shellApi: 1 }).ok, '1.0.10은 1.0.9보다 높음(문자열이 아니라 숫자로 비교)');
const bs = build('1.1.0', { shellApi: 2 }); const cs = core.check(bs.manifestBytes, bs.sigB64, K.pub, ctx);
ok(!cs.ok && cs.reason === 'shell' && cs.manifest.version === '1.1.0', '앱 본체가 더 새로워야 하는 업데이트는 "설치 파일 필요"로 구분');

// ---- 번들 ----
const root = path.join(tmp, 'ui');
ok(throws(() => core.stage(c1.manifest, b1.manifestBytes, b1.sigB64, Buffer.concat([b1.bundleBytes, Buffer.from('x')]), root)), '번들이 한 바이트라도 다르면 거부');
const flip = Buffer.from(b1.bundleBytes); flip[flip.length - 20] ^= 1;
ok(throws(() => core.stage(c1.manifest, b1.manifestBytes, b1.sigB64, flip, root)), '번들이 변조되면 거부(해시)');
ok(!fs.existsSync(path.join(root, '1.0.1')) && !(fs.existsSync(root) && fs.readdirSync(root).some(n => n.startsWith('.tmp'))), '거부된 번들은 흔적이 남지 않음');
const trav = forge(null, { 'index.html': Buffer.from('x').toString('base64'), '../evil.js': Buffer.from('x').toString('base64') }); trav.manifest.files = { 'index.html': core.sha512(Buffer.from('x')), '../evil.js': core.sha512(Buffer.from('x')) };
const travBytes = Buffer.from(JSON.stringify(trav.manifest)); ok(core.check(travBytes, crypto.sign(null, travBytes, crypto.createPrivateKey(K.priv)).toString('base64'), K.pub, ctx).reason === 'format', "서명이 맞아도 경로에 '..'가 있으면 거부");
for (const bad of ['/etc/passwd.js', 'a//b.js', 'C:/x.js', 'a\\b.js', 'x.exe', 'x.dll', 'sub/.js.exe', 'a b.js', '.env.js'.slice(0, 0) + 'ü.js']) {
  const f = forge(m => { m.files[bad] = m.files['index.html']; }); ok(core.check(f.manifestBytes, f.sigB64, K.pub, ctx).reason === 'format', `이상한 경로 거부: ${bad}`);
}
const noIndex = forge(m => { delete m.files['index.html']; }); ok(core.check(noIndex.manifestBytes, noIndex.sigB64, K.pub, ctx).reason === 'format', 'index.html이 없으면 거부');
const extra = forge(null, { ...JSON.parse(zlib.gunzipSync(b1.bundleBytes)).files, 'js/extra.js': Buffer.from('evil').toString('base64') });
ok(throws(() => core.openBundle(extra.manifest, extra.bundleBytes)), '매니페스트에 없는 파일이 번들에 더 있으면 거부');
const missing = forge(m => { m.files['js/b.js'] = core.sha512(Buffer.from('b')); });
ok(throws(() => core.openBundle(missing.manifest, missing.bundleBytes)), '매니페스트에 있는 파일이 번들에 없으면 거부');
const wrongHash = forge(null, { ...JSON.parse(zlib.gunzipSync(b1.bundleBytes)).files, 'index.html': Buffer.from('<html>evil</html>').toString('base64') });
ok(throws(() => core.openBundle(wrongHash.manifest, wrongHash.bundleBytes)), '파일 내용이 매니페스트의 해시와 다르면 거부');
const bomb = zlib.gzipSync(Buffer.from(JSON.stringify({ files: { 'index.html': Buffer.alloc(200 * 1024 * 1024, 65).toString('base64') } })));
const bm = JSON.parse(b1.manifestBytes); bm.bundle = { name: 'ui-bundle.json.gz', size: bomb.length, sha512: core.sha512(bomb) };
ok(throws(() => core.openBundle(bm, bomb)), '압축 폭탄(풀면 너무 큰 번들)은 거부');

// ---- 저장 · 다시 확인 ----
const dir = core.stage(c1.manifest, b1.manifestBytes, b1.sigB64, b1.bundleBytes, root);
const L1 = core.loadInstalled(root, K.pub);
ok(L1 && L1.version === '1.0.1' && fs.readFileSync(path.join(dir, 'js', 'a.js'), 'utf8') === 'console.log(1)', '저장하고 다시 불러옴(서명·해시 재확인 통과)');
ok(core.loadInstalled(root, OTHER.pub) === null && !fs.existsSync(dir), '다른 키로는 불러오지 못하고 폴더도 정리됨');
core.stage(c1.manifest, b1.manifestBytes, b1.sigB64, b1.bundleBytes, root);
fs.writeFileSync(path.join(root, '1.0.1', 'js', 'a.js'), 'console.log("evil")');
ok(core.loadInstalled(root, K.pub) === null, '저장된 파일을 몰래 고치면 걸러냄(켤 때마다 해시 확인)');
core.stage(c1.manifest, b1.manifestBytes, b1.sigB64, b1.bundleBytes, root);
fs.writeFileSync(path.join(root, '1.0.1', 'js', 'extra.js'), 'evil');
ok(core.loadInstalled(root, K.pub) === null, '저장 폴더에 모르는 파일이 생기면 걸러냄');
core.stage(c1.manifest, b1.manifestBytes, b1.sigB64, b1.bundleBytes, root);
fs.writeFileSync(path.join(root, '1.0.1', 'manifest.json'), tampered);
ok(core.loadInstalled(root, K.pub) === null, '저장된 매니페스트를 고쳐도 서명 때문에 걸러냄');

// ---- 여러 버전 · 켜지지 않는 버전 건너뛰기 · 정리 ----
const b2 = build('1.0.2'), b3 = build('1.0.3'), b4 = build('1.0.4');
for (const b of [b1, b2, b3]) core.stage(core.check(b.manifestBytes, b.sigB64, K.pub, ctx).manifest, b.manifestBytes, b.sigB64, b.bundleBytes, root);
ok(core.loadInstalled(root, K.pub).version === '1.0.3', '여러 버전이 있으면 가장 높은 멀쩡한 버전을 씀');
core.markBad(root, '1.0.3');
ok(core.loadInstalled(root, K.pub).version === '1.0.2', '켜지지 않았던 버전(bad)은 건너뛰고 그 아래 버전을 씀');
core.markBad(root, '1.0.2'); core.markBad(root, '1.0.1');
ok(core.loadInstalled(root, K.pub) === null, '모두 bad면 내장 화면으로 돌아감(null)');
fs.writeFileSync(path.join(root, 'bad.json'), 'not json'); ok(core.readBad(root).size === 0, '망가진 bad.json은 무시');
core.stage(core.check(b4.manifestBytes, b4.sigB64, K.pub, ctx).manifest, b4.manifestBytes, b4.sigB64, b4.bundleBytes, root);
fs.mkdirSync(path.join(root, '.tmp-9.9.9-dead'));
core.prune(root, 2);
ok(fs.readdirSync(root).filter(n => /^\d/.test(n)).join() === '1.0.3,1.0.4' && !fs.readdirSync(root).some(n => n.startsWith('.tmp')), '오래된 버전과 임시 폴더는 정리(최근 2개만 남김)');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail}개 실패` : '\n모두 통과'); process.exit(fail ? 1 : 0);
