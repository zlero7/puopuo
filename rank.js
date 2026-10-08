// 랭크전: 레이팅 저장(파일) · Glicko-2 계산 · 등급
// 플레이어는 브라우저가 만든 토큰으로 구분(계정·비밀번호 없음). 스타일(뿌요/테트리스)마다 레이팅이 따로 있음
const fs = require('fs');
const path = require('path');

const FILE = process.env.RANK_FILE || path.join(__dirname, 'data', 'ranks.json');
let db = {};                       // 'token:style' -> { name, style, r, rd, vol, w, l, at }
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch { db = {}; }

let saveTimer = null;
function save() {                  // 잠깐 모았다가 한 번에, 임시 파일에 쓰고 바꿔치기
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE + '.tmp', JSON.stringify(db));
      fs.renameSync(FILE + '.tmp', FILE);
    } catch (e) { console.error('랭크 저장 실패:', e.message); }
  }, 300);
}

const validToken = t => typeof t === 'string' && /^[A-Za-z0-9]{16,40}$/.test(t);
const STYLES = ['puyo', 'tetris'];
function get(token, style, name) {
  const k = `${token}:${style}`;
  if (!db[k]) db[k] = { name: name || '플레이어', style, r: 1500, rd: 350, vol: 0.06, w: 0, l: 0, at: Date.now() };
  if (name) db[k].name = String(name).slice(0, 10);
  return db[k];
}

/* ---------- Glicko-2 (한 경기 결과로 두 사람 갱신) ---------- */
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
  return { r: Math.round((muN * Q + 1500) * 10) / 10, rd: Math.max(30, Math.round(phiN * Q * 10) / 10), vol };
}
// 시리즈 결과 반영: winner·loser는 get()이 돌려준 기록
function report(winner, loser) {
  const a = glicko(winner, loser, 1), b = glicko(loser, winner, 0);
  const dw = Math.round(a.r - winner.r), dl = Math.round(b.r - loser.r);
  Object.assign(winner, a, { w: winner.w + 1, at: Date.now() });
  Object.assign(loser, b, { l: loser.l + 1, at: Date.now() });
  save();
  return [dw, dl];
}

const TIERS = [[2100, '마스터'], [1900, '다이아'], [1700, '플래티넘'], [1500, '골드'], [1300, '실버'], [0, '브론즈']];
const tierOf = r => TIERS.find(([m]) => r >= m)[1];
function top(style, n = 50) {
  return Object.values(db).filter(p => p.style === style && p.w + p.l > 0).sort((a, b) => b.r - a.r).slice(0, n)
    .map(p => ({ name: p.name, r: Math.round(p.r), w: p.w, l: p.l, tier: tierOf(p.r) }));
}
function me(token, style) {
  const p = db[`${token}:${style}`]; if (!p) return { r: 1500, rd: 350, w: 0, l: 0, tier: tierOf(1500), rank: null };
  const list = Object.values(db).filter(q => q.style === style && q.w + q.l > 0).sort((a, b) => b.r - a.r);
  const i = list.indexOf(p);
  return { r: Math.round(p.r), rd: Math.round(p.rd), w: p.w, l: p.l, tier: tierOf(p.r), rank: i >= 0 ? i + 1 : null };
}

module.exports = { validToken, STYLES, get, report, top, me, tierOf, glicko, flush: () => { clearTimeout(saveTimer); try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db)); } catch {} } };
