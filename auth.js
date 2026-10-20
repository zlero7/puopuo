// 계정(아이디 + 비밀번호) · 세션 · 접속표(ticket) — 앱 서버용
// - 비밀번호는 서버에 해시(scrypt)로만 저장: 원문은 저장하지도 로그에 남기지도 않음. 서버 비밀키(AUTH_SECRET)로 한 번 더 섞어 저장 파일만 새도 바로 풀 수 없게 함
// - 세션: 서버가 서명한 토큰(30일). 서버에 따로 저장하지 않아 서버를 껐다 켜도 유지되고, 계정의 tv(토큰 버전)를 올리면 그 계정의 모든 세션이 한꺼번에 무효가 됨
// - 접속표: 웹소켓 연결에 쓰는 30초짜리 1회용 표. 세션 토큰은 앱 본체(main)만 갖고, 화면(렌더러)에는 접속표만 줌
// - 로그인 연속 실패는 계정마다 기다리는 시간이 늘어나고(5회부터), 주소(IP)마다 요청 수도 제한
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const rank = require('./rank');

const DATA_DIR = process.env.AUTH_DIR || path.join(__dirname, 'data');
const FILE = process.env.ACCOUNTS_FILE || path.join(DATA_DIR, 'accounts.json');
const SESSION_MS = 30 * 24 * 3600 * 1000, TICKET_MS = 30 * 1000;
const now = () => +process.env.AUTH_NOW || Date.now();       // 테스트에서 시간을 옮겨 보기 위함

/* ---------- 비밀키 ---------- */
function loadSecret() {
  const env = process.env.AUTH_SECRET;
  if (env) {
    if (env.length < 32) throw new Error('AUTH_SECRET은 32자 이상이어야 합니다(예: openssl rand -hex 32).');
    return Buffer.from(env);
  }
  const f = process.env.AUTH_SECRET_FILE || path.join(DATA_DIR, 'auth-secret.key');
  try { const s = fs.readFileSync(f, 'utf8').trim(); if (s.length >= 32) return Buffer.from(s); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const s = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, s + '\n', { mode: 0o600 });
  console.log(`  인증 비밀키를 새로 만들었습니다: ${f} (이 파일이 없어지면 모두 다시 로그인해야 하고 비밀번호도 쓸 수 없게 됩니다. 환경 변수 AUTH_SECRET으로 따로 두는 것을 권장)`);
  return Buffer.from(s);
}
const SECRET = loadSecret();
const sub = label => crypto.createHmac('sha256', SECRET).update(label).digest();
const K_SESS = sub('puyo/session'), K_TICKET = sub('puyo/ticket'), K_PEPPER = sub('puyo/pepper');

/* ---------- 저장 ---------- */
let db = { v: 1, accounts: {} };
const byId = new Map();          // 아이디 → 계정
try {
  const v = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (v && v.accounts) db = v;
} catch (e) {
  if (e.code !== 'ENOENT') {
    const bak = `${FILE}.broken-${Date.now()}`;
    try { fs.renameSync(FILE, bak); } catch (_) {}
    console.error(`계정 파일을 읽지 못해 빈 상태로 시작합니다(${e.message}). 원래 파일: ${bak}`);
  }
}
for (const a of Object.values(db.accounts)) byId.set(a.id, a);
let timer = null;
const save = () => { clearTimeout(timer); timer = setTimeout(flush, 300); };
function flush() {
  clearTimeout(timer);
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const fd = fs.openSync(FILE + '.tmp', 'w', 0o600);
    try { fs.writeSync(fd, JSON.stringify(db)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(FILE + '.tmp', FILE);
  } catch (e) { console.error('계정 저장 실패:', e.message); }
}

/* ---------- 비밀번호 ---------- */
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const pre = pw => crypto.createHmac('sha256', K_PEPPER).update(String(pw).normalize('NFKC')).digest();
let running = 0; const waiters = [];
const slot = () => new Promise(res => { if (running < 4) { running++; res(); } else waiters.push(res); });   // 동시에 4개까지만 해시(메모리 보호)
const release = () => { const n = waiters.shift(); if (n) n(); else running--; };
function scrypt(buf, salt) { return new Promise((res, rej) => crypto.scrypt(buf, salt, 64, SCRYPT, (e, k) => e ? rej(e) : res(k))); }
async function hashPw(pw) {
  await slot();
  try { const salt = crypto.randomBytes(16); const k = await scrypt(pre(pw), salt); return `s1$${salt.toString('base64')}$${k.toString('base64')}`; }
  finally { release(); }
}
async function checkPw(pw, stored) {
  const [v, s, h] = String(stored).split('$');
  if (v !== 's1' || !s || !h) return false;
  await slot();
  try { const k = await scrypt(pre(pw), Buffer.from(s, 'base64')); const want = Buffer.from(h, 'base64'); return want.length === k.length && crypto.timingSafeEqual(k, want); }
  finally { release(); }
}
let DUMMY = null;                // 없는 아이디도 같은 시간이 걸리게(아이디 존재 여부를 응답 시간으로 알아내지 못하게)
const dummy = () => DUMMY || (DUMMY = hashPw('dummy-password-for-timing'));

/* ---------- 입력 검사 ---------- */
const ID_RE = /^[a-z0-9_]{4,16}$/;
const RESERVED = new Set(['admin', 'administrator', 'root', 'system', 'server', 'support', 'staff', 'moderator', 'puyo', 'puyopuyo', 'guest', 'null', 'undefined', 'anonymous']);
const COMMON = new Set(['password', 'passw0rd', '12345678', '123456789', '1234567890', 'qwertyuiop', 'qwerty123', '11111111', '00000000', 'abcd1234', 'abc12345', 'iloveyou', 'password1', 'password123', '1q2w3e4r', '1q2w3e4r5t', 'asdfghjk', 'zxcvbnm1', 'a1234567', 'q1w2e3r4', 'dlatl123', 'rkskek123', 'tkfkdgo1', 'puyopuyo', 'puyopuyo1']);
const normId = id => typeof id === 'string' ? id.trim().toLowerCase() : '';
function checkId(id) { return ID_RE.test(id) && !RESERVED.has(id) ? null : 'id_bad'; }
function checkName(name) {
  const s = typeof name === 'string' ? name.trim() : '';
  if (!s || s.length > 10) return 'name_bad';
  const c = rank.cleanName(s);
  return c === s && c !== '플레이어' ? null : 'name_bad';        // 욕설 필터에 걸리거나 특수문자가 지워지면 그대로는 못 씀
}
function checkPassword(pw, id) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 128) return 'pw_len';
  const low = pw.toLowerCase();
  if (COMMON.has(low) || new Set(pw).size < 4 || (id && low.includes(id))) return 'pw_weak';
  if (/^(?:0123456789|1234567890|abcdefghij)/.test(low) && pw.length <= 10) return 'pw_weak';
  return null;
}

/* ---------- 시도 제한 ---------- */
const ipWin = new Map();         // 'kind|ip' → { n, t0 }
const LIMITS = { login: [20, 60e3], register: [5, 3600e3], ticket: [60, 60e3], other: [30, 60e3] };
const SCALE = +process.env.AUTH_RATE_SCALE || 1;       // 테스트에서만 한도를 늘림
function ipLimit(ip, kind) {
  const [max0, win] = LIMITS[kind] || LIMITS.other, max = max0 * SCALE, k = kind + '|' + ip, t = now();
  let b = ipWin.get(k);
  if (!b || t - b.t0 > win) { b = { n: 0, t0: t }; ipWin.set(k, b); }
  if (++b.n > max) return { ok: false, retry: Math.ceil((b.t0 + win - t) / 1000) };
  return { ok: true };
}
setInterval(() => { const t = now(); for (const [k, b] of ipWin) if (t - b.t0 > 3600e3) ipWin.delete(k); for (const [k, v] of fails) if (v.until < t - 3600e3) fails.delete(k); }, 600e3).unref();
const fails = new Map();         // 아이디 → { n, until }: 연속 실패. 5회부터 30초 × 2^(n-5), 최대 5분
function lockLeft(id) { const f = fails.get(id); return f && f.until > now() ? Math.ceil((f.until - now()) / 1000) : 0; }
function failed(id) { const f = fails.get(id) || { n: 0, until: 0 }; f.n++; if (f.n >= 5) f.until = now() + Math.min(300e3, 30e3 * 2 ** (f.n - 5)); fails.set(id, f); }

/* ---------- 토큰 ---------- */
const sign = (kind, key, payload) => { const p = Buffer.from(JSON.stringify(payload)).toString('base64url'); return `${kind}.${p}.${crypto.createHmac('sha256', key).update(`${kind}.${p}`).digest('base64url')}`; };
function open(kind, key, token) {
  if (typeof token !== 'string' || token.length > 512) return null;
  const a = token.split('.'); if (a.length !== 3 || a[0] !== kind) return null;
  const want = crypto.createHmac('sha256', key).update(`${a[0]}.${a[1]}`).digest(), got = Buffer.from(a[2], 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try { const p = JSON.parse(Buffer.from(a[1], 'base64url').toString()); return p && typeof p === 'object' ? p : null; } catch (e) { return null; }
}
const pub = a => ({ uid: a.uid, id: a.id, name: a.name });
function sessionFor(a) { const e = now() + SESSION_MS; return { token: sign('s', K_SESS, { u: a.uid, e, t: a.tv }), exp: e }; }
function fromSession(token) {
  const p = open('s', K_SESS, token); if (!p || !(p.e > now())) return null;
  const a = db.accounts[p.u]; return a && a.tv === p.t ? a : null;
}
const used = new Map();          // 쓴 접속표 → 만료 시각
function ticketFor(a) { return { ticket: sign('k', K_TICKET, { u: a.uid, e: now() + TICKET_MS, j: crypto.randomBytes(8).toString('hex') }), exp: now() + TICKET_MS }; }
function useTicket(token) {
  const p = open('k', K_TICKET, token); if (!p || !(p.e > now()) || typeof p.j !== 'string') return null;
  for (const [j, e] of used) if (e < now()) used.delete(j);
  if (used.has(p.j)) return null;                               // 한 번만
  const a = db.accounts[p.u]; if (!a) return null;
  used.set(p.j, p.e); return a;
}

/* ---------- 가입 · 로그인 · 비밀번호 ---------- */
async function register({ id, name, pw }) {
  id = normId(id);
  const e = checkId(id) || checkName(name) || checkPassword(pw, id); if (e) return { err: e };
  if (byId.has(id)) return { err: 'id_taken' };
  const hash = await hashPw(pw);
  if (byId.has(id)) return { err: 'id_taken' };                 // 해시하는 동안 같은 아이디가 가입했을 수 있음
  const a = { uid: crypto.randomBytes(12).toString('hex'), id, name: name.trim(), pw: hash, tv: 0, created: now(), last: now() };
  db.accounts[a.uid] = a; byId.set(id, a); save();
  return { ok: true, acct: a };
}
async function login({ id, pw }) {
  id = normId(id);
  const left = lockLeft(id); if (left) return { err: 'locked', retry: left };
  const a = typeof pw === 'string' && pw.length <= 128 ? byId.get(id) : null;
  const ok = await checkPw(typeof pw === 'string' ? pw.slice(0, 128) : '', a ? a.pw : await dummy());
  if (!a || !ok) { failed(id); return { err: 'bad_login' }; }
  fails.delete(id); a.last = now(); save();
  return { ok: true, acct: a };
}
async function changePassword(a, oldPw, newPw) {
  const left = lockLeft(a.id); if (left) return { err: 'locked', retry: left };
  if (!await checkPw(typeof oldPw === 'string' ? oldPw.slice(0, 128) : '', a.pw)) { failed(a.id); return { err: 'bad_login' }; }
  const e = checkPassword(newPw, a.id); if (e) return { err: e };
  a.pw = await hashPw(newPw); a.tv++; fails.delete(a.id); save();   // 비밀번호를 바꾸면 이전 세션은 모두 무효
  return { ok: true, acct: a };
}
function revokeAll(a) { a.tv++; save(); }

module.exports = { register, login, changePassword, revokeAll, sessionFor, fromSession, ticketFor, useTicket, ipLimit, lockLeft, pub, flush, normId, checkId, checkName, checkPassword, SESSION_MS };
