// 오리지널 캐릭터
'use strict';

/* ================= 캐릭터 =================
   - 모두 이 게임만의 오리지널 캐릭터. 그림은 img/chars_*.webp(카드 · 얼굴 · 마스코트 아이콘), 불러오기 전에는 캔버스로 그린 간단한 모양
   - 사람 플레이어에게는 모양(초상·컷인 대사·목소리 음높이)만 바뀌고 실력 차이는 없음
   - CPU로 나올 때는 성격(ai)에 따라 플레이 방식이 달라짐 */
const CHARS = [
  { id: 'lumi', name: '루미', col: '#ff5a70', d: '#b01830', ears: 'bow', voice: 660, ai: {},
    desc: '밝고 씩씩한 연습생. 무엇이든 균형 있게 해.', lines: ['간다!', '하나 더!', '좋았어!', '최고 연쇄!'], win: '오늘도 내가 이겼다!', lose: '다음엔 안 질 거야!' },
  { id: 'toto', name: '토토', col: '#5aa8ff', d: '#1747b0', ears: 'shell', voice: 330, ai: { pot: 1.5, delay: 1.3, greedy: 0 },
    desc: '느긋한 거북이. 천천히 크게 쌓아서 한 번에 터뜨려.', lines: ['느긋하게…', '쌓였다…', '이제다!', '대연쇄다!'], win: '천천히 가도 이긴다네.', lose: '서두를 걸 그랬나…' },
  { id: 'pin', name: '핀', col: '#58e27c', d: '#1a8027', ears: 'frog', voice: 880, ai: { greedy: 1, pot: 0.2, delay: 0.8 },
    desc: '성질 급한 개구리. 작은 연쇄를 쉬지 않고 날려.', lines: ['개굴!', '빨리빨리!', '또 간다!', '개굴개굴!'], win: '역시 속도가 최고지!', lose: '개굴… 너무 빨랐나.' },
  { id: 'moka', name: '모카', col: '#c9905a', d: '#7a4c00', ears: 'bear', voice: 260, ai: { atk: 0.9, miss: 0.5 },
    desc: '듬직한 곰. 실수가 적고 받아치기를 잘해.', lines: ['흠.', '받아라.', '으랏차!', '곰의 힘이다!'], win: '든든하게 이겼군.', lose: '흐음… 졌다.' },
  { id: 'byeol', name: '별이', col: '#ffdc3a', d: '#d08a00', ears: 'star', voice: 990, ai: { tspin: 1.4 },
    desc: '반짝이는 별 요정. 테트리스로는 T스핀을 노려.', lines: ['반짝!', '반짝반짝!', '별빛 연쇄!', '슈팅스타!'], win: '오늘 밤도 반짝반짝!', lose: '별이 졌어…' },
  { id: 'kuro', name: '쿠로', col: '#c47dff', d: '#5e2399', ears: 'cat', voice: 520, ai: { look: true, tspin: 1.1, delay: 0.85 },
    desc: '도도한 고양이. 다음 수까지 내다보는 계산파.', lines: ['냥.', '계산대로야.', '냐앙!', '완벽해.'], win: '당연한 결과다냥.', lose: '…계산이 틀렸다냥.' },
  { id: 'somi', name: '솜이', col: '#ffa3d1', d: '#c2408a', ears: 'wool', voice: 740, ai: { noise: 1.6 },
    desc: '폭신한 양. 기분 따라 플레이가 바뀌어서 종잡을 수 없어.', lines: ['메에~', '폭신폭신!', '메에에!', '구름 연쇄~'], win: '메에~ 이겼다!', lose: '메에… 졸려.' },
  { id: 'bolt', name: '볼트', col: '#ff9a3d', d: '#c75a00', ears: 'antenna', voice: 420, ai: { delay: 0.6, miss: 1.8 },
    desc: '번쩍이는 로봇. 손은 엄청 빠르지만 가끔 오작동해.', lines: ['삐빅!', '가속!', '출력 최대!', '오버드라이브!'], win: '승리 확인. 삐빅.', lose: '오류… 재부팅 중…' },
];
const charOf = id => CHARS.find(c => c.id === id) || CHARS[0];
// CPU 성격 반영: 기본 난이도 값에 곱하기/덮어쓰기
function charAi(base, ch, kind) {
  const a = { ...base }, m = ch.ai || {};
  if (m.delay) a.delay = Math.round(a.delay * m.delay);
  if (m.miss != null && a.miss != null) a.miss = Math.min(0.5, a.miss * m.miss);
  if (m.noise && a.noise != null) a.noise *= m.noise;
  if (kind === 'puyo') { if (m.pot != null) a.pot = (a.pot || 0) * m.pot + (m.pot > 1 ? 0.2 : 0); if (m.greedy != null) a.greedy = m.greedy; }
  if (kind === 'tetris') { if (m.tspin) a.tspin = Math.min(1.5, (a.tspin || 0.3) * m.tspin + 0.2); if (m.look) a.look = true; }
  if (m.atk) a.atk = Math.min(0.95, a.atk + (m.atk - 0.6) * 0.3);
  return a;
}

/* ---------- 캐릭터 그림 ----------
   img/chars_card.webp: 카드(일러스트 + 이름·소개 + 표정) 600×708 · chars_bust.webp: 얼굴·상반신 320×320 · chars_icon.webp: 마스코트(배경 투명) 256×256
   chars_vs.webp: 대전 초상(배경 포함 상반신) 480×352 · 모두 CHARS 순서대로 가로 한 줄 */
const CHAR_IMG = typeof Image === 'function' ? { card: new Image(), bust: new Image(), icon: new Image(), face: new Image(), vs: new Image() } : null;
const CHAR_CELL = { card: [600, 708], bust: [320, 320], icon: [256, 256], vs: [480, 352] };   // AI 업스케일(2배)한 그림 기준 칸 크기
// 그림은 처음 필요할 때 불러옴(시작이 빨라지고 안 쓰는 화면의 그림은 받지 않음). 작은 것(아이콘·상반신·표정)은 바로 시작
const CHAR_LOAD = {};
function loadCharImg(k) {
  if (!CHAR_IMG || CHAR_LOAD[k]) return; CHAR_LOAD[k] = true;
  CHAR_IMG[k].onload = () => onArtImage();
  CHAR_IMG[k].src = `img/chars_${k}.webp?v=3`;   // 그림을 바꾸면 v를 올려 캐시를 새로 받게
}
if (CHAR_IMG) ['icon', 'bust', 'face'].forEach(loadCharImg);
const charImgOk = k => { if (!CHAR_IMG) return false; loadCharImg(k); return CHAR_IMG[k].complete && CHAR_IMG[k].naturalWidth; };
// 그림 한 칸을 (x, y, w, h) 안에 비율 그대로(가운데)
function charImg(c, k, id, x, y, w, h) {
  const i = Math.max(0, CHARS.findIndex(ch => ch.id === id)), [cw, chh] = CHAR_CELL[k], s = Math.min(w / cw, h / chh);
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';          // 큰 그림을 줄여 그릴 때 계단·깨짐이 없게
  c.drawImage(CHAR_IMG[k], i * cw, 0, cw, chh, x + (w - cw * s) / 2, y + (h - chh * s) / 2, cw * s, chh * s);
}
// 표정(img/chars_face.webp): 캐릭터마다 한 줄에 4칸(192×192, 카드 테두리 조각은 잘라 냄) — 0 기본 · 1 신남 · 2 아주 기쁨(승리) · 3 걱정(위험·패배)
const FACE = { calm: 0, hype: 1, joy: 2, worry: 3 };
function drawCharFace(c, id, x, y, size, expr = 0) {
  if (!charImgOk('face')) { drawChar(c, id, x, y, size, expr === 3 ? 'sad' : 'happy'); return; }
  const ch = charOf(id), i = Math.max(0, CHARS.findIndex(q => q.id === ch.id)), h = size / 2, r = size * 0.2;
  c.save(); c.beginPath(); rr(c, x - h, y - h, size, size, r); c.fillStyle = '#fff'; c.fill(); c.clip();
  c.imageSmoothingQuality = 'high'; c.drawImage(CHAR_IMG.face, expr * 192, i * 192, 192, 192, x - h, y - h, size, size); c.restore();
  c.save(); c.lineWidth = Math.max(2, size * 0.06); c.strokeStyle = '#fff'; c.beginPath(); rr(c, x - h, y - h, size, size, r); c.stroke();
  c.lineWidth = Math.max(1, size * 0.03); c.strokeStyle = ch.d; c.stroke(); c.restore();
}
// 지금 판 상황에 맞는 표정: 끝나면 이긴 쪽 아주 기쁨 · 진 쪽 걱정, 연쇄 중엔 신남, 방해가 많이 쌓였거나 위험하면 걱정
function moodOf(f) {
  if (game.state === 'over') return f.won ? FACE.joy : f.dead ? FACE.worry : FACE.calm;
  if (f.dead) return FACE.worry;
  if (f.cut || (f.chain || 0) >= 2) return FACE.hype;
  if (f.pending >= 12 || f.dangerOn) return FACE.worry;
  const g = f.grid, top = g ? g.findIndex(row => row.some(v => v)) : -1;          // 판이 위쪽까지 차면 걱정
  if (top >= 0 && top <= (f.kind === 'puyo' ? 3 : 6)) return FACE.worry;
  return FACE.calm;
}
// 대전 초상(세로 폰에서 상대): 상반신 그림 + 지금 표정 · 이름 띠. 연쇄 중엔 금빛으로 들썩, 위험하면 빨갛게 떨림, 지면 흑백
function drawVsPortrait(c, f, x, y, w, h, t) {
  const ch = charOf(f.char || 'lumi'), i = Math.max(0, CHARS.findIndex(q => q.id === ch.id)), mood = moodOf(f);
  const lost = game.state === 'over' ? !f.won : f.dead, won = game.state === 'over' && f.won;
  const hype = !lost && mood === FACE.hype, worry = !lost && mood === FACE.worry, k = Math.min(14, w * 0.08);
  const poly = (x, y, w, h, k) => { c.beginPath(); c.moveTo(x + k, y); c.lineTo(x + w, y); c.lineTo(x + w - k, y + h); c.lineTo(x, y + h); c.closePath(); };
  c.save();
  if (worry) c.translate(Math.sin(t / 28) * 1.6, Math.cos(t / 37) * 0.8);
  c.fillStyle = 'rgba(0,0,0,0.18)'; poly(x, y + 6, w, h, k); c.fill();
  const edge = hype || won ? '#ffb000' : worry && Math.sin(t / 110) > 0 ? '#e8283c' : ch.d;
  c.fillStyle = edge; poly(x, y, w, h, k); c.fill();
  c.fillStyle = '#fff'; poly(x + 4, y + 4, w - 8, h - 8, k * 0.9); c.fill();
  c.save(); poly(x + 7, y + 7, w - 14, h - 14, k * 0.85); c.clip();
  const ix = x + 7, iy = y + 7, iw = w - 14, ih = h - 14;
  if (charImgOk('vs')) {
    const z = hype ? 1.06 + Math.sin(t / 90) * 0.02 : 1, sh = Math.min(352, 480 * ih / iw) / z, sw = sh * iw / ih;   // 비율 그대로 잘라서
    if (lost) c.filter = 'grayscale(1) brightness(0.8)';
    c.imageSmoothingQuality = 'high';
    c.drawImage(CHAR_IMG.vs, i * 480 + (480 - sw) / 2, (352 - sh) * 0.35, sw, sh, ix, iy, iw, ih);
    c.filter = 'none';
  } else { c.fillStyle = ch.c; c.fillRect(ix, iy, iw, ih); drawChar(c, ch.id, ix + iw / 2, iy + ih / 2, ih * 0.9); }
  if (hype) {                                   // 연쇄: 금빛 집중선
    c.save(); c.globalAlpha = 0.5; c.strokeStyle = '#fff6b0'; c.lineWidth = 2;
    for (let a = 0; a < 14; a++) { const r = a / 14 * Math.PI * 2 + t / 400, cx = ix + iw / 2, cy = iy + ih / 2; c.beginPath(); c.moveTo(cx + Math.cos(r) * iw * 0.42, cy + Math.sin(r) * ih * 0.5); c.lineTo(cx + Math.cos(r) * iw, cy + Math.sin(r) * iw); c.stroke(); }
    c.restore();
  }
  if (worry) { c.fillStyle = `rgba(232,40,60,${0.16 + 0.1 * Math.sin(t / 110)})`; c.fillRect(ix, iy, iw, ih); }
  const g = c.createLinearGradient(0, iy + ih * 0.55, 0, iy + ih); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,16,50,0.55)');
  c.fillStyle = g; c.fillRect(ix, iy, iw, ih);
  c.restore();
  // 이름 띠(비스듬히) · 표정 배지
  c.save(); c.translate(x + w * 0.4, y + h - 12); c.rotate(-0.06);
  const nw = Math.min(w * 0.78, 20 + f.name.length * 15);
  c.fillStyle = ch.d; poly(-nw / 2 - 3, -14, nw + 6, 28, 8); c.fill();
  c.fillStyle = ch.c; poly(-nw / 2, -11, nw, 22, 7); c.fill();
  outlined(c, f.name, 0, 1, Math.min(17, (nw - 10) / Math.max(2, f.name.length) * 1.1), '#fff', ch.d, 5);
  c.restore();
  drawCharFace(c, ch.id, x + w - 24, y + h - 22, 38, mood);
  if (typeof drawOppRank === 'function') drawOppRank(c, f, x + 24, y + 22);   // 랭크전 상대 티어(설정에서 켰을 때)
  if (hype && (f.chain || 0) >= 2) {            // 지금 연쇄 수
    c.save(); c.translate(x + w - 30, y + 20); c.rotate(0.12); const sc = 1 + 0.08 * Math.sin(t / 70); c.scale(sc, sc);
    outlined(c, `${f.chain}연쇄!`, 0, 0, 20, '#ffe066', '#c2410c', 6); c.restore();
  } else if (worry) {
    c.save(); c.translate(x + w - 30, y + 20); c.rotate(0.12); c.globalAlpha = 0.75 + 0.25 * Math.sin(t / 110);
    outlined(c, '위험!', 0, 0, 20, '#fff', '#e8283c', 6); c.restore();
  } else if (game.vs && (won || lost && game.state === 'over')) {
    c.save(); c.translate(x + w - 30, y + 20); c.rotate(0.12);
    outlined(c, won ? '승리' : '패배', 0, 0, 20, won ? '#ffe066' : '#fff', won ? '#c2410c' : '#4b4a5e', 6); c.restore();
  }
  c.restore();
}
// 카드(캐릭터 고르기 화면)
function drawCharCard(c, id, x, y, w, h) {
  if (!charImgOk('card')) { drawChar(c, id, x + w / 2, y + h / 2, Math.min(w, h) * 0.8); return; }
  charImg(c, 'card', id, x, y, w, h);
}
// 얼굴(대화창 · 컷인 · 어드벤처): 둥근 네모 안에, 테두리는 캐릭터 색
function drawCharBust(c, id, x, y, size) {
  if (!charImgOk('bust')) { drawChar(c, id, x, y, size); return; }
  const ch = charOf(id), h = size / 2, r = size * 0.18;
  c.save(); c.beginPath(); rr(c, x - h, y - h, size, size, r); c.clip(); charImg(c, 'bust', id, x - h, y - h, size, size); c.restore();
  c.save(); c.lineWidth = Math.max(2, size * 0.05); c.strokeStyle = '#fff'; c.beginPath(); rr(c, x - h, y - h, size, size, r); c.stroke();
  c.lineWidth = Math.max(1, size * 0.02); c.strokeStyle = ch.d; c.stroke(); c.restore();
}
// 작은 초상(이름표 · 기록 · 순위표 · 메뉴 그림): 마스코트 아이콘. 진 쪽(sad)은 색을 빼서
function drawChar(c, id, x, y, size, mood = 'happy') {
  if (charImgOk('icon')) {
    const s = size * 1.08;
    c.save(); if (mood === 'sad') c.filter = 'grayscale(0.8) brightness(0.95)';
    charImg(c, 'icon', id, x - s / 2, y - s / 2, s, s); c.restore(); return;
  }
  const ch = charOf(id), r = size / 2;
  c.save(); c.translate(x, y);
  const ear = (dx, dy, rr, col) => { c.fillStyle = col; c.beginPath(); c.arc(dx, dy, rr, 0, Math.PI * 2); c.fill(); };
  // 귀·장식(몸 뒤)
  if (ch.ears === 'bear') { ear(-r * 0.7, -r * 0.72, r * 0.32, ch.d); ear(r * 0.7, -r * 0.72, r * 0.32, ch.d); ear(-r * 0.7, -r * 0.72, r * 0.17, '#f3d2b0'); ear(r * 0.7, -r * 0.72, r * 0.17, '#f3d2b0'); }
  if (ch.ears === 'cat') for (const s of [-1, 1]) { c.fillStyle = ch.d; c.beginPath(); c.moveTo(s * r * 0.85, -r * 0.2); c.lineTo(s * r * 0.75, -r * 1.15); c.lineTo(s * r * 0.2, -r * 0.75); c.fill(); }
  if (ch.ears === 'wool') for (let i = 0; i < 9; i++) { const a = Math.PI + i * Math.PI / 8; ear(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.82 - r * 0.05, r * 0.3, '#fff3fa'); }
  if (ch.ears === 'shell') { c.fillStyle = '#3a8f5a'; c.beginPath(); c.ellipse(0, -r * 0.35, r * 1.05, r * 0.7, 0, Math.PI, 0); c.fill(); c.strokeStyle = '#2a6b42'; c.lineWidth = r * 0.06; for (const dx of [-0.45, 0, 0.45]) { c.beginPath(); c.arc(dx * r, -r * 0.55, r * 0.22, 0, Math.PI * 2); c.stroke(); } }
  if (ch.ears === 'antenna') { c.strokeStyle = '#555'; c.lineWidth = r * 0.08; c.beginPath(); c.moveTo(0, -r * 0.9); c.lineTo(0, -r * 1.3); c.stroke(); ear(0, -r * 1.35, r * 0.13, '#ffe066'); }
  // 몸
  const g = c.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.05);
  g.addColorStop(0, mixW(ch.col, 0.45)); g.addColorStop(1, ch.col);
  c.fillStyle = g; c.beginPath();
  if (ch.ears === 'antenna') rr(c, -r * 0.92, -r * 0.92, r * 1.84, r * 1.84, r * 0.45); else c.ellipse(0, 0, r * 0.95, r * 0.9, 0, 0, Math.PI * 2);
  c.fill(); c.lineWidth = r * 0.07; c.strokeStyle = ch.d; c.stroke();
  // 얼굴
  const eyeY = -r * 0.08, eyeX = r * 0.34;
  if (ch.ears === 'frog') for (const s of [-1, 1]) { ear(s * eyeX, -r * 0.62, r * 0.3, ch.col); c.strokeStyle = ch.d; c.lineWidth = r * 0.05; c.beginPath(); c.arc(s * eyeX, -r * 0.62, r * 0.3, Math.PI, 0); c.stroke(); }
  for (const s of [-1, 1]) {
    const ey = ch.ears === 'frog' ? -r * 0.6 : eyeY;
    if (mood === 'sad') { c.strokeStyle = '#2a1840'; c.lineWidth = r * 0.08; c.lineCap = 'round'; c.beginPath(); c.moveTo(s * eyeX - r * 0.12, ey - r * 0.04); c.lineTo(s * eyeX + r * 0.12, ey + r * 0.04 * s * -1); c.stroke(); continue; }
    if (ch.ears === 'antenna') { c.fillStyle = '#7ff0ff'; rr(c, s * eyeX - r * 0.13, ey - r * 0.1, r * 0.26, r * 0.2, r * 0.05); c.fill(); continue; }
    c.fillStyle = '#fff'; c.beginPath(); c.ellipse(s * eyeX, ey, r * 0.18, r * 0.24, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#22123a'; c.beginPath(); c.ellipse(s * eyeX + r * 0.02, ey + r * 0.04, r * 0.1, r * 0.15, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(s * eyeX - r * 0.02, ey - r * 0.03, r * 0.04, 0, Math.PI * 2); c.fill();
  }
  c.fillStyle = 'rgba(255,120,150,0.45)'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * r * 0.55, r * 0.22, r * 0.14, r * 0.08, 0, 0, Math.PI * 2); c.fill(); }
  c.strokeStyle = '#2a1840'; c.lineWidth = r * 0.07; c.lineCap = 'round'; c.beginPath();
  if (mood === 'sad') c.arc(0, r * 0.5, r * 0.18, Math.PI * 1.15, Math.PI * 1.85); else c.arc(0, r * 0.22, r * 0.2, Math.PI * 0.15, Math.PI * 0.85);
  c.stroke();
  // 앞 장식
  if (ch.ears === 'bow') { c.fillStyle = '#ffe066'; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(r * 0.45, -r * 0.75); c.lineTo(r * 0.45 + s * r * 0.35, -r * 0.95); c.lineTo(r * 0.45 + s * r * 0.35, -r * 0.55); c.fill(); } ear(r * 0.45, -r * 0.75, r * 0.1, '#ffb400'); }
  if (ch.ears === 'star') drawStar(c, r * 0.55, -r * 0.7, r * 0.32, '#fff6c2');
  c.restore();
}

/* ---------- 연쇄 컷인 · 목소리 ---------- */
// 판 위로 초상과 대사가 잠깐 지나감. level: 1~4(연쇄가 클수록 큰 대사)
function cutIn(f, level) {
  if (!f.char) return;
  const ch = charOf(f.char), line = ch.lines[Math.min(3, Math.max(0, level - 1))];
  f.cut = { id: ch.id, line, age: 0, dur: 1100, big: level >= 3 };
  if (!f.remote || game.mode === 'replay') voice(ch, level);
}
function voice(ch, level) {
  if (!AC) return;
  const n = 2 + Math.min(3, level);
  for (let i = 0; i < n; i++) tone(ch.voice * Math.pow(1.12, i % 3) * (1 + level * 0.04), 0.07, 'triangle', 0.035, 1.05, i * 0.07);
}
function drawCut(c, f) {
  const k = f.cut; if (!k) return;
  const e = k.age / k.dur, inX = Math.min(1, k.age / 160), outA = e > 0.8 ? 1 - (e - 0.8) / 0.2 : 1, ch = charOf(k.id);
  c.save(); c.globalAlpha = outA; c.translate(f.ox + f.fw / 2 + (1 - inX) * -120, f.oy + 70);
  slab(c, -f.fw / 2 + 10, -34, f.fw - 20, 68, { c: ch.col, d: ch.d }, 5);
  drawCharFace(c, ch.id, -f.fw / 2 + 52, 0, 60, k.big ? FACE.joy : FACE.hype);   // 컷인: 신난 얼굴(큰 연쇄면 아주 기쁜 얼굴)
  outlined(c, k.line, 26, 2, Math.min(30, 300 / Math.max(3, k.line.length)), '#fff', ch.d, 7);
  c.restore();
}
function updateCut(f, dt) { if (f.cut) { f.cut.age += dt; if (f.cut.age > f.cut.dur) f.cut = null; } }
