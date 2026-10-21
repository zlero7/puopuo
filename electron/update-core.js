// 화면(UI) 업데이트 핵심 — Electron 없이 순수 Node만 씀(그래서 서버 없이도 테스트할 수 있음)
// 앱은 '화면 파일 묶음'(public/)을 새 버전으로 바꿔 끼울 수 있다. 설치 파일을 다시 받지 않아도 되지만, 그 대신 아래를 모두 통과해야만 쓴다:
//   1) 매니페스트(ui-manifest.json)의 Ed25519 서명이 앱에 들어 있는 공개키로 맞아야 함(비밀키는 GitHub 비밀값에만 있음)
//   2) 번들의 SHA-512가 매니페스트와 같고, 번들 안 파일 목록·각 파일 해시가 매니페스트와 정확히 같아야 함(더도 덜도 안 됨)
//   3) 파일 경로는 정해진 글자만, '..'·절대 경로·이상한 확장자 금지, 크기·개수 상한
//   4) 지금 버전보다 높은 버전만(되돌리기 공격 방지), 앱 본체(셸)가 지원하는 것만
//   5) 저장한 뒤에도 켤 때마다 서명·해시를 다시 확인(누가 파일을 고쳐도 걸러냄)
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const LIMITS = { manifest: 512 * 1024, bundle: 64 * 1024 * 1024, unpacked: 160 * 1024 * 1024, files: 1000 };
const PATH_RE = /^[A-Za-z0-9_][A-Za-z0-9_\-./]{0,120}$/;
const EXT_OK = new Set(['.html', '.js', '.css', '.webp', '.png', '.woff2', '.txt']);
const sha512 = buf => crypto.createHash('sha512').update(buf).digest('base64');
const SEMVER = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const parts = v => String(v).split('.').map(Number);
const cmp = (a, b) => { const x = parts(a), y = parts(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
function safeRel(p) {
  return typeof p === 'string' && PATH_RE.test(p) && !p.includes('..') && !p.includes('//') && !p.endsWith('/') && EXT_OK.has(path.extname(p).toLowerCase());
}
const within = (root, file) => { const r = path.resolve(root), f = path.resolve(file); return f === r || f.startsWith(r + path.sep); };

/* ---------- 서명 ---------- */
function publicKey(pem) {
  try { const k = crypto.createPublicKey(pem); return k.asymmetricKeyType === 'ed25519' ? k : null; } catch (e) { return null; }
}
function verifySig(bytes, sigB64, pem) {
  const k = publicKey(pem); if (!k || typeof sigB64 !== 'string') return false;
  try { return crypto.verify(null, bytes, k, Buffer.from(sigB64.trim(), 'base64')); } catch (e) { return false; }
}

/* ---------- 매니페스트 ---------- */
function parseManifest(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > LIMITS.manifest) return null;
  let m; try { m = JSON.parse(bytes.toString('utf8')); } catch (e) { return null; }
  if (!m || m.v !== 1 || !SEMVER.test(m.version) || !Number.isInteger(m.shellApi) || m.shellApi < 1) return null;
  const b = m.bundle; if (!b || typeof b.name !== 'string' || !/^[\w.\-]{1,80}$/.test(b.name) || !Number.isInteger(b.size) || b.size < 1 || b.size > LIMITS.bundle || typeof b.sha512 !== 'string' || b.sha512.length !== 88) return null;
  if (!m.files || typeof m.files !== 'object' || Array.isArray(m.files)) return null;
  const names = Object.keys(m.files); if (!names.length || names.length > LIMITS.files || !m.files['index.html']) return null;
  for (const n of names) if (!safeRel(n) || typeof m.files[n] !== 'string' || m.files[n].length !== 88) return null;
  if (m.notes !== undefined && (typeof m.notes !== 'string' || m.notes.length > 2000)) return null;          // 업데이트 내용(서명에 포함돼 변조 불가)
  if (m.patch !== undefined) {                                                                               // 바뀐 파일만 담은 작은 묶음(차등 받기)
    const q = m.patch;
    if (!q || typeof q.name !== 'string' || !/^[\w.\-]{1,80}$/.test(q.name) || !Number.isInteger(q.size) || q.size < 1 || q.size > LIMITS.bundle || typeof q.sha512 !== 'string' || q.sha512.length !== 88 || !q.files || typeof q.files !== 'object' || Array.isArray(q.files)) return null;
    for (const n of Object.keys(q.files)) if (m.files[n] !== q.files[n]) return null;                        // 패치 안 파일은 전체 목록의 같은 파일이어야 함
  }
  return m;
}
// 새 매니페스트를 받아도 되는지: { ok:true, manifest } 또는 { ok:false, reason: 'sig'|'format'|'old'|'shell', manifest? }
function check(manifestBytes, sigB64, pem, ctx) {
  if (!verifySig(manifestBytes, sigB64, pem)) return { ok: false, reason: 'sig' };
  const m = parseManifest(manifestBytes); if (!m) return { ok: false, reason: 'format' };
  if (cmp(m.version, ctx.version) <= 0) return { ok: false, reason: 'old', manifest: m };       // 같거나 낮은 버전은 안 받음
  if (m.shellApi > ctx.shellApi) return { ok: false, reason: 'shell', manifest: m };            // 앱 본체를 새로 설치해야 하는 업데이트
  return { ok: true, manifest: m };
}

/* ---------- 번들 검사 · 저장 ---------- */
// 번들(gzip된 JSON { files: { 경로: base64 } })을 매니페스트와 대조해 파일 목록을 돌려줌. 하나라도 어긋나면 예외
function openBundle(manifest, bundleBytes) {
  if (!Buffer.isBuffer(bundleBytes) || bundleBytes.length !== manifest.bundle.size) throw new Error('bundle size');
  if (sha512(bundleBytes) !== manifest.bundle.sha512) throw new Error('bundle hash');
  let json; try { json = JSON.parse(zlib.gunzipSync(bundleBytes, { maxOutputLength: LIMITS.unpacked }).toString('utf8')); } catch (e) { throw new Error('bundle format'); }
  const files = json && json.files; if (!files || typeof files !== 'object' || Array.isArray(files)) throw new Error('bundle files');
  const want = Object.keys(manifest.files), have = Object.keys(files);
  if (want.length !== have.length) throw new Error('file list');
  const out = {}; let total = 0;
  for (const n of want) {
    if (typeof files[n] !== 'string') throw new Error('file missing: ' + n);
    const buf = Buffer.from(files[n], 'base64'); total += buf.length;
    if (total > LIMITS.unpacked) throw new Error('too big');
    if (sha512(buf) !== manifest.files[n]) throw new Error('file hash: ' + n);
    out[n] = buf;
  }
  return out;
}
// 패치로 받아도 되는지: 새 버전 파일 중 지금 내 파일과 다른 것이 모두 패치 안에 있는지(readLocal: 상대 경로 → Buffer | null)
function planPatch(manifest, readLocal) {
  if (!manifest.patch) return false;
  for (const [n, h] of Object.entries(manifest.files)) {
    if (manifest.patch.files[n] === h) continue;
    let b = null; try { b = readLocal(n); } catch (e) {}
    if (!b || sha512(b) !== h) return false;
  }
  return true;
}
// 패치(gzip JSON { files: { 경로: base64 } })와 내 파일을 합쳐 전체 파일 목록을 만듦. 모든 파일을 서명된 매니페스트의 해시와 대조. 어긋나면 예외
function openPatch(manifest, patchBytes, readLocal) {
  const q = manifest.patch; if (!q) throw new Error('no patch');
  if (!Buffer.isBuffer(patchBytes) || patchBytes.length !== q.size) throw new Error('patch size');
  if (sha512(patchBytes) !== q.sha512) throw new Error('patch hash');
  let json; try { json = JSON.parse(zlib.gunzipSync(patchBytes, { maxOutputLength: LIMITS.unpacked }).toString('utf8')); } catch (e) { throw new Error('patch format'); }
  const pf = json && json.files; if (!pf || typeof pf !== 'object' || Array.isArray(pf)) throw new Error('patch files');
  if (Object.keys(pf).length !== Object.keys(q.files).length) throw new Error('patch list');
  const out = {}; let total = 0;
  for (const [n, h] of Object.entries(manifest.files)) {
    let buf;
    if (q.files[n] === h) { if (typeof pf[n] !== 'string') throw new Error('patch missing: ' + n); buf = Buffer.from(pf[n], 'base64'); }
    else buf = readLocal(n);
    if (!buf) throw new Error('local missing: ' + n);
    total += buf.length; if (total > LIMITS.unpacked) throw new Error('too big');
    if (sha512(buf) !== h) throw new Error('file hash: ' + n);
    out[n] = buf;
  }
  return out;
}
// Windows는 백신·색인이 방금 쓴 파일을 잠깐 잡고 있으면 폴더 이름 바꾸기가 EPERM/EBUSY로 실패하므로 몇 번 다시 시도(그래도 안 되면 복사로)
function renameRetry(from, to) {
  for (let i = 0; i < 8; i++) {
    try { fs.renameSync(from, to); return; } catch (e) {
      if (!/^(EPERM|EBUSY|EACCES)$/.test(e.code)) throw e;
      const t = Date.now() + 150 * (i + 1); while (Date.now() < t) { /* 잠깐 기다림 */ }
    }
  }
  fs.cpSync(from, to, { recursive: true }); rmrf(from);
}
const rmrf = p => { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) {} };
// 번들을 rootDir/<버전>/ 에 저장(임시 폴더에 다 쓴 뒤 이름을 바꿈 → 도중에 끊겨도 반쪽짜리가 남지 않음)
function stage(manifest, manifestBytes, sigB64, bundleBytes, rootDir) { return stageFiles(manifest, manifestBytes, sigB64, openBundle(manifest, bundleBytes), rootDir); }
function stageFiles(manifest, manifestBytes, sigB64, files, rootDir) {
  fs.mkdirSync(rootDir, { recursive: true });
  const dir = path.join(rootDir, manifest.version), tmp = path.join(rootDir, `.tmp-${manifest.version}-${crypto.randomBytes(4).toString('hex')}`);
  try {
    for (const [n, buf] of Object.entries(files)) {
      const f = path.join(tmp, n); if (!within(tmp, f)) throw new Error('path');
      fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf);
    }
    fs.writeFileSync(path.join(tmp, 'manifest.json'), manifestBytes); fs.writeFileSync(path.join(tmp, 'manifest.sig'), sigB64.trim());
    rmrf(dir); renameRetry(tmp, dir);
  } catch (e) { rmrf(tmp); throw e; }
  return dir;
}
// 저장된 버전 폴더가 멀쩡한지 다시 확인(서명 · 파일 해시 · 모르는 파일 없음)
function verifyDir(dir, pem) {
  try {
    const mb = fs.readFileSync(path.join(dir, 'manifest.json')), sig = fs.readFileSync(path.join(dir, 'manifest.sig'), 'utf8');
    if (!verifySig(mb, sig, pem)) return null;
    const m = parseManifest(mb); if (!m) return null;
    const seen = new Set();
    for (const [n, h] of Object.entries(m.files)) {
      const f = path.join(dir, n); if (!within(dir, f)) return null;
      if (sha512(fs.readFileSync(f)) !== h) return null; seen.add(n);
    }
    const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else { const rel = path.relative(dir, f).split(path.sep).join('/'); if (rel !== 'manifest.json' && rel !== 'manifest.sig' && !seen.has(rel)) throw new Error('extra'); } } };
    walk(dir);
    return m;
  } catch (e) { return null; }
}
const badFile = rootDir => path.join(rootDir, 'bad.json');
const readBad = rootDir => { try { const a = JSON.parse(fs.readFileSync(badFile(rootDir), 'utf8')); return new Set(Array.isArray(a) ? a.filter(v => SEMVER.test(v)) : []); } catch (e) { return new Set(); } };
function markBad(rootDir, version) { try { const s = readBad(rootDir); s.add(version); fs.mkdirSync(rootDir, { recursive: true }); fs.writeFileSync(badFile(rootDir), JSON.stringify([...s])); } catch (e) {} }
// 설치된 것 중 가장 높고 멀쩡한 버전(켜진 적 없다고 표시된 버전은 건너뜀). 망가진 폴더는 지움
function loadInstalled(rootDir, pem) {
  let names; try { names = fs.readdirSync(rootDir, { withFileTypes: true }).filter(e => e.isDirectory() && SEMVER.test(e.name)).map(e => e.name); } catch (e) { return null; }
  const bad = readBad(rootDir);
  for (const v of names.sort((a, b) => cmp(b, a))) {
    if (bad.has(v)) continue;
    const dir = path.join(rootDir, v), m = verifyDir(dir, pem);
    if (m && m.version === v) return { version: v, dir, manifest: m };
    rmrf(dir);
  }
  return null;
}
function prune(rootDir, keep = 2) {
  try {
    const names = fs.readdirSync(rootDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
    for (const n of names) if (n.startsWith('.tmp-')) rmrf(path.join(rootDir, n));
    const vs = names.filter(n => SEMVER.test(n)).sort((a, b) => cmp(b, a));
    for (const v of vs.slice(keep)) rmrf(path.join(rootDir, v));
  } catch (e) {}
}

/* ---------- 만들기(배포할 때) ---------- */
function listFiles(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(f, base, out);
    else { const rel = path.relative(base, f).split(path.sep).join('/'); if (safeRel(rel)) out.push([rel, f]); }
  }
  return out;
}
function buildBundle({ publicDir, version, shellApi, privatePem, prevFiles, notes }) {
  if (!SEMVER.test(version)) throw new Error('버전은 1.2.3 모양이어야 해요: ' + version);
  const files = {}, hashes = {};
  for (const [rel, f] of listFiles(publicDir)) { const b = fs.readFileSync(f); files[rel] = b.toString('base64'); hashes[rel] = sha512(b); }
  if (!hashes['index.html']) throw new Error('public/index.html이 없어요');
  const bundleBytes = zlib.gzipSync(Buffer.from(JSON.stringify({ files })), { level: 9 });
  const manifest = { v: 1, version, shellApi, created: new Date().toISOString(), bundle: { name: 'ui-bundle.json.gz', size: bundleBytes.length, sha512: sha512(bundleBytes) }, files: hashes };
  if (notes) manifest.notes = String(notes).slice(0, 2000);
  let patchBytes = null;
  if (prevFiles && typeof prevFiles === 'object') {                      // 이전 버전과 다른 파일만 모은 작은 묶음(앱이 이전 버전 파일을 갖고 있으면 이것만 받음)
    const changed = {}, ph = {}; for (const n of Object.keys(files)) if (prevFiles[n] !== hashes[n]) { changed[n] = files[n]; ph[n] = hashes[n]; }
    const pb = zlib.gzipSync(Buffer.from(JSON.stringify({ files: changed })), { level: 9 });
    if (pb.length < bundleBytes.length * 0.8) { patchBytes = pb; manifest.patch = { name: 'ui-patch.json.gz', size: pb.length, sha512: sha512(pb), files: ph }; }
  }
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2));
  const sigB64 = crypto.sign(null, manifestBytes, crypto.createPrivateKey(privatePem)).toString('base64');
  return { manifestBytes, sigB64, bundleBytes, patchBytes, manifest };
}

module.exports = { LIMITS, safeRel, sha512, cmp, verifySig, parseManifest, check, openBundle, planPatch, openPatch, stage, stageFiles, verifyDir, loadInstalled, markBad, readBad, prune, buildBundle, publicKey };
