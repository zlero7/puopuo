// 계정 HTTP API(/auth/*): JSON만 받고 크기·속도를 제한함. 응답에 비밀번호나 해시는 절대 넣지 않음
'use strict';
const auth = require('./auth');

const MAX_BODY = 2048;
const hooks = { onLogin: null };         // server.js가 채움
const MSG = {
  id_bad: '아이디는 영문 소문자·숫자·밑줄 4~16자로 정해 주세요.',
  name_bad: '닉네임은 1~10자이고, 비속어나 특수문자를 쓸 수 없어요.',
  pw_len: '비밀번호는 8~128자로 정해 주세요.',
  pw_weak: '너무 쉬운 비밀번호예요. 다른 글자를 섞어 더 길게 정해 주세요.',
  id_taken: '이미 있는 아이디예요.',
  bad_login: '아이디 또는 비밀번호가 맞지 않아요.',
  locked: '로그인에 여러 번 실패해서 잠시 막았어요.',
  rate: '요청이 너무 많아요. 잠시 뒤에 다시 해 주세요.',
  auth: '다시 로그인해 주세요.',
  bad_req: '요청이 올바르지 않아요.',
};
function reply(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(s), 'Cache-Control': 'no-store' });
  res.end(s);
}
const fail = (res, code, err, extra) => reply(res, code, { ok: false, err, msg: MSG[err] || MSG.bad_req, ...extra });
function readJson(req, res) {
  return new Promise(resolve => {
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) { fail(res, 415, 'bad_req'); resolve(null); return; }
    let n = 0; const parts = [];
    req.on('data', c => { n += c.length; if (n > MAX_BODY) { fail(res, 413, 'bad_req'); req.destroy(); resolve(null); } else parts.push(c); });
    req.on('end', () => {
      if (res.writableEnded) return;
      try { const v = JSON.parse(Buffer.concat(parts).toString('utf8')); if (v && typeof v === 'object' && !Array.isArray(v)) { resolve(v); return; } } catch (e) {}
      fail(res, 400, 'bad_req'); resolve(null);
    });
    req.on('error', () => resolve(null));
  });
}
const bearer = req => { const m = /^Bearer ([\w.\-]{10,512})$/.exec(req.headers.authorization || ''); return m ? m[1] : ''; };
// 웹(브라우저): 세션을 스크립트가 못 읽는 HttpOnly 쿠키로만 주고받음. 쿠키는 X-Puyo-Web 헤더가 있는 요청에서만 인정 — 다른 사이트의 요청은 이 헤더를 못 붙이므로(CORS 사전 요청에서 막힘) CSRF 방지
const isWeb = req => req.headers['x-puyo-web'] === '1';
const cookieTok = req => isWeb(req) ? ((/(?:^|;\s*)puyo_s=([\w.\-]{10,512})/.exec(req.headers.cookie || '') || [])[1] || '') : '';
const authed = req => auth.fromSession(bearer(req) || cookieTok(req));
const setCookie = (req, res, v, maxAge) => res.setHeader('Set-Cookie', `puyo_s=${v}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`);
// 앱은 응답에 세션을 실어 주고(본체가 보관), 웹은 쿠키로만 심고 응답 본문에는 세션을 넣지 않음
function sess(req, res, a) {
  const x = auth.sessionFor(a);
  if (!isWeb(req)) return { session: x };
  setCookie(req, res, x.token, Math.max(1, Math.floor((x.exp - Date.now()) / 1000))); return {};
}
const okAcct = (a, extra) => ({ ok: true, name: a.name, id: a.id, ...extra });

// 처리했으면 true. ip는 서버가 정한 접속 주소(프록시 뒤면 믿을 수 있는 헤더에서)
async function handle(req, res, url, ip) {
  if (req.method !== 'POST') { fail(res, 405, 'bad_req'); return; }
  const kind = url === '/auth/login' ? 'login' : url === '/auth/register' ? 'register' : url === '/auth/ticket' ? 'ticket' : 'other';
  const lim = auth.ipLimit(ip, kind); if (!lim.ok) { fail(res, 429, 'rate', { retry: lim.retry }); return; }
  if (url === '/auth/ticket') {                     // 세션 → 1회용 접속표(웹소켓 첫 메시지에 씀)
    const a = authed(req); if (!a) { fail(res, 401, 'auth'); return; }
    reply(res, 200, { ok: true, ...auth.ticketFor(a) }); return;
  }
  if (url === '/auth/refresh') {                    // 세션 갱신(앱을 켤 때 한 번)
    const a = authed(req); if (!a) { fail(res, 401, 'auth'); return; }
    reply(res, 200, okAcct(a, sess(req, res, a))); return;
  }
  if (url === '/auth/logout') { setCookie(req, res, '', 0); reply(res, 200, { ok: true }); return; }      // 웹: 쿠키 지우기(다른 기기의 세션은 그대로)
  if (url === '/auth/logout-all') {                 // 모든 기기에서 로그아웃(세션 전부 무효)
    const a = authed(req); if (!a) { fail(res, 401, 'auth'); return; }
    auth.revokeAll(a); setCookie(req, res, '', 0); reply(res, 200, { ok: true }); return;
  }
  const b = await readJson(req, res); if (!b) return;
  if (url === '/auth/register') {
    const r = await auth.register({ id: b.id, name: b.name, pw: b.pw });
    if (!r.ok) { fail(res, r.err === 'id_taken' ? 409 : 400, r.err); return; }
    console.log(`[계정] 가입 ${r.acct.id} (${ip})`);
    reply(res, 201, okAcct(r.acct, sess(req, res, r.acct))); return;
  }
  if (url === '/auth/login') {
    const r = await auth.login({ id: b.id, pw: b.pw });
    if (!r.ok) { if (r.err === 'locked') fail(res, 429, 'locked', { retry: r.retry }); else { console.log(`[계정] 로그인 실패 ${auth.normId(b.id).slice(0, 16)} (${ip})`); fail(res, 401, r.err); } return; }
    if (hooks.onLogin) hooks.onLogin(r.acct.uid);                 // 이미 접속 중인 연결(다른 컴퓨터)을 끊음
    reply(res, 200, okAcct(r.acct, sess(req, res, r.acct))); return;
  }
  if (url === '/auth/password') {
    const a = authed(req); if (!a) { fail(res, 401, 'auth'); return; }
    const r = await auth.changePassword(a, b.old, b.new);
    if (!r.ok) { fail(res, r.err === 'locked' ? 429 : r.err === 'bad_login' ? 401 : 400, r.err, r.retry ? { retry: r.retry } : undefined); return; }
    console.log(`[계정] 비밀번호 변경 ${a.id} (${ip})`);
    reply(res, 200, okAcct(r.acct, sess(req, res, r.acct))); return;
  }
  fail(res, 404, 'bad_req');
}
module.exports = { handle, authed, bearer, hooks };
