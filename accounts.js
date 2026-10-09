// 계정: 아이디 · 비밀번호 · 닉네임. 로그인하면 서버가 HttpOnly 쿠키(세션)를 줌
// 비밀번호는 scrypt(소금 + 해시)로만 저장. 파일: data/accounts.json(ACCOUNT_FILE로 바꿀 수 있음)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const FILE = process.env.ACCOUNT_FILE || path.join(__dirname, 'data', 'accounts.json');
const SESSION_DAYS = 30, COOKIE = 'pp_sid';
let db = { users: {}, sessions: {} };
try { const v = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (v && v.users) db = { sessions: {}, ...v }; } catch { /* 처음 */ }
let timer = null;
const save = () => { clearTimeout(timer); timer = setTimeout(flush, 200); };
function flush() {
  clearTimeout(timer);
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE + '.tmp', JSON.stringify(db)); fs.renameSync(FILE + '.tmp', FILE); }
  catch (e) { console.error('계정 저장 실패:', e.message); }
}

const ID_RE = /^[a-z0-9_]{3,16}$/;
const rand = n => crypto.randomBytes(n).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, n);
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const cleanName = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 10);

// 로그인 시도 제한(아이피마다 1분에 10번) · 가입 제한(아이피마다 1시간에 5개)
const tries = new Map();
function limited(kind, ip, max, ms) {
  const k = `${kind}:${ip}`, now = Date.now(), list = (tries.get(k) || []).filter(t => now - t < ms);
  if (list.length >= max) { tries.set(k, list); return true; }
  list.push(now); tries.set(k, list); return false;
}

function newSession(id) {
  const sid = rand(32);
  db.sessions[sid] = { id, exp: Date.now() + SESSION_DAYS * 86400000 };
  save(); return sid;
}
const view = u => ({ id: u.id, name: u.name });            // 브라우저에 보내는 정보(랭크 열쇠는 서버 안에서만)

function signup({ id, pw, name }, ip) {
  id = String(id || '').trim().toLowerCase(); pw = String(pw || ''); name = cleanName(name) || id;
  if (!ID_RE.test(id)) return { error: '아이디는 영문 소문자·숫자·_ 3~16자로 정해 주세요.' };
  if (pw.length < 4 || pw.length > 64) return { error: '비밀번호는 4자 이상으로 정해 주세요.' };
  if (db.users[id]) return { error: '이미 있는 아이디예요.' };
  if (limited('signup', ip, +process.env.SIGNUP_LIMIT || 5, 3600000)) return { error: '가입 시도가 너무 많아요. 잠시 뒤에 다시 해 주세요.' };
  const salt = rand(16);
  db.users[id] = { id, name, salt, hash: hash(pw, salt), rk: rand(24), at: Date.now() };   // rk: 랭크 기록 열쇠(바뀌지 않음)
  save();
  return { user: view(db.users[id]), rk: db.users[id].rk, sid: newSession(id) };
}
function login({ id, pw }, ip) {
  if (limited('login', ip, 10, 60000)) return { error: '로그인 시도가 너무 많아요. 1분 뒤에 다시 해 주세요.' };
  id = String(id || '').trim().toLowerCase(); pw = String(pw || '');
  const u = db.users[id];
  if (!u || !crypto.timingSafeEqual(Buffer.from(hash(pw, u.salt), 'hex'), Buffer.from(u.hash, 'hex'))) return { error: '아이디나 비밀번호가 맞지 않아요.' };
  return { user: view(u), rk: u.rk, sid: newSession(id) };
}
function logout(sid) { if (db.sessions[sid]) { delete db.sessions[sid]; save(); } }
function userOf(sid) {
  const s = sid && db.sessions[sid];
  if (!s) return null;
  if (s.exp < Date.now()) { delete db.sessions[sid]; save(); return null; }
  return db.users[s.id] || null;
}
function rename(u, name) { name = cleanName(name); if (!name) return { error: '닉네임을 적어 주세요.' }; u.name = name; save(); return { user: view(u) }; }
function changePw(u, { old, pw }) {
  if (hash(String(old || ''), u.salt) !== u.hash) return { error: '지금 비밀번호가 맞지 않아요.' };
  pw = String(pw || ''); if (pw.length < 4 || pw.length > 64) return { error: '새 비밀번호는 4자 이상으로 정해 주세요.' };
  u.salt = rand(16); u.hash = hash(pw, u.salt);
  for (const [k, s] of Object.entries(db.sessions)) if (s.id === u.id) delete db.sessions[k];   // 다른 기기 로그아웃
  save(); return { user: view(u) };
}
// 요청 헤더의 쿠키에서 세션 꺼내기
function sidOf(req) {
  const m = /(?:^|;\s*)pp_sid=([A-Za-z0-9]+)/.exec(req.headers.cookie || '');
  return m ? m[1] : null;
}
const cookie = (sid, secure) => `${COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sid ? SESSION_DAYS * 86400 : 0}${secure ? '; Secure' : ''}`;

module.exports = { signup, login, logout, userOf, rename, changePw, sidOf, cookie, view, flush };
