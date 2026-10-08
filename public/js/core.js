// 상수 · 그리기 도우미 · 사운드 · 조각 순서
'use strict';

/* ================= 상수 ================= */
// 판 크기 — 한 판(대전) 안의 뿌요 판은 모두 같은 크기. applyBoard() 로 바꿈
// 화면에서 판이 차지하는 칸(SW×FH)은 고정이고, 뿌요 격자(FW×FH)는 그 안에 가운데 정렬
const BOARDS = {
  wide:    { cols: 8,  vis: 14, ko: '넓게 8×14' },
  classic: { cols: 6,  vis: 12, ko: '원작 6×12' },
  tiny:    { cols: 12, vis: 24, ko: '타이니 12×24', drop: 60 },   // 작은 뿌요로 넓고 높은 판
};
const SW = 320, FH = 560;                        // 판 한 칸의 폭(테트리스 판 폭) · 높이
let BOARD = 'wide', COLS, VIS, ROWS, CS, SP, FW, R, BW;
function applyBoard(key) {
  const b = BOARDS[key] || BOARDS.wide;
  BOARD = BOARDS[key] ? key : 'wide';
  COLS = b.cols; VIS = b.vis; ROWS = VIS + 1;    // 맨 위 1줄은 숨김 줄
  CS = FH / VIS; FW = COLS * CS;
  SP = Math.floor((COLS - 1) / 2);               // 등장·사망 칸(✕) 열
  R = CS * 0.46; BW = R * 1.5;
}
applyBoard('wide');
const OX1 = 20, OY = 84, PANEL_W = 160, PX = OX1 + SW + PANEL_W / 2, OX2 = OX1 + SW + PANEL_W;
const OJ = 6;                                   // 방해뿌요
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];   // 위 오른 아래 왼
const PAL = [null,
  { d: '#6e0b1f', s: '#d8233f', m: '#ff5a70' },   // 빨강
  { d: '#0b4f22', s: '#1fa947', m: '#58e27c' },   // 초록
  { d: '#102f73', s: '#2a66d8', m: '#5aa8ff' },   // 파랑
  { d: '#7a4c00', s: '#dea200', m: '#ffdc3a' },   // 노랑
  { d: '#401478', s: '#8a3fdb', m: '#c47dff' },   // 보라
  { d: '#55507a', s: '#a29dc2', m: '#e4e1f3' },   // 방해
];
const mixW = (hex, t) => { const n = parseInt(hex.slice(1), 16); const f = v => Math.round(v + (255 - v) * t);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
const FLASH = PAL.map(P => P && { d: mixW(P.d, 0.55), s: mixW(P.s, 0.7), m: mixW(P.m, 0.8) });
const CHAIN_POWER = [0,0,8,16,32,64,96,128,160,192,224,256,288,320,352,384,416,448,480,512,544,576,608,640,672];
const COLOR_BONUS = [0,0,3,6,12,24];
const groupBonus = n => n < 5 ? 0 : n >= 11 ? 10 : n - 3;
const G = 0.00012, V0 = 0.003, VMAX = 0.03;     // 낙하 물리(줄/ms)
const POP_T = 520;
const CH_COL = ['#ffffff','#ffd93d','#ff9a3d','#ff4f6a','#ff5fd0','#b66bff','#4aa3ff','#3fd96b'];
const CANVAS_H = OY + FH + 76;
const DPR = Math.min(2, window.devicePixelRatio || 1);

const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const overlay = document.getElementById('overlay');
const rnd = n => Math.floor(Math.random() * n);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
const FONT = () => getComputedStyle(document.body).fontFamily;
const HFONT = () => '"Black Han Sans", ' + FONT();
const TONES = { orange: { c: '#ff8a1c', d: '#c75a00' }, red: { c: '#ff4559', d: '#b01830' }, blue: { c: '#2f78f0', d: '#1747b0' }, green: { c: '#39c63c', d: '#1a8027' },
  yellow: { c: '#ffc915', d: '#d08a00' }, purple: { c: '#9a4fd8', d: '#5e2399' }, white: { c: '#ffffff', d: '#cfd1dc' } };
let dotPat = null;
function dots(c) {
  if (!dotPat) {
    const o = document.createElement('canvas'); o.width = o.height = 12;
    const x = o.getContext('2d'); x.fillStyle = 'rgba(255,255,255,0.24)'; x.beginPath(); x.arc(6, 6, 3.2, 0, Math.PI * 2); x.fill();
    dotPat = c.createPattern(o, 'repeat');
  }
  return dotPat;
}
// 메뉴 타일과 같은 사선 망점 패널
function slab(c, x, y, w, h, tone, b = 5) {
  const k = Math.min(14, w * 0.05);
  const poly = (x, y, w, h, k) => { c.beginPath(); c.moveTo(x + k, y); c.lineTo(x + w, y); c.lineTo(x + w - k, y + h); c.lineTo(x, y + h); c.closePath(); };
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.16)'; poly(x, y + 5, w, h, k); c.fill();
  c.fillStyle = tone.d; poly(x, y, w, h, k); c.fill();
  c.fillStyle = tone.c; poly(x + b, y + b, w - b * 2, h - b * 2, k * (h - b * 2) / h); c.fill();
  if (tone.c !== '#ffffff') { c.fillStyle = dots(c); c.fill(); }
  c.restore();
}
function outlined(c, txt, x, y, size, fill, stroke, lw = 7) {
  c.font = size + 'px ' + HFONT(); c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  c.lineWidth = lw; c.strokeStyle = stroke; c.strokeText(txt, x, y); c.fillStyle = fill; c.fillText(txt, x, y);
}

/* ================= 사운드 ================= */
let AC = null, muted = false, BUS = null;
function audio() {
  if (!AC) {
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      const m = AC.createGain(), sf = AC.createGain(), bg = AC.createGain();
      sf.connect(m); bg.connect(m); m.connect(AC.destination);
      BUS = { master: m, sfx: sf, bgm: bg }; applyVolume();
    } catch (e) {}
  }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function applyVolume() {
  if (!BUS) return;
  const v = (typeof stats !== 'undefined' && stats.vol) || { bgm: 0.5, sfx: 0.8 };
  BUS.master.gain.value = muted ? 0 : 1; BUS.sfx.gain.value = v.sfx; BUS.bgm.gain.value = v.bgm * 0.5;
}
function tone(f, d, type = 'sine', v = 0.07, slide = 1, delay = 0, bus = 'sfx', at = null) {
  const a = audio(); if (!a || !BUS) return;
  const t = at != null ? at : a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(BUS[bus]); o.start(t); o.stop(t + d + 0.02);
}
function noise(d, v, bus = 'sfx', at = null, hp = 1800) {
  const a = audio(); if (!a || !BUS) return;
  const n = Math.floor(a.sampleRate * d), b = a.createBuffer(1, n, a.sampleRate), ch = b.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = hp; g.gain.value = v;
  s.buffer = b; s.connect(f); f.connect(g); g.connect(BUS[bus]); s.start(at != null ? at : a.currentTime);
}
/* 배경음악: 직접 만든 짧은 루프(C–G–Am–F 진행)를 Web Audio로 실시간 연주.
   menu: 느리고 잔잔하게 / game: 빠르게 + 드럼, 마진 타임이면 조금 더 빨라짐 */
const BGM = { timer: null, mood: null, step: 0, next: 0 };
const CHORDS = [[0, 4, 7, 12], [7, 11, 14, 19], [9, 12, 16, 21], [5, 9, 12, 17]];
const MEL = [3, null, 2, null, 1, null, 2, 1, 3, null, 2, null, 1, null, 0, null];
const MEL2 = [2, null, 3, null, 2, 1, 0, null, 1, null, 2, null, 3, null, null, null];
function bgmPlay(mood) {
  if (BGM.mood === mood) return;
  bgmStop(); const a = audio(); if (!a) return;
  BGM.mood = mood; BGM.step = 0; BGM.next = a.currentTime + 0.1;
  BGM.timer = setInterval(bgmTick, 25);
}
function bgmStop() { clearInterval(BGM.timer); BGM.timer = null; BGM.mood = null; }
function bgmTick() {
  const a = AC; if (!a) return;
  const game_ = BGM.mood === 'game', bpm = game_ ? (game.marginLv ? 150 : 136) : 96, sp = 60 / bpm / 4;
  while (BGM.next < a.currentTime + 0.15) {
    const st = BGM.step, bar = Math.floor(st / 16) % 4, i = st % 16, ch = CHORDS[bar], t = BGM.next;
    const C3 = 130.81, C5 = 523.25, f = semi => C5 * Math.pow(2, semi / 12);
    if (i % 4 === 0 || (game_ && i % 4 === 2)) tone(C3 * Math.pow(2, ch[0] / 12) / (i % 8 === 0 ? 1 : 1), sp * 1.8, 'triangle', game_ ? 0.09 : 0.07, 1, 0, 'bgm', t);
    const pat = Math.floor(st / 64) % 2 ? MEL2 : MEL, d = pat[i];
    if (d != null) tone(f(ch[d]), sp * (game_ ? 1.6 : 2.6), game_ ? 'square' : 'sine', game_ ? 0.028 : 0.05, 1, 0, 'bgm', t);
    if (!game_ && i % 8 === 4) tone(f(ch[1] - 12), sp * 6, 'sine', 0.025, 1, 0, 'bgm', t);
    if (game_) {
      if (i % 4 === 0) tone(110, 0.12, 'sine', 0.12, 0.4, 0, 'bgm', t);
      if (i % 4 === 2) noise(0.04, 0.05, 'bgm', t, 6000);
      if (i % 8 === 4) noise(0.1, 0.06, 'bgm', t, 1200);
    }
    BGM.next += sp; BGM.step = (st + 1) % 128;
  }
}
const SCALE = [0,2,4,5,7,9,11,12,14,16,17,19,21,23,24];
const sfx = {
  move: () => tone(420, 0.03, 'square', 0.012),
  rot: () => tone(640, 0.04, 'triangle', 0.03),
  land: () => tone(160, 0.1, 'sine', 0.1, 0.5),
  pop: ch => { const f = 523.25 * Math.pow(2, SCALE[Math.min(ch - 1, SCALE.length - 1)] / 12);
    tone(f, 0.3, 'triangle', 0.11); tone(f * 2, 0.18, 'square', 0.022); noise(0.14, 0.05); },
  garb: () => tone(95, 0.14, 'sine', 0.11, 0.5),
  slam: () => { tone(120, 0.16, 'sine', 0.14, 0.45); noise(0.06, 0.04); },
  send: () => { tone(500, 0.22, 'sawtooth', 0.035, 3); tone(1000, 0.18, 'triangle', 0.04, 1.8); },
  hit: n => { tone(110, 0.22, 'sine', 0.14, 0.4); noise(0.12, 0.07 + Math.min(0.06, n / 300)); },
  double: n => [0, 4, 7, 12, 16, 19].slice(0, n + 2).forEach((st, i) => tone(784 * Math.pow(2, st / 12), 0.16, 'square', 0.035, 1, i * 0.045)),
  hold: () => tone(520, 0.06, 'triangle', 0.04, 1.4),
  gauge: () => tone(980, 0.07, 'square', 0.02, 1.3),
  tclear: (n, ts) => { const b = ts ? 660 : 440; [0, 4, 7, 12].slice(0, Math.max(1, n)).forEach((st, i) => tone(b * Math.pow(2, st / 12), 0.14, 'triangle', 0.07, 1, i * 0.04)); if (n === 4 || ts) noise(0.12, 0.05); },
  ready: () => [0, 7].forEach((st, i) => tone(523 * Math.pow(2, st / 12), 0.18, 'triangle', 0.06, 1, i * 0.12)),
  go: () => { [0, 4, 7, 12].forEach((st, i) => tone(659 * Math.pow(2, st / 12), 0.2, 'square', 0.035, 1, i * 0.05)); },
  danger: () => [0, 1, 0, 1].forEach((st, i) => tone(880 + st * 120, 0.09, 'square', 0.035, 1, i * 0.11)),
  margin: () => [0, 3, 6, 9].forEach((st, i) => tone(392 * Math.pow(2, st / 12), 0.16, 'sawtooth', 0.04, 1, i * 0.08)),
  clash: () => { tone(1320, 0.12, 'triangle', 0.06); tone(1760, 0.16, 'sine', 0.04, 0.8, 0.04); noise(0.08, 0.04); },
  clear: () => [0,4,7,12,16].forEach((s, i) => tone(523 * Math.pow(2, s / 12), 0.25, 'triangle', 0.08, 1, i * 0.07)),
  win: () => [0,4,7,12,7,12,16].forEach((s, i) => tone(392 * Math.pow(2, s / 12), 0.3, 'triangle', 0.09, 1, i * 0.11)),
  lose: () => [7,5,2,-3].forEach((s, i) => tone(330 * Math.pow(2, s / 12), 0.4, 'sawtooth', 0.06, 1, i * 0.18)),
};

/* ================= 뿌요 순서(양쪽 공통) ================= */
let seq = [], seqRng = Math.random;
function makeRng(seed) {                 // mulberry32: 같은 시드면 두 사람에게 같은 순서
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function seedSeq(seed) { seqRng = makeRng(seed); tRng = makeRng((seed ^ 0x9E3779B9) >>> 0); tseq = []; }
function pairAt(i) {
  const r = n => Math.floor(seqRng() * n);
  while (seq.length <= i) { const n = seq.length < 2 ? 3 : 4; seq.push([1 + r(n), 1 + r(n)]); }
  return seq[i];
}
