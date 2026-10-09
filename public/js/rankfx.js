// 랭크전 연출: 승급 · 마스터 달성 · 강등 · 강등 보호 애니메이션, 게임 중 상대 랭크 아이콘
'use strict';

const RK_GROUPS = ['브론즈', '실버', '골드', '플래티넘', '다이아'], RK_DIV = 100, RK_MASTER = 1500;
const rkTier = total => {
  if (total >= RK_MASTER) return { group: 5, div: 0, rp: total - RK_MASTER, label: '마스터' };
  const i = Math.max(0, Math.floor(total / RK_DIV));
  return { group: Math.floor(i / 3), div: i % 3 + 1, rp: total - i * RK_DIV, label: `${RK_GROUPS[Math.floor(i / 3)]} ${i % 3 + 1}` };
};
const RK_LEN = { promote: 3900, master: 4200, demote: 3500, shield: 3300 };
const clamp01 = v => Math.max(0, Math.min(1, v));
const easeOut = v => 1 - Math.pow(1 - clamp01(v), 3);
const easeBack = v => { v = clamp01(v); const s = 1.7; return 1 + (s + 1) * Math.pow(v - 1, 3) + s * Math.pow(v - 1, 2); };
let rkfx = null, rkfxLast = null;

// 결과(rdone)를 받으면 한 번만 재생. opt.at: 그 시점에 멈춘 그림(스크린샷·확인용)
function rankFx(m, opt = {}) {
  if (!m || !RK_LEN[m.event] || (rkfxLast === m && !opt.at)) return false;
  rkfxLast = m;
  const after = m.total, before = after - m.d;
  const a = rkTier(before), b = rkTier(after);
  if (m.event === 'master') b.label = m.text || '마스터';
  let s = 7;                                          // 조각·금은 매번 같은 모양(시드 고정)
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const frags = Array.from({ length: 18 }, () => ({ a: rnd() * Math.PI * 2, v: 0.5 + rnd(), r: (rnd() - 0.5) * 8, s: 0.12 + rnd() * 0.16 }));
  const cracks = Array.from({ length: 6 }, (_, i) => { const p = [[0, 0]]; let ang = i / 6 * Math.PI * 2 + rnd() * 0.5, d = 0; while (d < 0.5) { d += 0.08 + rnd() * 0.08; ang += (rnd() - 0.5) * 0.7; p.push([Math.cos(ang) * d, Math.sin(ang) * d]); } return p; });
  rkfx = { kind: m.event, a, b, t0: performance.now() - (opt.at || 0), at: opt.at || null, frags, cracks, snd: {} };
  const cv = $('rkfx'); cv.classList.remove('hidden');
  if (!opt.at) requestAnimationFrame(rankFxLoop); else rankFxDraw(opt.at);
  return true;
}
function rankFxEnd() { rkfx = null; $('rkfx').classList.add('hidden'); }
function rankFxLoop() {
  if (!rkfx || rkfx.at != null) return;
  const t = performance.now() - rkfx.t0;
  if (t >= RK_LEN[rkfx.kind]) { rankFxEnd(); return; }
  rankFxSound(t); rankFxDraw(t);
  requestAnimationFrame(rankFxLoop);
}
function rankFxSound(t) {
  const k = rkfx.kind, once = (id, at, fn) => { if (t >= at && !rkfx.snd[id]) { rkfx.snd[id] = 1; fn(); } };
  if (k === 'promote' || k === 'master') {
    once('charge', 300, () => { tone(220, 1.0, 'sawtooth', 0.03, 4); tone(440, 1.0, 'triangle', 0.03, 3); });
    once('burst', 1300, () => { noise(0.4, 0.09, 'sfx', null, 600); tone(130, 0.5, 'sine', 0.16, 0.5); });
    once('fan', 1700, () => k === 'master' ? [0, 4, 7, 12, 16, 19, 24].forEach((st, i) => tone(392 * Math.pow(2, st / 12), 0.35, 'triangle', 0.09, 1, i * 0.09)) : sfx.win());
  } else if (k === 'demote') {
    once('drain', 300, () => tone(520, 0.8, 'sawtooth', 0.03, 0.4));
    once('crack', 1100, () => { noise(0.08, 0.08); noise(0.1, 0.06, 'sfx', audio() && audio().currentTime + 0.18); });
    once('break', 1500, () => { tone(90, 0.5, 'sine', 0.18, 0.5); noise(0.3, 0.06, 'sfx', null, 400); });
    once('land', 2050, () => [5, 2, -3].forEach((st, i) => tone(330 * Math.pow(2, st / 12), 0.35, 'triangle', 0.06, 1, i * 0.14)));
  } else {
    once('drain', 300, () => tone(520, 0.9, 'sawtooth', 0.03, 0.45));
    once('block', 1200, () => { sfx.clash(); tone(880, 0.5, 'sine', 0.06, 1.5); noise(0.12, 0.05); });
    once('ok', 1500, () => [0, 7, 12].forEach((st, i) => tone(523 * Math.pow(2, st / 12), 0.25, 'triangle', 0.06, 1, i * 0.08)));
  }
}
// RP 막대
function rkBar(c, x, y, w, rp, col, flash = 0) {
  const h = Math.max(10, w * 0.05);
  c.fillStyle = 'rgba(255,255,255,0.16)'; c.beginPath(); c.roundRect(x - w / 2, y, w, h, h / 2); c.fill();
  c.fillStyle = col; c.beginPath(); c.roundRect(x - w / 2, y, Math.max(h, w * clamp01(rp / 100)), h, h / 2); c.fill();
  if (flash > 0) { c.fillStyle = `rgba(255,255,255,${flash})`; c.beginPath(); c.roundRect(x - w / 2, y, w, h, h / 2); c.fill(); }
  c.font = Math.round(h * 1.4) + 'px ' + HFONT(); c.textAlign = 'center'; c.textBaseline = 'top'; c.fillStyle = '#fff';
  c.fillText(`${Math.round(rp)} RP`, x, y + h * 1.7);
}
function rkEmblem(c, x, y, size, t, opt = {}) {
  c.save(); c.globalAlpha = opt.alpha == null ? 1 : opt.alpha;
  if (opt.glow) { c.shadowColor = opt.glowCol || '#fff'; c.shadowBlur = opt.glow; }
  drawTierEmblem(c, x, y, size, t.group, t.div);
  c.restore();
}
function rankFxDraw(t) {
  const cv = $('rkfx'), dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  const f = rkfx, k = f.kind, L = RK_LEN[k], up = k === 'promote' || k === 'master';
  const fade = Math.min(clamp01(t / 300), clamp01((L - t) / 450));
  const cx = W / 2, cy = H * 0.42, S = Math.min(W * 0.42, H * 0.3), barW = Math.min(W * 0.6, S * 1.7), barY = cy + S * 0.78;
  const [colA] = TIER_COL[f.a.group] || ['#cfd1dc'], [colB] = TIER_COL[f.b.group] || ['#cfd1dc'];
  c.save(); c.globalAlpha = fade;
  // 배경: 어둡게 + 가운데 빛
  c.fillStyle = 'rgba(12,9,32,0.94)'; c.fillRect(0, 0, W, H);
  const bg = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.6);
  bg.addColorStop(0, up ? colB + '55' : k === 'shield' ? '#4fd1ff33' : '#ff455922'); bg.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = bg; c.fillRect(0, 0, W, H);

  if (up) {
    const burst = 1300, pre = t < burst;
    if (pre) {                                        // 모으기: RP가 100까지 차고 엠블럼이 떨리며 빛남
      const ch = clamp01((t - 300) / 1000), shake = t > 900 ? (t - 900) / 400 * S * 0.03 : 0;
      for (let i = 0; i < 14; i++) {                  // 빨려 들어오는 빛 알갱이
        const a = i / 14 * Math.PI * 2 + t / 900, d = S * (1.4 - ((t / 700 + i * 0.37) % 1) * 1.1);
        c.fillStyle = mixW(colB, 0.4); c.globalAlpha = fade * 0.8 * ch; c.beginPath(); c.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, S * 0.02, 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha = fade;
      rkEmblem(c, cx + (Math.random() - 0.5) * shake * (f.at ? 0 : 1), cy, S * (0.85 + 0.15 * easeOut(t / 300)), f.a, { glow: 10 + ch * 60, glowCol: mixW(colB, 0.3) });
      rkBar(c, cx, barY, barW, f.a.rp + (100 - f.a.rp) * easeOut(ch), '#ffe066', ch > 0.95 ? (ch - 0.95) * 12 : 0);
      outlined(c, f.a.label, cx, cy - S * 0.78, S * 0.16, '#fff', '#2b2450', S * 0.03);
    } else {
      const e = t - burst;
      // 빛줄기(회전)
      c.save(); c.translate(cx, cy); c.rotate(t / 2600);
      const ra = clamp01(e / 400) * (k === 'master' ? 0.5 : 0.38);
      for (let i = 0; i < 14; i++) {
        c.rotate(Math.PI * 2 / 14);
        const g = c.createLinearGradient(0, 0, 0, -S * 2.4); g.addColorStop(0, mixW(colB, 0.5)); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.globalAlpha = fade * ra; c.beginPath(); c.moveTo(0, 0); c.lineTo(-S * 0.16, -S * 2.4); c.lineTo(S * 0.16, -S * 2.4); c.closePath(); c.fill();
      }
      c.restore(); c.globalAlpha = fade;
      // 깨진 옛 엠블럼 조각
      for (const p of f.frags) {
        const d = S * 0.25 + e * 0.9 * p.v, al = clamp01(1 - e / 700);
        if (al <= 0) continue;
        c.save(); c.globalAlpha = fade * al; c.translate(cx + Math.cos(p.a) * d, cy + Math.sin(p.a) * d + e * e * 0.0004 * S); c.rotate(p.r * e / 1000);
        c.fillStyle = colA; c.strokeStyle = '#fff'; c.lineWidth = 2; const z = S * p.s;
        c.beginPath(); c.moveTo(0, -z); c.lineTo(z * 0.8, z * 0.6); c.lineTo(-z * 0.7, z * 0.5); c.closePath(); c.fill(); c.stroke(); c.restore();
      }
      // 충격파
      for (const dl of [0, 160]) {
        const q = clamp01((e - dl) / 650); if (q <= 0 || q >= 1) continue;
        c.strokeStyle = mixW(colB, 0.5); c.lineWidth = S * 0.06 * (1 - q); c.globalAlpha = fade * (1 - q);
        c.beginPath(); c.arc(cx, cy, S * (0.4 + q * 1.6), 0, Math.PI * 2); c.stroke();
      }
      c.globalAlpha = fade;
      // 새 엠블럼: 크게 나타났다가 자리 잡음
      const sc = 1.7 - 0.7 * easeBack(e / 520);
      rkEmblem(c, cx, cy, S * sc, f.b, { alpha: clamp01(e / 200), glow: 50, glowCol: mixW(colB, 0.4) });
      // 글자
      const tq = clamp01((e - 350) / 300);
      if (tq > 0) {
        c.save(); c.globalAlpha = fade * tq; const ts = 1 + 0.5 * (1 - easeOut(tq));
        c.translate(cx, cy - S * 0.86); c.scale(ts, ts);
        outlined(c, k === 'master' ? '마스터 달성' : '승급', 0, 0, S * 0.3, '#ffe066', '#2b2450', S * 0.05);
        c.restore();
        c.globalAlpha = fade * tq;
        outlined(c, f.b.label, cx, barY - S * 0.02, S * 0.17, '#fff', '#2b2450', S * 0.03);
        if (k !== 'master') rkBar(c, cx, barY + S * 0.22, barW, f.b.rp * easeOut((e - 500) / 600), '#ffe066');
      }
      // 터지는 순간 흰 번쩍임
      const fl = clamp01(1 - e / 380); if (fl > 0) { c.globalAlpha = fade * fl * 0.85; c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); }
    }
  } else if (k === 'demote') {
    const brk = 1500;
    if (t < brk) {                                   // RP가 0까지 줄고, 금이 가며 흔들림
      const dr = clamp01((t - 300) / 800), cr = clamp01((t - 1100) / 300), sh = cr * S * 0.025 * (f.at ? 0 : 1);
      rkEmblem(c, cx + (Math.random() - 0.5) * sh, cy, S * (0.85 + 0.15 * easeOut(t / 300)), f.a);
      if (cr > 0) {                                   // 금
        c.save(); c.translate(cx, cy); c.strokeStyle = 'rgba(30,20,40,0.85)'; c.lineWidth = S * 0.018; c.lineJoin = 'round';
        for (const p of f.cracks) { const n = Math.ceil(p.length * cr); c.beginPath(); p.slice(0, n).forEach(([x, y], i) => i ? c.lineTo(x * S, y * S) : c.moveTo(x * S, y * S)); c.stroke(); }
        c.fillStyle = `rgba(20,14,40,${0.35 * cr})`; c.beginPath(); c.arc(0, 0, S * 0.5, 0, Math.PI * 2); c.fill();
        c.restore();
      }
      rkBar(c, cx, barY, barW, f.a.rp * (1 - easeOut(dr)), '#ff5a6e');
      outlined(c, f.a.label, cx, cy - S * 0.78, S * 0.16, '#fff', '#2b2450', S * 0.03);
    } else {
      const e = t - brk;
      // 두 쪽으로 갈라져 떨어지는 옛 엠블럼
      for (const sd of [-1, 1]) {
        const al = clamp01(1 - e / 650); if (al <= 0) continue;
        c.save(); c.globalAlpha = fade * al; c.translate(cx + sd * e * 0.08, cy + e * e * 0.0009 * S / 2); c.rotate(sd * e / 900);
        c.beginPath(); c.rect(sd < 0 ? -S : 0, -S, S, S * 2); c.clip();
        drawTierEmblem(c, 0, 0, S, f.a.group, f.a.div); c.restore();
      }
      // 새(낮아진) 엠블럼이 위에서 툭 떨어짐
      const q = clamp01((e - 200) / 550), drop = q < 1 ? -S * 0.9 * (1 - q) * (1 - q) : 0, bounce = q >= 1 ? Math.sin(clamp01((e - 750) / 260) * Math.PI) * S * 0.04 : 0;
      if (q > 0) rkEmblem(c, cx, cy + drop - bounce, S * 0.9, f.b, { alpha: clamp01(q * 2) });
      const tq = clamp01((e - 500) / 300);
      if (tq > 0) {
        c.globalAlpha = fade * tq;
        outlined(c, '강등', cx, cy - S * 0.86 + (1 - easeOut(tq)) * S * 0.1, S * 0.3, '#ff9aa6', '#3a1a2a', S * 0.05);
        outlined(c, f.b.label, cx, barY - S * 0.02, S * 0.17, '#fff', '#2b2450', S * 0.03);
        rkBar(c, cx, barY + S * 0.22, barW, 100 - (100 - f.b.rp) * easeOut((e - 600) / 600), '#ff8a9a');
      }
    }
  } else {                                           // 강등 보호: RP가 0에 닿는 순간 방패가 막아 줌
    const blk = 1200, dr = clamp01((t - 300) / 900);
    rkEmblem(c, cx, cy, S * (0.85 + 0.15 * easeOut(t / 300)), f.a, t > blk ? { glow: 30, glowCol: '#6fe3ff' } : {});
    rkBar(c, cx, barY + (t > blk ? S * 0.22 : 0), barW, Math.max(0, f.a.rp * (1 - easeOut(dr))), t > blk ? '#6fe3ff' : '#ff5a6e', t > blk ? clamp01(1 - (t - blk) / 300) * 0.8 : 0);
    if (t > blk) {
      const e = t - blk, q = easeBack(e / 380), pulse = 1 + Math.sin(e / 160) * 0.02 * clamp01(e / 600);
      c.save(); c.translate(cx, cy); c.scale(q * pulse * 1.0, q * pulse * 1.0);
      const r = S * 0.75;                             // 육각 방패
      c.beginPath(); for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 3; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } c.closePath();
      c.fillStyle = 'rgba(111,227,255,0.16)'; c.fill();
      c.shadowColor = '#6fe3ff'; c.shadowBlur = 30; c.lineWidth = S * 0.05; c.strokeStyle = '#bff3ff'; c.stroke();
      c.shadowBlur = 0; c.lineWidth = S * 0.015; c.strokeStyle = 'rgba(255,255,255,0.8)';
      c.beginPath(); for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 3; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86); } c.closePath(); c.stroke();
      c.restore();
      for (const dl of [0, 140, 280]) {               // 막는 순간 퍼지는 물결
        const w = clamp01((e - dl) / 600); if (w <= 0 || w >= 1) continue;
        c.strokeStyle = '#9feaff'; c.globalAlpha = fade * (1 - w); c.lineWidth = S * 0.03 * (1 - w);
        c.beginPath(); c.arc(cx, cy, S * (0.75 + w * 0.9), 0, Math.PI * 2); c.stroke();
      }
      c.globalAlpha = fade;
      const tq = clamp01((e - 250) / 300);
      if (tq > 0) {
        c.globalAlpha = fade * tq;
        outlined(c, '강등 보호', cx, cy - S * 0.86 + (1 - easeOut(tq)) * S * 0.1, S * 0.28, '#bff3ff', '#123a52', S * 0.05);
        outlined(c, `${f.b.label} 유지 · 다음 패배부터는 강등돼요`, cx, barY + S * 0.62, S * 0.1, '#fff', '#2b2450', S * 0.025);
      }
      const fl = clamp01(1 - e / 250); if (fl > 0) { c.globalAlpha = fade * fl * 0.7; c.fillStyle = '#dff8ff'; c.fillRect(0, 0, W, H); }
    } else outlined(c, f.a.label, cx, cy - S * 0.78, S * 0.16, '#fff', '#2b2450', S * 0.03);
  }
  c.globalAlpha = fade * 0.7; c.font = '15px ' + FONT(); c.textAlign = 'center'; c.textBaseline = 'bottom'; c.fillStyle = '#fff';
  if (f.at == null) c.fillText('클릭하거나 아무 키나 누르면 건너뛰어요', cx, H - 24);
  c.restore();
}
// 건너뛰기: 연출 중 입력은 결과 화면 버튼으로 넘어가지 않게 막음
window.addEventListener('keydown', e => { if (!rkfx) return; e.preventDefault(); e.stopImmediatePropagation(); rankFxEnd(); }, true);
$('rkfx').addEventListener('pointerdown', e => { e.preventDefault(); rankFxEnd(); });

// 게임 중 이름표 옆 상대 랭크 아이콘(설정에서 켰을 때만)
function drawOppRank(c, f, x, y) {
  if (!stats.oppRank || !game.ranked || game.mode !== 'online' || !f.rankEm || f === game.fields[0]) return;
  c.save(); c.shadowColor = "rgba(0,0,0,0.35)"; c.shadowBlur = 6; c.shadowOffsetY = 2; drawTierEmblem(c, x, y, 40, f.rankEm.group, f.rankEm.div); c.restore();
}
