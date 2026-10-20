// 서버와 주고받는 부분(앱 본체 main 프로세스만 씀): 서버 주소 검사 · 로그인 세션(안전 저장) · HTTPS 요청
// 세션 토큰은 여기서만 들고 있고 화면(렌더러)에는 절대 넘기지 않음. 화면은 1회용 접속표(웹소켓용)만 받음
'use strict';
const { app, net, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

const userData = () => app.getPath('userData');
const SETTINGS = () => path.join(userData(), 'app-settings.json');
const SESSION = () => path.join(userData(), 'session.bin');
let APP_CONFIG = {};
try { APP_CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'app-config.json'), 'utf8')) || {}; } catch (e) {}

/* ---------- 서버 주소 ---------- */
// https만 허용(개발 중에만 이 컴퓨터의 http 허용). 사용자 정보·경로·쿼리가 붙은 주소는 거부
function normalizeServer(raw, dev) {
  if (!raw || typeof raw !== 'string' || raw.length > 200) return null;
  let s = raw.trim(); if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  let u; try { u = new URL(s); } catch (e) { return null; }
  if (u.username || u.password || u.search || u.hash || (u.pathname && u.pathname !== '/')) return null;
  const loop = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && dev && loop)) return null;
  return { baseUrl: u.origin, host: u.host, wsUrl: (u.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + u.host };
}
const readSettings = () => { try { return JSON.parse(fs.readFileSync(SETTINGS(), 'utf8')) || {}; } catch (e) { return {}; } };
const writeSettings = v => { try { fs.mkdirSync(userData(), { recursive: true }); fs.writeFileSync(SETTINGS(), JSON.stringify(v)); } catch (e) { console.error('설정 저장 실패:', e.message); } };
const canChangeServer = () => APP_CONFIG.allowServerChange !== false;
let server = null;
function resolveServer() {
  const dev = !app.isPackaged, env = dev ? process.env.PUYO_SERVER : '';
  const raw = env || (canChangeServer() ? readSettings().serverUrl : '') || APP_CONFIG.serverUrl || '';
  server = normalizeServer(raw, dev);
  return server;
}
function setServer(raw) {
  const sv = normalizeServer(raw, !app.isPackaged);
  if (!sv || !canChangeServer()) return null;
  writeSettings({ ...readSettings(), serverUrl: sv.baseUrl }); clearSession(); server = sv;
  return sv;
}
const getServer = () => server;

/* ---------- 세션(안전 저장) ---------- */
let session = null;              // { token, exp, id, name, server }
function loadSession() {
  session = null;
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const j = JSON.parse(safeStorage.decryptString(fs.readFileSync(SESSION())));
    if (j && server && j.server === server.baseUrl && j.exp > Date.now()) session = j;
  } catch (e) {}
  return session;
}
function keepSession(s) {
  session = { ...s, server: server.baseUrl };
  try { if (safeStorage.isEncryptionAvailable()) { fs.mkdirSync(userData(), { recursive: true }); fs.writeFileSync(SESSION(), safeStorage.encryptString(JSON.stringify(session)), { mode: 0o600 }); } } catch (e) { console.error('세션 저장 실패:', e.message); }
}
function clearSession() { session = null; try { fs.unlinkSync(SESSION()); } catch (e) {} }
const account = () => session ? { id: session.id, name: session.name } : null;

/* ---------- 요청 ---------- */
const MSG = { net: '서버에 연결하지 못했어요. 인터넷과 서버 주소를 확인해 주세요.', tls: '서버와 안전하게 연결하지 못했어요(인증서를 확인할 수 없어요).', none: '서버 주소가 설정되지 않았어요.', bad: '서버가 올바르지 않은 응답을 보냈어요.' };
async function call(method, p, body, token) {
  if (!server) return { status: 0, err: 'none', msg: MSG.none };
  const headers = { Accept: 'application/json', 'User-Agent': `PuyoPuyo/${app.getVersion()}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  try {
    const r = await net.fetch(server.baseUrl + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'error', cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10000) });
    const text = (await r.text()).slice(0, 1e6); let json = null; try { json = JSON.parse(text); } catch (e) {}
    return { status: r.status, json };
  } catch (e) {
    return { status: 0, err: /CERT|SSL|TLS/i.test(String(e && e.message)) ? 'tls' : 'net', msg: /CERT|SSL|TLS/i.test(String(e && e.message)) ? MSG.tls : MSG.net };
  }
}
const fail = r => ({ ok: false, msg: (r.json && r.json.msg) || r.msg || MSG.bad, err: (r.json && r.json.err) || r.err || 'bad', retry: r.json && r.json.retry });

/* ---------- 화면에 주는 기능(입력은 여기서 다시 검사) ---------- */
const str = (v, max) => typeof v === 'string' && v.length <= max ? v : '';
async function entry(path, b) {
  const r = await call('POST', path, b);
  if (r.status >= 200 && r.status < 300 && r.json && r.json.ok && r.json.session) { keepSession({ token: r.json.session.token, exp: r.json.session.exp, id: r.json.id, name: r.json.name }); return { ok: true, id: r.json.id, name: r.json.name }; }
  return fail(r);
}
const register = v => entry('/auth/register', { id: str(v && v.id, 32), name: str(v && v.name, 20), pw: str(v && v.pw, 128) });
const login = v => entry('/auth/login', { id: str(v && v.id, 32), pw: str(v && v.pw, 128) });
function logout() { clearSession(); return { ok: true }; }
async function logoutAll() {
  if (!session) return { ok: true };
  const r = await call('POST', '/auth/logout-all', undefined, session.token); clearSession();
  return r.status === 200 ? { ok: true } : fail(r);
}
async function changePassword(v) {
  if (!session) return { ok: false, err: 'auth', msg: '먼저 로그인해 주세요.' };
  const r = await call('POST', '/auth/password', { old: str(v && v.old, 128), new: str(v && v.new, 128) }, session.token);
  if (r.status === 200 && r.json && r.json.session) { keepSession({ token: r.json.session.token, exp: r.json.session.exp, id: r.json.id, name: r.json.name }); return { ok: true }; }
  return fail(r);
}
async function ticket() {
  if (!session) return { ok: false, err: 'auth', msg: '먼저 로그인해 주세요.' };
  const r = await call('POST', '/auth/ticket', {}, session.token);
  if (r.status === 200 && r.json && r.json.ticket) return { ok: true, ticket: r.json.ticket };
  if (r.status === 401) clearSession();                      // 세션이 만료됐거나 다른 곳에서 전체 로그아웃함
  return fail(r);
}
// 앱을 켤 때: 저장된 세션이 있으면 갱신(만료가 가까우면 새로 받음). 서버가 거부하면 로그아웃 상태로
async function restore() {
  loadSession(); if (!session) return;
  const r = await call('POST', '/auth/refresh', {}, session.token);
  if (r.status === 200 && r.json && r.json.session) keepSession({ token: r.json.session.token, exp: r.json.session.exp, id: r.json.id, name: r.json.name });
  else if (r.status === 401) clearSession();
}
// 화면이 부를 수 있는 서버 조회(허용한 주소만)
const GET_OK = { '/rank/top': ['style', 'season', 'page', 'q'], '/rank/me': ['style'] };
async function apiGet(v) {
  const p = v && v.path; if (!GET_OK[p]) return { ok: false, msg: MSG.bad };
  const q = new URLSearchParams();
  for (const k of GET_OK[p]) { const x = v.params && v.params[k]; if (x != null && (typeof x === 'string' || typeof x === 'number')) q.set(k, String(x).slice(0, 40)); }
  const r = await call('GET', p + (q.size ? '?' + q : ''), undefined, session && session.token);
  if (r.status === 401) { if (session) clearSession(); return { ok: false, err: 'auth', msg: '다시 로그인해 주세요.' }; }
  return r.status === 200 && r.json ? { ok: true, data: r.json } : fail(r);
}

module.exports = { resolveServer, getServer, setServer, canChangeServer, normalizeServer, restore, account, register, login, logout, logoutAll, changePassword, ticket, apiGet };
