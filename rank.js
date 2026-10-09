// 랭크전: 연도 · 시즌 · 배치 · 티어(RP) · 숨은 실력 점수(MMR, Glicko-2) · 순위표 · 파일 저장
// 플레이어는 계정의 랭크 열쇠(accounts.js의 rk)로 구분. 스타일(뿌요/테트리스)마다 기록이 따로 있음
const fs = require('fs');
const path = require('path');

/* ================= 규칙 =================
   - 티어: 브론즈 1·2·3 → 실버 → 골드 → 플래티넘 → 다이아(각 1·2·3, 숫자가 클수록 높음) → 마스터
   - 세부 티어마다 100 RP. 'RP 누계' 하나로 관리(브론즈 1 0점 = 0, 다이아 3 99점 = 1499, 1500부터 마스터)
     이기면 그만큼 올라가고, 지면 잃은 만큼 그대로 내려감(아래 티어로 넘어가도 남은 점수 그대로)
   - 마스터는 세부 티어 없이 RP가 계속 쌓이고, 마스터끼리 RP 순 등수로 표시(마스터 #12)
   - 한 시리즈(2선승)마다 RP가 바뀜: 기본 ±20, 숨은 실력 점수에 비해 티어가 낮으면 더 얻고 덜 잃음(반대도). 10~35 사이
     2:0 승리는 +3, 1:2 패배는 3 덜 잃음. 승급 직후 한 시리즈는 져도 그 세부 티어 아래로 안 내려감(강등 보호)
   - 연도·시즌: 한 해에 시즌 6개(2달씩, 이름 '2026 시즌 5'). 연도가 바뀌면 숨은 실력 점수를 완전 초기화
   - 배치: 처음 하는 사람과 '그 해 첫 랭크전'은 10시리즈 → 숨은 실력 점수로 티어(최대 플래티넘 3, 25 RP에서 시작)
           같은 해 다음 시즌은 5시리즈 → 지난 시즌 끝 티어 그대로 시작하고 웬만하면 그대로.
           5전 4승 이상이고 숨은 실력이 확실히 높으면 +1칸(5전 전승에 차이가 아주 크면 +2칸), 1승 이하이고 확실히 낮으면 −1칸
     배치 중에는 결과를 가리고 마지막에 공개
   - 순위표: 플래티넘 이상만. 시즌이 바뀔 때 지난 시즌 순위표를 저장 */
const FILE = process.env.RANK_FILE || path.join(__dirname, 'data', 'ranks.json');
const DIV = 100, MASTER = 15 * DIV, BOARD_MIN = 9 * DIV, MATCH_LOG = 50, PAGE = 10;
const GROUPS = ['브론즈', '실버', '골드', '플래티넘', '다이아'];

// 시각(RANK_NOW로 바꿔 시험할 수 있음) → 시즌 번호(2026년 1~2월 = 1, 해마다 6개씩)
const now = () => +process.env.RANK_NOW || Date.now();
function seasonOf(t = now()) { const d = new Date(t); return (d.getFullYear() - 2026) * 6 + Math.floor(d.getMonth() / 2) + 1; }
const yearOf = s => 2026 + Math.floor((s - 1) / 6);
function seasonInfo(n = seasonOf()) {
  const y = yearOf(n), k = (n - 1) % 6, m0 = k * 2;
  const start = new Date(y, m0, 1).getTime(), end = new Date(y, m0 + 2, 1).getTime();
  return { n, year: y, name: `${y} 시즌 ${k + 1}`, months: `${m0 + 1}~${m0 + 2}월`, start, end, daysLeft: Math.max(0, Math.ceil((end - now()) / 86400000)) };
}

/* ---------- 저장 ---------- */
let db = { players: {}, boards: {}, cur: seasonOf() };
function blank(name, style) {
  const s = seasonOf();
  return { name: name || '플레이어', char: 'lumi', style, r: 1500, rd: 350, vol: 0.06, year: yearOf(s), season: s, yearPlaced: false,
    need: 10, placed: 0, pw: 0, pl: 0, start: 0, total: 0, peak: 0, shield: false, w: 0, l: 0, sw: 0, sl: 0, hist: [], matches: [], at: now() };
}
try {
  const v = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
  if (v.players) db = { boards: {}, cur: seasonOf(), ...v };
  for (const [key, p] of Object.entries(db.players)) {
    for (const [k, val] of Object.entries(blank(p.name, p.style))) if (p[k] === undefined) p[k] = val;   // 예전 형식에 빠진 값 채우기
    p.key = key;
  }
} catch { /* 처음 */ }
let saveTimer = null;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 300); };   // 잠깐 모았다가 한 번에
function flush() {
  clearTimeout(saveTimer);
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE + '.tmp', JSON.stringify(db));
    fs.renameSync(FILE + '.tmp', FILE);
  } catch (e) { console.error('랭크 저장 실패:', e.message); }
}
const validToken = t => typeof t === 'string' && /^[A-Za-z0-9]{16,40}$/.test(t);
const STYLES = ['puyo', 'tetris'];

/* ---------- 티어 ---------- */
// RP 누계 → { group(0~5), div(1~3), rp(그 칸 안 점수), label }
function tierOf(total) {
  if (total >= MASTER) return { group: 5, div: 0, rp: total - MASTER, label: '마스터' };
  const i = Math.max(0, Math.floor(total / DIV));
  return { group: Math.floor(i / 3), div: (i % 3) + 1, rp: total - i * DIV, label: `${GROUPS[Math.floor(i / 3)]} ${(i % 3) + 1}` };
}
// 숨은 실력 점수 → 그 실력에 맞는 RP 누계(브론즈 1 = 1000, 세부 티어마다 70, 마스터 = 2050)
const mmrToTotal = r => Math.max(0, Math.round((r - 1000) / 70 * DIV));
const doneThisSeason = p => p.placed >= p.need;

/* ---------- 시즌 넘김 ---------- */
// 시즌이 바뀌면 먼저 지난 시즌 순위표를 저장(플래티넘 이상, 스타일별)
function ensureSeason() {
  const cur = seasonOf();
  if (db.cur >= cur) return;
  const s = db.cur;
  db.boards[s] = {};
  for (const st of STYLES) db.boards[s][st] = boardRows(Object.values(db.players).filter(p => p.style === st && p.season === s && doneThisSeason(p) && p.total >= BOARD_MIN));
  db.cur = cur; save();
}
// 한 사람 기록을 지금 시즌으로: 지난 시즌 기록 남기기, 연도가 바뀌면 숨은 점수 초기화 + 10배치, 같은 해면 5배치
function roll(p) {
  ensureSeason();
  const cur = seasonOf(), y = yearOf(cur);
  if (p.season >= cur) return p;
  if (doneThisSeason(p)) {
    const b = db.boards[p.season] && db.boards[p.season][p.style], row = b && b.find(x => x.key === p.key);
    p.hist.unshift({ season: p.season, name: seasonInfo(p.season).name, peak: tierOf(p.peak).label, final: tierOf(p.total).label, finalRank: row && p.total >= MASTER ? row.place : null });
    p.hist = p.hist.slice(0, 12);
  }
  if (p.year !== y) {                                 // 새해: 완전 초기화
    Object.assign(p, { r: 1500, rd: 350, vol: 0.06, year: y, yearPlaced: false, total: 0, need: 10 });
  } else p.need = p.yearPlaced ? 5 : 10;             // 같은 해: 이미 배치를 끝냈으면 5배치
  Object.assign(p, { season: cur, placed: 0, pw: 0, pl: 0, sw: 0, sl: 0, shield: false, start: p.total, peak: p.need === 5 ? p.total : 0 });
  return p;
}
function get(token, style, name, char) {
  const k = `${token}:${style}`;
  if (!db.players[k]) db.players[k] = blank(name, style);
  const p = roll(db.players[k]);
  p.key = k;
  if (name) p.name = String(name).slice(0, 10);
  if (typeof char === 'string' && /^[a-z]{2,10}$/.test(char)) p.char = char;
  return p;
}
const live = () => Object.values(db.players).map(roll);
// 마스터 등수(이번 시즌 배치를 끝낸 마스터끼리 RP 순)
function masterRank(p) {
  const list = live().filter(q => q.style === p.style && q.season === p.season && doneThisSeason(q) && q.total >= MASTER).sort((a, b) => b.total - a.total);
  const i = list.indexOf(p); return i >= 0 ? i + 1 : null;
}

/* ---------- Glicko-2 (숨은 실력 점수) ---------- */
const Q = 173.7178, TAU = 0.5;
function glicko(p, o, s) {          // p: 나, o: 상대, s: 1 이김 · 0 짐 → 새 { r, rd, vol }
  const mu = (p.r - 1500) / Q, phi = p.rd / Q, muJ = (o.r - 1500) / Q, phiJ = o.rd / Q;
  const g = 1 / Math.sqrt(1 + 3 * phiJ * phiJ / (Math.PI * Math.PI));
  const E = 1 / (1 + Math.exp(-g * (mu - muJ)));
  const v = 1 / (g * g * E * (1 - E)), delta = v * g * (s - E);
  const a = Math.log(p.vol * p.vol), f = x => Math.exp(x) * (delta * delta - phi * phi - v - Math.exp(x)) / (2 * Math.pow(phi * phi + v + Math.exp(x), 2)) - (x - a) / (TAU * TAU);
  let A = a, B;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else { let k = 1; while (f(a - k * TAU) < 0) k++; B = a - k * TAU; }
  let fA = f(A), fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > 1e-6; i++) {
    const C = A + (A - B) * fA / (fB - fA), fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2;
    B = C; fB = fC;
  }
  const vol = Math.exp(A / 2), phiS = Math.sqrt(phi * phi + vol * vol);
  const phiN = 1 / Math.sqrt(1 / (phiS * phiS) + 1 / v), muN = mu + phiN * phiN * g * (s - E);
  return { r: muN * Q + 1500, rd: Math.max(30, phiN * Q), vol };
}

/* ---------- RP · 배치 ---------- */
function rpDelta(p, win, score) {   // 숨은 실력 점수에 비해 티어가 낮으면 이길 때 더, 질 때 덜
  const gap = (mmrToTotal(p.r) - p.total) / DIV;
  const adj = Math.max(-10, Math.min(12, gap * 4));
  let d = win ? 20 + adj : -(20 - adj);
  if (win && score && score[1] === 0) d += 3; if (!win && score && score[1] === 2 && score[0] === 1) d += 3;   // 2:0 승리 +3, 1:2 패배 3 덜 잃음
  const mag = Math.max(10, Math.min(35, Math.abs(Math.round(d))));
  return win ? mag : -mag;
}
// 배치 끝: 10배치는 숨은 실력 점수로, 5배치는 지난 티어에서 웬만하면 그대로
function place(p) {
  if (p.need === 10) return Math.floor(Math.min(mmrToTotal(p.r), 12 * DIV - 1) / DIV) * DIV + 25;
  const gap = mmrToTotal(p.r) - p.start;
  let shift = 0;
  if (p.pw >= 4 && gap >= 200) shift = p.pw === 5 && gap >= 400 ? 2 : 1;
  else if (p.pw <= 1 && gap <= -200) shift = -1;
  return Math.max(0, p.start + shift * DIV);
}
function labelOfRec(p) {            // 지금 보이는 티어 글자(배치 중이면 배치 진행)
  if (!doneThisSeason(p)) return `배치 ${p.placed}/${p.need}`;
  if (p.total >= MASTER) return `마스터 #${masterRank(p) || '-'}`;
  const t = tierOf(p.total); return `${t.label} · ${t.rp} RP`;
}
// 한 시리즈 결과 반영
function apply(p, o, oppView, win, score) {
  const before = p.total, wasPlacing = !doneThisSeason(p);
  const nr = glicko(p, o, win ? 1 : 0);
  p.r = nr.r; p.rd = nr.rd; p.vol = nr.vol;
  win ? (p.w++, p.sw++) : (p.l++, p.sl++);
  let d = 0, event = null;
  if (wasPlacing) {
    p.placed++; win ? p.pw++ : p.pl++;
    if (p.placed >= p.need) { p.total = place(p); p.peak = Math.max(p.peak, p.total); p.yearPlaced = true; event = 'placed'; d = p.need === 5 ? p.total - p.start : 0; }
  } else {
    d = rpDelta(p, win, score);
    const floor = Math.floor(before / DIV) * DIV;
    let t = Math.max(0, before + d);
    if (!win && p.shield && t < floor && before < MASTER) { t = floor; event = 'shield'; }   // 승급 직후 보호
    p.shield = false;
    if (before < MASTER && Math.floor(t / DIV) > Math.floor(before / DIV)) { event = t >= MASTER ? 'master' : 'promote'; p.shield = true; }
    else if (Math.floor(Math.min(t, MASTER) / DIV) < Math.floor(Math.min(before, MASTER) / DIV)) event = 'demote';
    p.total = t; d = t - before; p.peak = Math.max(p.peak, p.total);
  }
  p.at = now();
  const self = view(p);
  p.matches.unshift({ at: p.at, win, score, d: wasPlacing && event !== 'placed' ? null : d, event, placing: wasPlacing, after: labelOfRec(p), group: self.group, div: self.div, opp: oppView });
  p.matches = p.matches.slice(0, MATCH_LOG);
  return { d, event };
}
// 상대에게 보여 줄 '시리즈 직전' 내 모습
const brief = p => { const v = view(p); return { name: p.name, char: p.char, text: v.text, group: v.group, div: v.div }; };
function report(winner, loser, score) {        // score: [이긴 쪽 승수, 진 쪽 승수]
  const wo = { r: winner.r, rd: winner.rd }, lo = { r: loser.r, rd: loser.rd }, wb = brief(winner), lb = brief(loser);
  const a = apply(winner, lo, lb, true, score), b = apply(loser, wo, wb, false, [score[1], score[0]]);
  save();
  return [{ ...a, opp: lb }, { ...b, opp: wb }];
}

/* ---------- 보여 줄 정보 ---------- */
function view(p) {
  const placing = !doneThisSeason(p), t = tierOf(p.total), s = seasonInfo();
  const masterRk = !placing && p.total >= MASTER ? masterRank(p) : null;
  return { placing, placed: p.placed, need: p.need, pw: p.pw, pl: p.pl,
    label: placing ? '배치 중' : t.label, group: placing ? -1 : t.group, div: placing ? 0 : t.div, rp: placing ? 0 : t.rp, total: placing ? 0 : p.total,
    masterRank: masterRk, text: labelOfRec(p), sw: p.sw, sl: p.sl, w: p.w, l: p.l, peak: tierOf(p.peak).label, hist: p.hist, season: s };
}
function me(token, style) {
  const p = db.players[`${token}:${style}`];
  if (!p) { const b = blank('', style); return { ...view(b), matches: [] }; }
  roll(p);
  return { ...view(p), matches: p.matches.slice(0, 20) };
}
// 순위표 줄: 등수 · 티어 · RP · 캐릭터 · 이름 · 칭호(지난 시즌 최고 기록) · 이긴 시리즈 수
function boardRows(list) {
  return list.slice().sort((a, b) => b.total - a.total).map((p, i) => {
    const t = tierOf(p.total), h = p.hist && p.hist.find(x => x.season !== p.season);
    return { key: p.key, place: i + 1, name: p.name, char: p.char, group: t.group, div: t.div, rp: t.rp, total: p.total,
      label: p.total >= MASTER ? '마스터' : t.label, wins: p.sw, title: h ? `${h.name} ${h.finalRank ? `마스터 #${h.finalRank}` : h.peak}` : '' };
  });
}
// 순위표: 시즌(지난 시즌은 저장해 둔 것) · 플래티넘 이상 · 이름 검색 · 페이지
function top(style, season, page = 1, q = '', token = '') {
  ensureSeason();
  const cur = seasonOf(), s = season && season < cur ? season : cur;
  let rows = s === cur ? boardRows(live().filter(p => p.style === style && p.season === cur && doneThisSeason(p) && p.total >= BOARD_MIN))
    : ((db.boards[s] || {})[style] || []);
  const total = rows.length;
  if (q) rows = rows.filter(r => r.name.toLowerCase().includes(String(q).toLowerCase()));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE)), pg = Math.max(1, Math.min(pages, +page || 1));
  const seasons = [cur, ...Object.keys(db.boards).map(Number).filter(n => n < cur).sort((a, b) => b - a)].map(n => ({ n, name: seasonInfo(n).name }));
  return { season: seasonInfo(s), seasons, total, page: pg, pages, rows: rows.slice((pg - 1) * PAGE, pg * PAGE).map(({ key, ...r }) => ({ ...r, me: !!token && key === `${token}:${style}` })) };
}
// AI 상대(랭크전에 사람이 없을 때): 저장하지 않는 기록. 숨은 실력 점수·보이는 티어를 상대와 비슷하게
const BOT_CHARS = [['lumi', '루미'], ['toto', '토토'], ['pin', '핀'], ['moka', '모카'], ['byeol', '별이'], ['kuro', '쿠로'], ['somi', '솜이'], ['bolt', '볼트']];
function bot(p) {
  const [char, ko] = BOT_CHARS[Math.floor(Math.random() * BOT_CHARS.length)];
  const b = blank(`AI ${ko}`, p.style), r = p.r + (Math.random() - 0.5) * 80;
  const total = doneThisSeason(p) ? Math.max(0, Math.min(MASTER - 1, p.total + Math.round((Math.random() - 0.5) * 60))) : Math.min(MASTER - 1, mmrToTotal(r));
  Object.assign(b, { char, r, rd: 60, placed: b.need, yearPlaced: true, total, peak: total, bot: true });
  return b;
}
// AI 세기(0~1): 숨은 실력 점수 1000(브론즈 1) → 0, 2050(마스터) → 1
const botLevel = p => Math.max(0, Math.min(1.15, (p.r - 1000) / 1050));
// 브라우저 토큰으로 쌓인 기록을 계정 열쇠로 옮김(그 스타일 기록이 계정에 아직 없을 때만). 옮긴 스타일 수
function adopt(oldToken, newToken) {
  if (!validToken(oldToken) || !validToken(newToken) || oldToken === newToken) return 0;
  let n = 0;
  for (const st of STYLES) {
    const a = `${oldToken}:${st}`, b = `${newToken}:${st}`;
    if (!db.players[a] || db.players[b]) continue;
    db.players[b] = db.players[a]; db.players[b].key = b; delete db.players[a];
    for (const s of Object.values(db.boards)) for (const row of (s[st] || [])) if (row.key === a) row.key = b;
    n++;
  }
  if (n) save();
  return n;
}
const mmr = p => p.r;
const placing = p => !doneThisSeason(p);
const labelOf = v => v.text;

module.exports = { adopt, bot, botLevel, validToken, STYLES, get, report, top, me, view, labelOf, tierOf, glicko, mmr, placing, seasonInfo, seasonOf, flush, MASTER, BOARD_MIN };
