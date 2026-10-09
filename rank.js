// 랭크전: 시즌 · 배치 · 티어(RP) · 숨은 실력 점수(MMR, Glicko-2) · 파일 저장
// 플레이어는 브라우저가 만든 토큰으로 구분(계정·비밀번호 없음). 스타일(뿌요/테트리스)마다 기록이 따로 있음
const fs = require('fs');
const path = require('path');

/* ================= 규칙 =================
   - 티어: 브론즈 1·2·3 → 실버 1·2·3 → 골드 → 플래티넘 → 다이아(각 1·2·3, 숫자가 클수록 높음) → 마스터
   - 세부 티어마다 100 RP. 'RP 누계' 하나로 관리(브론즈 1 0점 = 0, 다이아 3 99점 = 1499, 1500부터 마스터)
     이기면 그만큼 올라가고, 지면 잃은 만큼 그대로 내려감(아래 티어로 넘어가도 남은 점수 그대로)
   - 마스터는 세부 티어 없이 RP가 계속 쌓이고, 마스터끼리 RP 순 등수로 표시(마스터 #12)
   - 한 시리즈(2선승)마다 RP가 바뀜: 기본 ±20, 숨은 실력 점수에 비해 티어가 낮으면 더 얻고 덜 잃음(반대도). 10~35 사이
     2:0 승리는 +3, 1:2 패배는 3 덜 잃음
   - 승급 직후 한 시리즈는 져도 그 세부 티어 아래로 내려가지 않음(강등 보호)
   - 배치: 시즌마다 처음 10시리즈. 끝나면 숨은 실력 점수로 티어를 정함
     첫 시즌은 숨은 실력 점수로 정하되 최대 플래티넘 3, 다음 시즌부터는 '지난 티어 − 3칸'에서 배치 성적에 따라 ±3칸
   - 시즌: 2달(1~2월, 3~4월 …). 바뀌면 티어 3칸 하락, 숨은 실력 점수는 1500 쪽으로 20% 당기고 다시 배치 */
const FILE = process.env.RANK_FILE || path.join(__dirname, 'data', 'ranks.json');
const PLACEMENTS = 10, DIV = 100, MASTER = 15 * DIV, SEASON_DROP = 3 * DIV;
const GROUPS = ['브론즈', '실버', '골드', '플래티넘', '다이아'];

// 시즌 번호: 2달 단위(1~2월 = 1, 3~4월 = 2 …, 해마다 6개). RANK_NOW(ms)로 시각을 바꿔 시험할 수 있음
const now = () => +process.env.RANK_NOW || Date.now();
function seasonOf(t = now()) { const d = new Date(t); return (d.getFullYear() - 2026) * 6 + Math.floor(d.getMonth() / 2) + 1; }
function seasonInfo(n = seasonOf()) {
  const y = 2026 + Math.floor((n - 1) / 6), m0 = ((n - 1) % 6) * 2;
  const start = new Date(y, m0, 1).getTime(), end = new Date(y, m0 + 2, 1).getTime();
  return { n, name: `${y} 시즌 ${((n - 1) % 6) + 1}`, months: `${m0 + 1}~${m0 + 2}월`, start, end, daysLeft: Math.max(0, Math.ceil((end - now()) / 86400000)) };
}

let db = { players: {} };
try {
  const v = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
  if (v.players) db = v;
  else for (const [k, o] of Object.entries(v)) db.players[k] = { ...blank(o.name, o.style), r: o.r || 1500, rd: Math.max(150, o.rd || 350), w: o.w || 0, l: o.l || 0 };   // 예전 형식(레이팅만) 옮기기
} catch { db = { players: {} }; }
let saveTimer = null;
function save() {                  // 잠깐 모았다가 한 번에, 임시 파일에 쓰고 바꿔치기
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
}
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

/* ---------- 티어 표시 ---------- */
// RP 누계 → { group(0~5), div(1~3), rp(그 칸 안 점수), label }
function tierOf(total) {
  if (total >= MASTER) return { group: 5, div: 0, rp: total - MASTER, label: '마스터' };
  const i = Math.max(0, Math.floor(total / DIV));
  return { group: Math.floor(i / 3), div: (i % 3) + 1, rp: total - i * DIV, label: `${GROUPS[Math.floor(i / 3)]} ${(i % 3) + 1}` };
}
// 숨은 실력 점수 → 그 실력에 맞는 RP 누계(브론즈 1 = 1000, 세부 티어마다 70, 마스터 = 2050)
const mmrToTotal = r => Math.max(0, Math.round((r - 1000) / 70 * DIV));

/* ---------- 기록 ---------- */
function blank(name, style) {
  return { name: name || '플레이어', style, r: 1500, rd: 350, vol: 0.06, total: 0, season: seasonOf(), placed: 0, pw: 0, pl: 0,
    anchor: null, shield: false, w: 0, l: 0, sw: 0, sl: 0, peak: 0, hist: [], at: now() };
}
// 시즌이 바뀌었으면 정리: 기록 남기고, 티어 3칸 하락, 숨은 점수 절반 되돌림, 다시 배치
function rollSeason(p) {
  const cur = seasonOf();
  if (p.season >= cur) return p;
  if (p.placed >= PLACEMENTS) {
    p.hist.unshift({ season: p.season, name: seasonInfo(p.season).name, peak: tierOf(p.peak).label, final: tierOf(p.total).label, finalRank: p.total >= MASTER ? masterRank(p) : null });
    p.hist = p.hist.slice(0, 12);
    p.anchor = Math.max(0, p.total - SEASON_DROP);
  }
  p.r = 1500 + (p.r - 1500) * 0.8; p.rd = Math.max(p.rd, 120);    // 숨은 점수는 조금만 되돌리고, 불확실도를 키워 다시 빨리 움직이게
  p.season = cur; p.placed = 0; p.pw = 0; p.pl = 0; p.sw = 0; p.sl = 0; p.shield = false;
  p.total = p.anchor || 0; p.peak = p.total;
  return p;
}
function get(token, style, name) {
  const k = `${token}:${style}`;
  if (!db.players[k]) db.players[k] = blank(name, style);
  const p = rollSeason(db.players[k]);
  if (name) p.name = String(name).slice(0, 10);
  return p;
}
const placedNow = p => p.season === seasonOf() && p.placed >= PLACEMENTS;
// 마스터 등수(이번 시즌 배치를 끝낸 마스터끼리 RP 순)
function masterRank(p) {
  const list = Object.values(db.players).filter(q => q.style === p.style && q.season === p.season && q.placed >= PLACEMENTS && q.total >= MASTER).sort((a, b) => b.total - a.total);
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

/* ---------- RP 계산 ---------- */
// 이번 시리즈로 바뀔 RP: 숨은 실력 점수에 비해 티어가 낮으면 이길 때 더, 질 때 덜
function rpDelta(p, win, score) {
  const gap = (mmrToTotal(p.r) - p.total) / DIV;                     // +면 실력보다 티어가 낮음
  const adj = Math.max(-10, Math.min(12, gap * 4));
  let d = win ? 20 + adj : -(20 - adj);
  const close = score && Math.min(...score) === 1, sweep = score && Math.min(...score) === 0;
  if (win && sweep) d += 3; if (!win && close) d += 3;               // 2:0 승리 +3, 1:2 패배 3 덜 잃음
  const mag = Math.max(10, Math.min(35, Math.abs(Math.round(d))));
  return win ? mag : -mag;
}
// 배치 끝: 숨은 실력 점수로 티어 정하기
function place(p) {
  let t = mmrToTotal(p.r);
  if (p.anchor == null) t = Math.floor(Math.min(t, 12 * DIV - 1) / DIV) * DIV + 25;   // 첫 시즌: 최대 플래티넘 3, 배정된 세부 티어 25 RP에서 시작
  else t = p.anchor + Math.round((p.pw - p.pl) / PLACEMENTS * SEASON_DROP);   // 다음 시즌: '지난 티어 − 3칸' 기준, 배치 성적으로 ±3칸(10승 +3칸 · 5승 5패 그대로 · 10패 −3칸)
  return Math.max(0, t);
}
// 한 시리즈 결과 반영. 돌려주는 값: 결과 창에 보낼 내용
function apply(p, o, win, score) {
  const before = p.total, wasPlacing = !placedNow(p);
  const nr = glicko(p, o, win ? 1 : 0);
  p.r = nr.r; p.rd = nr.rd; p.vol = nr.vol;
  win ? (p.w++, p.sw++) : (p.l++, p.sl++);
  let d = 0, event = null;
  if (wasPlacing) {
    p.placed++; win ? p.pw++ : p.pl++;
    if (p.placed >= PLACEMENTS) { p.total = place(p); p.peak = Math.max(p.peak, p.total); event = 'placed'; }
  } else {
    d = rpDelta(p, win, score);
    const floor = Math.floor(before / DIV) * DIV;
    let t = Math.max(0, before + d);
    if (!win && p.shield && t < floor) { t = floor; event = 'shield'; }    // 승급 직후 보호
    p.shield = false;
    if (before < MASTER && Math.floor(t / DIV) > Math.floor(before / DIV)) { event = t >= MASTER ? 'master' : 'promote'; p.shield = true; }
    else if (Math.floor(Math.min(t, MASTER) / DIV) < Math.floor(Math.min(before, MASTER) / DIV)) event = 'demote';
    p.total = t; d = t - before; p.peak = Math.max(p.peak, p.total);
  }
  p.at = now();
  return { d, event };
}
function report(winner, loser, score) {        // score: [이긴 쪽 승수, 진 쪽 승수]
  const wo = { r: winner.r, rd: winner.rd }, lo = { r: loser.r, rd: loser.rd };
  const a = apply(winner, lo, true, score), b = apply(loser, wo, false, score);
  save();
  return [a, b];
}

/* ---------- 보여 줄 정보 ---------- */
function view(p) {
  const placing = !placedNow(p), t = tierOf(p.total), s = seasonInfo();
  return { placing, placed: p.season === seasonOf() ? p.placed : 0, pw: p.pw, pl: p.pl, need: PLACEMENTS,
    label: placing ? '배치 중' : t.label, group: placing ? -1 : t.group, div: t.div, rp: t.rp, total: p.total,
    masterRank: !placing && p.total >= MASTER ? masterRank(p) : null, sw: p.sw, sl: p.sl, w: p.w, l: p.l,
    peak: tierOf(p.peak).label, hist: p.hist, season: s };
}
const labelOf = v => v.placing ? `배치 ${v.placed}/${v.need}` : v.masterRank ? `마스터 #${v.masterRank}` : `${v.label} · ${v.rp} RP`;
function me(token, style) {
  const p = db.players[`${token}:${style}`];
  const v = view(p ? rollSeason(p) : blank('', style));
  return { ...v, text: labelOf(v) };
}
function top(style, n = 50) {
  const cur = seasonOf();
  return Object.values(db.players).map(rollSeason).filter(p => p.style === style && p.season === cur && p.placed >= PLACEMENTS)
    .sort((a, b) => b.total - a.total).slice(0, n)
    .map((p, i) => { const v = view(p); return { name: p.name, text: labelOf(v), group: v.group, rp: v.rp, total: p.total, sw: p.sw, sl: p.sl, place: i + 1 }; });
}
// 매칭용 숨은 실력 점수(배치 중이면 범위를 넓게)
const mmr = p => p.r;
const placing = p => !placedNow(p);

module.exports = { validToken, STYLES, get, report, top, me, view, labelOf, tierOf, glicko, mmr, placing, seasonInfo, flush, PLACEMENTS, MASTER };
