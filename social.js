// 친구 · 프로필(남의 전적 보기): 웹소켓으로 로그인한 사람만. 친구는 서로 받아야 되는 방식(요청 → 수락)
// - 남에게 보이는 것은 친구 코드(pid) · 닉네임 · 대표 캐릭터 · 랭크 전적뿐. 로그인 아이디는 절대 내보내지 않음
'use strict';
const auth = require('./auth');
const rank = require('./rank');
const practice = require('./practice');
const StatSync = require('./public/js/statsync');
const fs = require('fs'), path = require('path');

// 기록 동기화: 계정마다 파일 하나(data/sync/<uid>.json). 합치는 규칙은 화면과 같은 파일(statsync.js)을 씀
const SYNC_DIR = path.join(process.env.AUTH_DIR || path.join(__dirname, 'data'), 'sync');
const syncFile = uid => path.join(SYNC_DIR, `${String(uid).replace(/[^a-f0-9]/gi, '')}.json`);
function syncLoad(uid) { try { return StatSync.clean(JSON.parse(fs.readFileSync(syncFile(uid), 'utf8'))); } catch (e) { return null; } }
function syncSave(uid, data) {
  fs.mkdirSync(SYNC_DIR, { recursive: true, mode: 0o700 });
  const f = syncFile(uid), fd = fs.openSync(f + '.tmp', 'w', 0o600);
  try { fs.writeSync(fd, JSON.stringify(data)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(f + '.tmp', f);
}

const MAX_FRIENDS = 50, MAX_PENDING = 30;
const CHARS = ['lumi', 'toto', 'pin', 'moka', 'byeol', 'kuro', 'somi', 'bolt'];
const fmtPid = p => `${p.slice(0, 4)}-${p.slice(4)}`;
const arr = (a, k) => Array.isArray(a[k]) ? a[k] : (a[k] = []);

// 남에게 보여 줄 한 줄 정보
function card(a, isOnline) {
  const rk = {};
  for (const st of rank.STYLES) { const pr = rank.profile(a.uid, st); rk[st] = pr.has ? { text: pr.text, group: pr.group, div: pr.div, placing: pr.placing } : null; }
  return { pid: fmtPid(auth.ensurePid(a)), name: a.name, char: CHARS.includes(a.char) ? a.char : 'lumi', online: !!isOnline(a.uid), rk };
}
const listOf = (a, uids, isOnline) => uids.map(auth.byUid).filter(Boolean).map(x => card(x, isOnline));
function snapshot(a, isOnline) {
  return { op: 'list', me: { pid: fmtPid(auth.ensurePid(a)), name: a.name, char: CHARS.includes(a.char) ? a.char : 'lumi' },
    friends: listOf(a, arr(a, 'friends'), isOnline), inc: listOf(a, arr(a, 'inc'), isOnline), out: listOf(a, arr(a, 'out'), isOnline) };
}
const without = (list, uid) => { const i = list.indexOf(uid); if (i >= 0) list.splice(i, 1); return i >= 0; };
function relation(a, t) {
  if (a.uid === t.uid) return 'me';
  if (arr(a, 'friends').includes(t.uid)) return 'friend';
  if (arr(a, 'inc').includes(t.uid)) return 'incoming';
  if (arr(a, 'out').includes(t.uid)) return 'outgoing';
  return 'none';
}
const err = msg => ({ op: 'err', msg });
const lastAt = new Map();                                     // 'uid:종류' → 마지막 시각(너무 자주 보내는 것 막기)
setInterval(() => { const t = Date.now() - 60000; for (const [k, v] of lastAt) if (v < t) lastAt.delete(k); }, 60000).unref();

// m: 클라이언트가 보낸 메시지, ctx: { isOnline(uid), notify(uid, msg) } → 돌려줄 메시지(없으면 null)
function handle(a, m, ctx) {
  const op = typeof m.op === 'string' ? m.op : '';
  if (op === 'list') return snapshot(a, ctx.isOnline);
  if (op === 'char') {
    if (!CHARS.includes(m.char)) return err('캐릭터를 알 수 없어요.');
    if (a.char !== m.char) { a.char = m.char; auth.saveSoon(); }
    return null;
  }
  if (op === 'name') {                                                            // 닉네임 바꾸기
    const w = lastAt.get(a.uid + ':name') || 0; if (Date.now() - w < 10000) return err('닉네임을 너무 자주 바꾸고 있어요. 잠시 뒤에 다시 해 주세요.');
    const n = typeof m.name === 'string' ? m.name.trim() : '';
    if (auth.checkName(n)) return err('닉네임은 1~10자이고, 비속어나 특수문자를 쓸 수 없어요.');
    lastAt.set(a.uid + ':name', Date.now());
    if (n !== a.name) { a.name = n; auth.saveSoon(); rank.renameUid(a.uid, n); if (ctx.renamed) ctx.renamed(a.uid, n); }
    return { op: 'name', name: a.name };
  }
  if (op === 'sg') return { op: 'sg', data: syncLoad(a.uid) };                  // 내 기록 받기
  if (op === 'sp') {                                                              // 내 기록 올리기: 저장된 것과 합쳐서 돌려줌
    const w = lastAt.get(a.uid + ':sp') || 0; if (Date.now() - w < 2000) return err('기록을 너무 자주 올리고 있어요.');
    lastAt.set(a.uid + ':sp', Date.now());
    const inc = StatSync.clean(m.data); if (!inc) return err('기록 모양이 올바르지 않아요.');
    const merged = StatSync.merge(syncLoad(a.uid), inc);
    try { syncSave(a.uid, merged); } catch (e) { console.error('기록 저장 실패:', e.message); return err('기록을 저장하지 못했어요.'); }
    return { op: 'sp', data: merged };
  }
  if (op === 'ps') {                                           // 연습 기록 올리기
    const w = lastAt.get(a.uid + ':ps') || 0; if (Date.now() - w < 1500) return err('기록을 너무 자주 올리고 있어요.');
    lastAt.set(a.uid + ':ps', Date.now());
    const r = practice.submit(a, m.mode, +m.v); return r.err ? err(r.err) : { op: 'ps', mode: m.mode, ...r };
  }
  if (op === 'pl') {                                           // 연습 순위표
    const r = practice.board(m.mode, a.uid, 30, uid => { const x = auth.byUid(uid); return x ? fmtPid(auth.ensurePid(x)) : ''; });
    return r.err ? err(r.err) : { op: 'pl', ...r };
  }
  const t = auth.byPid(m.pid);
  if (op === 'prof') {
    if (!t) return err('그런 플레이어를 찾을 수 없어요.');
    const st = rank.STYLES.includes(m.sty) ? m.sty : 'puyo';
    return { op: 'prof', style: st, rel: relation(a, t), user: { ...card(t, ctx.isOnline), since: t.created }, profile: rank.profile(t.uid, st), other: rank.profile(t.uid, st === 'puyo' ? 'tetris' : 'puyo') };
  }
  if (op === 'inv' || op === 'dec') {                          // 친구에게 대전 신청(방 코드를 실어 보냄) · 거절
    if (!t) return err('그런 친구를 찾을 수 없어요.');
    if (!arr(a, 'friends').includes(t.uid)) return err('친구에게만 대전을 신청할 수 있어요.');
    if (op === 'dec') { ctx.notify(t.uid, { op: 'ping', what: 'declined', name: a.name, pid: fmtPid(auth.ensurePid(a)), why: m.why === 'busy' ? 'busy' : '' }); return null; }
    if (!ctx.isOnline(t.uid)) return err(`${t.name}님은 지금 접속 중이 아니에요.`);
    const code = typeof m.code === 'string' ? m.code.toUpperCase() : '';
    if (!/^[A-Z0-9]{4}$/.test(code)) return err('방 코드가 올바르지 않아요.');
    const w = lastAt.get(a.uid + ':inv') || 0; if (Date.now() - w < 3000) return err('신청을 너무 자주 보내고 있어요. 잠시 뒤에 다시 해 주세요.');
    lastAt.set(a.uid + ':inv', Date.now());
    const pick = (v, list) => list.includes(v) ? v : '';
    ctx.notify(t.uid, { op: 'ping', what: 'invite', name: a.name, pid: fmtPid(auth.ensurePid(a)), code, style: pick(m.style, rank.STYLES), rule: pick(m.rule, ['tsu', 'fever', 'bigbang', 'swap', 'party', 'fusion']), board: pick(m.board, ['wide', 'classic', 'tiny']) });
    return { op: 'inv', name: t.name };
  }
  if (!['add', 'acc', 'del'].includes(op)) return err('알 수 없는 요청이에요.');
  if (!t) return err('그런 친구 코드가 없어요. 코드를 다시 확인해 주세요.');
  if (t.uid === a.uid) return err('내 자신은 친구로 추가할 수 없어요.');
  const mine = { f: arr(a, 'friends'), i: arr(a, 'inc'), o: arr(a, 'out') }, theirs = { f: arr(t, 'friends'), i: arr(t, 'inc'), o: arr(t, 'out') };
  const link = () => { without(mine.i, t.uid); without(mine.o, t.uid); without(theirs.i, a.uid); without(theirs.o, a.uid); if (!mine.f.includes(t.uid)) mine.f.push(t.uid); if (!theirs.f.includes(a.uid)) theirs.f.push(a.uid); };
  if (op === 'add') {
    if (mine.f.includes(t.uid)) return err('이미 친구예요.');
    if (mine.o.includes(t.uid)) return err('이미 친구 요청을 보냈어요. 상대가 수락하면 친구가 돼요.');
    if (mine.f.length >= MAX_FRIENDS) return err(`친구는 ${MAX_FRIENDS}명까지 둘 수 있어요.`);
    if (mine.i.includes(t.uid)) { link(); ctx.notify(t.uid, { op: 'ping', what: 'accepted', name: a.name }); }        // 상대가 먼저 보낸 요청이 있으면 바로 친구
    else {
      if (theirs.i.length >= MAX_PENDING || mine.o.length >= MAX_PENDING) return err('요청이 너무 많이 쌓여 있어요. 잠시 뒤에 다시 해 주세요.');
      mine.o.push(t.uid); theirs.i.push(a.uid); ctx.notify(t.uid, { op: 'ping', what: 'request', name: a.name });
    }
  } else if (op === 'acc') {
    if (!mine.i.includes(t.uid)) return err('받은 요청이 없어요.');
    if (mine.f.length >= MAX_FRIENDS) return err(`친구는 ${MAX_FRIENDS}명까지 둘 수 있어요.`);
    link(); ctx.notify(t.uid, { op: 'ping', what: 'accepted', name: a.name });
  } else {                                                   // 친구 삭제 · 받은 요청 거절 · 보낸 요청 취소
    without(mine.f, t.uid); without(theirs.f, a.uid); without(mine.i, t.uid); without(theirs.o, a.uid); without(mine.o, t.uid); without(theirs.i, a.uid);
  }
  auth.saveSoon();
  return snapshot(a, ctx.isOnline);
}
module.exports = { handle, CHARS, fmtPid };
