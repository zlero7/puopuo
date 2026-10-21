// 친구 · 프로필(남의 전적 보기): 웹소켓으로 로그인한 사람만. 친구는 서로 받아야 되는 방식(요청 → 수락)
// - 남에게 보이는 것은 친구 코드(pid) · 닉네임 · 대표 캐릭터 · 랭크 전적뿐. 로그인 아이디는 절대 내보내지 않음
'use strict';
const auth = require('./auth');
const rank = require('./rank');

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

// m: 클라이언트가 보낸 메시지, ctx: { isOnline(uid), notify(uid, msg) } → 돌려줄 메시지(없으면 null)
function handle(a, m, ctx) {
  const op = typeof m.op === 'string' ? m.op : '';
  if (op === 'list') return snapshot(a, ctx.isOnline);
  if (op === 'char') {
    if (!CHARS.includes(m.char)) return err('캐릭터를 알 수 없어요.');
    if (a.char !== m.char) { a.char = m.char; auth.saveSoon(); }
    return null;
  }
  const t = auth.byPid(m.pid);
  if (op === 'prof') {
    if (!t) return err('그런 플레이어를 찾을 수 없어요.');
    const st = rank.STYLES.includes(m.sty) ? m.sty : 'puyo';
    return { op: 'prof', style: st, rel: relation(a, t), user: { ...card(t, ctx.isOnline), since: t.created }, profile: rank.profile(t.uid, st), other: rank.profile(t.uid, st === 'puyo' ? 'tetris' : 'puyo') };
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
