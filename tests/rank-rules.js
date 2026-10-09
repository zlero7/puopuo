// 랭크 규칙 테스트(서버 없이 rank.js 직접)
// 티어 이름 · 10배치 · 잃은 만큼 내려가기 · 승급 보호 · 마스터 등수 · 같은 해 5배치(거의 그대로) · 새해 완전 초기화 · 순위표
// 실행: node tests/rank-rules.js
const os = require('os'), path = require('path'), fs = require('fs');
process.env.RANK_FILE = path.join(os.tmpdir(), `rank-rules-${process.pid}.json`);
const at = (y, m) => { process.env.RANK_NOW = String(new Date(y, m - 1, 10).getTime()); };
at(2026, 9);                                                 // 2026년 9월 = 2026 시즌 5
const R = require('../rank.js');
let fail = 0; const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fail++; };
const tok = i => 'tok' + String(i).padStart(14, '0');
const set = (p, o) => Object.assign(p, { placed: p.need, yearPlaced: true, ...o });

ok(R.tierOf(0).label === '브론즈 1' && R.tierOf(250).label === '브론즈 3' && R.tierOf(300).label === '실버 1' && R.tierOf(1499).label === '다이아 3' && R.tierOf(1500).label === '마스터', '티어 순서: 브론즈 1 < … < 다이아 3 < 마스터');
ok(R.seasonInfo().name === '2026 시즌 5' && R.seasonInfo().months === '9~10월', '시즌 이름: 2026 시즌 5 (9~10월)');

// 생배 10시리즈
const a = R.get(tok(1), 'puyo', 'A', 'kuro'), b = R.get(tok(2), 'puyo', 'B');
for (let i = 0; i < 9; i++) R.report(a, b, [2, 0]);
ok(R.view(a).text === '배치 9/10' && a.matches[0].d === null, '생배: 배치 중에는 결과를 가리고 배치 9/10');
const [ra] = R.report(a, b, [2, 1]);
ok(ra.event === 'placed' && R.view(a).rp === 25 && a.total <= 1199, `생배 10승 → ${R.view(a).text} (최대 플래티넘 3)`);
ok(ra.opp.name === 'B' && a.matches[0].opp.text.startsWith('배치'), '경기 기록에 상대 이름·당시 티어');

// 잃은 만큼 내려가기 · 보호 · 마스터
const c = R.get(tok(3), 'puyo', 'C'); set(c, { total: 310, r: 1000, rd: 60 });
const [, rc] = R.report(a, c, [2, 0]);
ok(R.tierOf(c.total).label === '브론즈 3' && c.total === 310 + rc.d, `잃은 만큼: 실버 1 · 10 RP ${rc.d} → ${R.view(c).text}`);
const d = R.get(tok(4), 'puyo', 'D'); set(d, { total: 395, r: 1700, rd: 60 });
const e = R.get(tok(5), 'puyo', 'E'); set(e, { total: 400, r: 1500, rd: 60 });
const [rd1] = R.report(d, e, [2, 0]);
ok(rd1.event === 'promote', `승급: → ${R.view(d).text}`);
d.total = 405; const [, rd2] = R.report(e, d, [2, 0]);
ok(rd2.event === 'shield' && d.total === 400, '승급 직후 패배는 0 RP에서 멈춤(강등 보호)');
const m1 = R.get(tok(6), 'puyo', 'M1', 'lumi'), m2 = R.get(tok(7), 'puyo', 'M2', 'pin');
set(m1, { total: 1620 }); set(m2, { total: 1580 });
ok(R.view(m1).text === '마스터 #1' && R.view(m2).text === '마스터 #2', '마스터 등수 표시');

// 순위표: 플래티넘 이상만, 검색, 페이지
const tp = R.top('puyo');
ok(tp.rows.every(r => r.total >= R.BOARD_MIN) && tp.rows[0].name === 'M1' && tp.rows[0].char === 'lumi', `순위표는 플래티넘 이상만(${tp.total}명): 1위 ${tp.rows[0].name}`);
for (let i = 0; i < 25; i++) set(R.get(tok(100 + i), 'puyo', 'P' + i), { total: 900 + i * 20 });
const t2 = R.top('puyo', 0, 2), t3 = R.top('puyo', 0, 1, 'P1');
ok(t2.page === 2 && t2.rows.length === 10 && t2.pages === Math.ceil(t2.total / 10), `페이지: ${t2.page}/${t2.pages}`);
ok(t3.rows.every(r => r.name.includes('P1')) && t3.rows.length > 1, `이름 검색 P1: ${t3.rows.length}명`);

// 같은 해 다음 시즌: 5배치, 티어 그대로
const g = R.get(tok(8), 'puyo', 'G'); set(g, { total: 850, peak: 870, r: 1560, rd: 60 });   // 골드 3 · 50, 숨은 실력은 비슷
const f = R.get(tok(9), 'puyo', 'F'); set(f, { total: 850, r: 1560, rd: 60 });
at(2026, 11);                                                // 2026 시즌 6
const g2 = R.get(tok(8), 'puyo'), f2 = R.get(tok(9), 'puyo');
ok(g2.need === 5 && R.view(g2).text === '배치 0/5' && g2.hist[0].final === '골드 3', '같은 해 다음 시즌: 5배치, 지난 시즌 기록 남김');
for (let i = 0; i < 4; i++) R.report(g2, f2, [2, 1]); R.report(f2, g2, [2, 1]);   // 4승 1패
ok(R.view(g2).text === '골드 3 · 50 RP', `5배치 4승 1패, 실력 차이 크지 않음 → 그대로 ${R.view(g2).text}`);
ok(R.view(f2).text === '골드 3 · 50 RP', `5배치 1승 4패, 실력 차이 크지 않음 → 그대로 ${R.view(f2).text}`);
const top5 = R.top('puyo', 5);
ok(top5.season.name === '2026 시즌 5' && top5.rows[0].name === 'M1' && top5.seasons.some(s => s.n === 5), '지난 시즌(시즌 5) 순위표 저장·조회');
// 압도적이면 +1칸
const h = R.get(tok(10), 'puyo', 'H'); Object.assign(h, { need: 5, placed: 0, start: 600, total: 600, r: 1900, rd: 60, yearPlaced: true, season: R.seasonOf() });
const hf = R.get(tok(11), 'puyo', 'HF'); set(hf, { total: 600, r: 1400, rd: 60 });
for (let i = 0; i < 5; i++) R.report(h, hf, [2, 0]);
ok(R.view(h).text === '골드 3 · 0 RP' || R.view(h).text.startsWith('플래티넘'), `5배치 전승 + 실력이 훨씬 높음 → ${R.view(h).text}(골드 1에서 위로)`);

// 새해: 완전 초기화, 그 해 첫 랭크전은 시즌 4라도 10배치
at(2027, 7);                                                 // 2027 시즌 4
const g3 = R.get(tok(8), 'puyo');
ok(g3.need === 10 && g3.r === 1500 && g3.rd === 350 && g3.total === 0 && R.view(g3).text === '배치 0/10', '새해(2027 시즌 4에 처음): 숨은 점수 완전 초기화, 10배치');

// 브라우저 토큰 기록을 계정 열쇠로 옮기기(계정에 그 스타일 기록이 없을 때만)
const old = R.get(tok(20), 'tetris', 'O'); R.report(old, R.get(tok(21), 'tetris'), [2, 0]);
ok(R.adopt(tok(20), tok(22)) === 1 && R.me(tok(22), 'tetris').w === 1 && R.me(tok(20), 'tetris').w === 0, '토큰 기록을 계정으로 옮김');
R.get(tok(23), 'tetris'); R.get(tok(24), 'tetris');
ok(R.adopt(tok(23), tok(24)) === 0, '계정에 이미 기록이 있으면 덮어쓰지 않음');
R.flush(); try { fs.unlinkSync(process.env.RANK_FILE); } catch {}
console.log(fail ? `\n${fail}개 실패` : '\n모두 통과'); process.exitCode = fail ? 1 : 0;
