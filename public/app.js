/* ============================================================
   Controle de Ganhos Particulares — Frontend (visual "Sonda")
   Vanilla JS · Mês (setor de varredura) · Ano (espectro) · Ajustes
   Lançar = folha que abre de qualquer tela (tecla N)
   ============================================================ */
'use strict';

/* ---------- catálogo ---------- */
// Catálogo real extraído dos demonstrativos (sugestões iniciais; o histórico entra junto, por frequência)
const EXAMES_CATALOGO = [
  'US - Abdome total', 'US - Transvaginal', 'US - Mamas', 'US - Articular (por articulação)',
  'Doppler colorido venoso de membro inferior', 'US - Órgãos superficiais (tireóide)',
  'US - Aparelho urinário (rins, ureteres e bexiga)', 'US - Estruturas superficiais (cervical)',
  'US - Obstétrica com Doppler colorido', 'US - Abdome superior', 'Doppler colorido de órgão ou estrutura',
  'US - Obstétrica', 'US - Abdome inferior feminino', 'US - Obstétrica morfológica',
  'US - Obstétrica 1º trimestre', 'US - Obstétrica com translucência nucal',
  'US - Abdome inferior masculino (bexiga e próstata)', 'US - Dermatológico (pele e subcutâneo)',
  'Doppler colorido arterial de membro inferior', 'US - Obstétrica: perfil biofísico fetal',
  'Doppler colorido venoso de membro superior', 'US - Glândulas salivares (todas)',
  'Doppler colorido de aorta e artérias renais', 'Doppler colorido de aorta e ilíacas',
  'Doppler colorido de vasos cervicais (carótidas)', 'US - Torácico extracardíaco', 'Mamografia',
];
const PAG = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito', credito_parc: 'Parcelado' };
const PAGK = Object.keys(PAG);
const CARTOES = ['debito', 'credito', 'credito_parc'];
const SEM_PAG = 'Não informado';
const pagNome = p => p ? PAG[p] : SEM_PAG;

/* ---------- util ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl = v => BRL.format(v || 0).replace(/ /g, ' ');
const N2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const N0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const N1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const brlK = v => v >= 1000 ? 'R$ ' + N1.format(v / 1000) + ' mil' : 'R$ ' + N0.format(v);
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => iso(new Date());
const curYM = () => todayISO().slice(0, 7);
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const r2 = n => Math.round(n * 100) / 100;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const plural = (n, s, p) => `${N0.format(n)} ${n === 1 ? s : (p || s + 's')}`;
const shiftYM = (ym, k) => { const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + k, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const daysIn = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
const dateOf = s => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
// aceita "250", "250,50", "1.250,50", "1250.5"
function parseMoney(s) {
  s = String(s == null ? '' : s).replace(/[R$%\s]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return Number(s);
}

/* ---------- estado ---------- */
let entries = [];
let settings = { taxas: { debito: 0, credito: 0, credito_parc: 0 }, taxasConferidas: true };
let cfg = { nome: 'Controle de Ganhos', dono: '' };
let route = { page: '' };
let lastYm = curYM();
let hoverDay = -1, pinDay = '', q = '', filt = null, rkKey = 'exame', lastNav = 0;
const fresh = new Set();

/* ---------- API ---------- */
class ApiErr extends Error { constructor(m, status, data) { super(m); this.status = status; this.data = data; } }
async function api(method, url, body) {
  const headers = { 'Accept': 'application/json', 'X-Requested-With': 'controle' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let r;
  try { r = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined }); }
  catch (e) { throw new ApiErr('Sem conexão com o servidor.', 0); }
  let data = null;
  try { data = await r.json(); } catch (e) { /* sem corpo */ }
  if (r.status === 401 && url !== '/api/login') { showLogin(); throw new ApiErr('Sessão expirada. Entre novamente.', 401); }
  if (!r.ok) throw new ApiErr((data && data.error) || 'Erro no servidor.', r.status, data);
  return data;
}
async function loadEntries() { entries = await api('GET', '/api/entries'); }
async function loadAll() { const [e, s] = await Promise.all([api('GET', '/api/entries'), api('GET', '/api/settings')]); entries = e; settings = s; }

/* ---------- agregações ---------- */
const liq = e => r2(e.valor * (1 - (e.taxa || 0) / 100));
function agg(l) { let b = 0, q2 = 0; const at = new Set(); for (const e of l) { b += e.valor; q2 += liq(e); at.add(e.atendimento || e.id); } return { b: r2(b), l: r2(q2), t: r2(b - q2), n: l.length, at: at.size }; }
const ofM = ym => entries.filter(e => e.data.startsWith(ym));
const minYM = () => { const m = entries.reduce((a, e) => e.data < a ? e.data : a, '9999').slice(0, 7); const floor = shiftYM(curYM(), -11); return m < floor ? m : floor; };
function lastPrice(ex) { let best = null; for (const e of entries) if (e.exame === ex && (!best || e.created_at > best.created_at)) best = e; return best ? best.valor : null; }
function freq(key) { const m = new Map(); for (const e of entries) m.set(e[key], (m.get(e[key]) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]); }
function exameOptions() { const f = freq('exame'); for (const c of EXAMES_CATALOGO) if (!f.includes(c)) f.push(c); return f; }

/* ============================================================
   MOVIMENTO: contadores que rolam, indicador deslizante
   ============================================================ */
function setRoll(el, str, animate = true) {
  animate = animate && !reduce;
  const mask = [...str].map(c => /\d/.test(c) ? 'd' : c).join('');
  if (el._mask !== mask) {
    el._mask = mask; el.innerHTML = '';
    for (const c of str) {
      const s = document.createElement('span');
      if (/\d/.test(c)) { s.className = 'dg'; s.innerHTML = '<span class="st">' + '0123456789'.split('').map(d => '<i>' + d + '</i>').join('') + '</span>'; }
      else { s.className = 'ch'; s.textContent = c === ' ' ? '\u00a0' : c; }
      el.appendChild(s);
    }
    if (animate) { el.querySelectorAll('.st').forEach(st => { st.style.transition = 'none'; st.style.transform = 'translateY(0)'; }); void el.offsetWidth; }
  }
  const n = str.length;
  [...str].forEach((c, i) => {
    const s = el.children[i]; if (s.className !== 'dg') { s.textContent = c === ' ' ? '\u00a0' : c; return; }
    const st = s.firstChild;
    st.style.transition = animate ? '' : 'none';
    st.style.transitionDelay = animate ? (n - i) * 22 + 'ms' : '0ms';
    st.style.transform = `translateY(${-c * 10}%)`;
  });
  el.setAttribute('aria-label', str);
}
function slide(container, sel) {
  const ind = container && container.querySelector('.ind'); if (!ind) return;
  const on = container.querySelector(sel);
  if (!on) { ind.style.opacity = '0'; return; }
  ind.style.opacity = '1'; ind.style.width = on.offsetWidth + 'px';
  if (container.classList.contains('tabs')) { ind.style.height = on.offsetHeight + 'px'; ind.style.transform = `translate(${on.offsetLeft}px,${on.offsetTop}px)`; }
  else ind.style.transform = `translateX(${on.offsetLeft}px)`;
}

/* ============================================================
   TOOLTIP: segue o cursor nos gráficos; nos botões tem atraso
   na primeira vez e fica instantâneo enquanto "quente" (Emil/Rauno)
   ============================================================ */
const tip = $('#tip');
let tipTimer = 0, tipWarmUntil = 0, tipEl = null;
function placeTip(x, y) {
  const r = tip.getBoundingClientRect();
  let X = x + 16, Y = y + 16;
  if (X + r.width > innerWidth - 8) X = x - r.width - 16;
  if (Y + r.height > innerHeight - 8) Y = y - r.height - 16;
  tip.style.left = Math.max(8, X) + 'px'; tip.style.top = Math.max(8, Y) + 'px';
}
function showTipAt(x, y, html) { clearTimeout(tipTimer); tipEl = null; tip.classList.add('instant'); tip.innerHTML = html; tip.classList.add('on'); placeTip(x, y); }
function hideTip() { clearTimeout(tipTimer); if (tip.classList.contains('on')) tipWarmUntil = performance.now() + 500; tip.classList.remove('on'); tipEl = null; }
function tipFor(el) {
  const html = esc(el.dataset.tip) + (el.dataset.kbd ? `<kbd>${esc(el.dataset.kbd)}</kbd>` : '');
  const show = () => {
    if (!el.isConnected) return;
    tip.innerHTML = html; tip.classList.toggle('instant', performance.now() < tipWarmUntil); tip.classList.add('on'); tipEl = el;
    const b = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
    let x = b.left + b.width / 2 - t.width / 2, y = b.top - t.height - 8;
    if (y < 8) y = b.bottom + 8;
    tip.style.left = Math.min(innerWidth - t.width - 8, Math.max(8, x)) + 'px'; tip.style.top = y + 'px';
  };
  clearTimeout(tipTimer);
  if (performance.now() < tipWarmUntil) show(); else tipTimer = setTimeout(show, 420);
}
document.addEventListener('pointerover', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && el !== tipEl && e.pointerType === 'mouse') tipFor(el); });
document.addEventListener('pointerout', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && !el.contains(e.relatedTarget)) hideTip(); });
document.addEventListener('focusin', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && el.matches(':focus-visible')) tipFor(el); });
document.addEventListener('focusout', hideTip);
addEventListener('scroll', hideTip, { passive: true });
document.addEventListener('pointerdown', hideTip);

/* ============================================================
   CANVAS: setor de varredura (mês) e espectro (ano)
   ============================================================ */
function fit(c) {
  const dpr = Math.min(2, devicePixelRatio || 1), w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); return { x, w, h };
}
const noise = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 192; const x = c.getContext('2d'); const im = x.createImageData(192, 192);
  let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < im.data.length; i += 4) { const v = r(); const a = v < .55 ? 0 : Math.pow((v - .55) / .45, 1.6) * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = a; }
  x.putImageData(im, 0, 0); return c;
})();
function niceTop(m) { if (!(m > 0)) return { top: 400, step: 100 }; const raw = m / 4, p = 10 ** Math.floor(Math.log10(raw)); const st = [1, 2, 2.5, 5, 10].map(k => k * p).find(s => s >= raw); return { top: Math.ceil(m / st) * st, step: st }; }
const cssVar = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function hash(n) { let t = n * 2654435761 >>> 0; t ^= t >>> 15; t = Math.imul(t, 2246822507) >>> 0; t ^= t >>> 13; return (t >>> 0) / 4294967295; }

// desenha um setor genérico (usado também no login)
function sectorPath(x, ax, ay, ra, rb, ta, tb) { x.beginPath(); x.arc(ax, ay, rb, Math.PI / 2 - tb, Math.PI / 2 - ta); x.arc(ax, ay, ra, Math.PI / 2 - ta, Math.PI / 2 - tb, true); x.closePath(); }

const fan = $('#fan'); let geo = null, sweep = 1, sweepRAF = 0;
function dayVals(ym) { const n = daysIn(ym); const v = Array(n).fill(0), cnt = Array(n).fill(0); for (const e of ofM(ym)) { const i = +e.data.slice(8) - 1; v[i] += e.valor; cnt[i]++; } return { v, cnt, n }; }
function drawFan() {
  if (route.page !== 'mes' || !route.ym) return;
  const ym = route.ym; const { x, w, h } = fit(fan); x.clearRect(0, 0, w, h);
  const { v, n } = dayVals(ym); const max = Math.max(...v); const { top, step } = niceTop(Math.max(max, 400));
  const span = 74 * Math.PI / 180, a0 = -span / 2;
  const R = Math.max(60, Math.min((h - 96) / (1 - 0.17 * Math.cos(span / 2)), (w - 190) / (2 * Math.sin(span / 2))));
  const r0 = R * .17, ax = w / 2 - 24, ay = h - 30 - R;
  geo = { ax, ay, R, r0, span, a0, n };
  const rv = val => r0 + (val / top) * (R - r0);
  const P = (r, t) => [ax + r * Math.sin(t), ay + r * Math.cos(t)];
  const sector = (ra, rb, ta, tb) => sectorPath(x, ax, ay, ra, rb, ta, tb);
  // "tecido" de fundo
  sector(r0, R, a0, -a0); x.save(); x.clip();
  const g = x.createRadialGradient(ax, ay, r0, ax, ay, R); g.addColorStop(0, '#0d0f11'); g.addColorStop(1, '#060708'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.globalAlpha = .07; x.fillStyle = x.createPattern(noise, 'repeat'); x.fillRect(0, 0, w, h); x.globalAlpha = 1; x.restore();
  // anéis de profundidade
  x.lineWidth = 1;
  for (let t = step; t <= top + 1e-6; t += step) { x.strokeStyle = 'rgba(255,255,255,.065)'; x.beginPath(); x.arc(ax, ay, rv(t), Math.PI / 2 + a0, Math.PI / 2 - a0); x.stroke(); }
  x.strokeStyle = 'rgba(255,255,255,.12)'; sector(r0, R, a0, -a0); x.stroke();
  // uma linha por dia
  const slot = span / n, gap = Math.min(slot * .22, .012), shown = Math.floor(sweep * n + 1e-6);
  const today = ym === curYM() ? new Date().getDate() - 1 : n;
  const cal = cssVar('--caliper');
  for (let i = 0; i < n; i++) {
    const ta = a0 + i * slot + gap / 2, tb = a0 + (i + 1) * slot - gap / 2;
    if (i > today) { x.strokeStyle = 'rgba(255,255,255,.035)'; sector(r0, R, ta, tb); x.stroke(); continue; }
    if (i >= shown || !v[i]) continue;
    const hot = i === hoverDay, pinned = pinDay && +pinDay.slice(8) - 1 === i;
    const re = rv(v[i]); sector(r0, re, ta, tb);
    const gg = x.createRadialGradient(ax, ay, r0, ax, ay, R);
    gg.addColorStop(0, hot ? 'rgba(255,255,255,.55)' : 'rgba(220,228,232,.18)'); gg.addColorStop(1, hot ? 'rgba(255,255,255,1)' : 'rgba(236,241,243,.88)');
    x.fillStyle = gg; x.fill();
    x.save(); x.clip(); x.globalCompositeOperation = 'destination-out'; x.globalAlpha = hot ? .25 : .5; x.fillStyle = x.createPattern(noise, 'repeat'); x.fillRect(0, 0, w, h); x.restore();
    x.strokeStyle = hot ? '#fff' : 'rgba(255,255,255,.9)'; x.lineWidth = hot ? 2 : 1.4; x.beginPath(); x.arc(ax, ay, re, Math.PI / 2 - tb, Math.PI / 2 - ta); x.stroke();
    if (pinned) { x.strokeStyle = cal; x.lineWidth = 2; x.beginPath(); x.arc(ax, ay, R + 6, Math.PI / 2 - tb, Math.PI / 2 - ta); x.stroke(); }
  }
  // linha de varredura
  if (sweep < 1) {
    const t = a0 + sweep * span; const [x1, y1] = P(r0, t), [x2, y2] = P(R, t);
    const lg = x.createLinearGradient(x1, y1, x2, y2); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(255,255,255,.75)');
    x.save(); x.shadowColor = 'rgba(255,255,255,.6)'; x.shadowBlur = 12; x.strokeStyle = lg; x.lineWidth = 2; x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke(); x.restore();
  }
  // régua de profundidade em R$
  const rx = Math.min(w - 84, ax + R * Math.sin(span / 2) + 34);
  x.strokeStyle = 'rgba(255,255,255,.18)'; x.lineWidth = 1; x.beginPath(); x.moveTo(rx, ay + r0); x.lineTo(rx, ay + R); x.stroke();
  x.font = '500 10px "Martian Mono", monospace'; x.textBaseline = 'middle'; x.textAlign = 'left';
  for (let t = 0; t <= top + 1e-6; t += step / 5) {
    const yy = ay + rv(t); const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
    x.fillStyle = major ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.25)'; x.fillRect(rx - (major ? 6 : 3), yy - .5, major ? 6 : 3, 1);
    if (major) { x.fillStyle = 'rgba(255,255,255,.42)'; x.fillText(t ? brlK(t) : 'R$ 0', rx + 6, yy); }
  }
  // marcador de foco = média por dia trabalhado
  const worked = v.slice(0, today + 1).filter(Boolean); const avg = worked.length ? worked.reduce((a, b) => a + b, 0) / worked.length : 0;
  if (avg) { const yy = ay + rv(avg); x.fillStyle = cal; x.beginPath(); x.moveTo(rx - 8, yy); x.lineTo(rx - 15, yy - 5); x.lineTo(rx - 15, yy + 5); x.closePath(); x.fill(); }
  // caliper no dia sob o cursor
  if (hoverDay >= 0 && v[hoverDay] && hoverDay < shown) {
    const t = a0 + (hoverDay + .5) * slot; const [cx, cy] = P(rv(v[hoverDay]), t), [bx, by] = P(r0, t);
    x.strokeStyle = cal; x.lineWidth = 1.2; x.setLineDash([2, 3]); x.beginPath(); x.moveTo(bx, by); x.lineTo(cx, cy); x.stroke(); x.setLineDash([]);
    x.lineWidth = 1.6; x.beginPath(); x.moveTo(cx - 6, cy); x.lineTo(cx + 6, cy); x.moveTo(cx, cy - 6); x.lineTo(cx, cy + 6); x.stroke();
    x.beginPath(); x.moveTo(bx - 4, by); x.lineTo(bx + 4, by); x.moveTo(bx, by - 4); x.lineTo(bx, by + 4); x.stroke();
  }
}
function runSweep(animate) {
  cancelAnimationFrame(sweepRAF);
  if (!animate || reduce || document.hidden) { sweep = 1; drawFan(); return; }
  const t0 = performance.now(), D = 720;
  const step = now => { sweep = Math.min(1, easeOut((now - t0) / D)); drawFan(); if (sweep < 1) sweepRAF = requestAnimationFrame(step); };
  sweep = 0; sweepRAF = requestAnimationFrame(step);
}
function fanDayAt(ev) {
  if (!geo || route.page !== 'mes') return -1;
  const rc = fan.getBoundingClientRect(); const dx = ev.clientX - rc.left - geo.ax, dy = ev.clientY - rc.top - geo.ay;
  const r = Math.hypot(dx, dy), t = Math.atan2(dx, dy);
  if (!(r > geo.r0 - 6 && r < geo.R + 14 && Math.abs(t) <= geo.span / 2)) return -1;
  const d = Math.min(geo.n - 1, Math.floor((t - geo.a0) / (geo.span / geo.n)));
  return dayVals(route.ym).v[d] ? d : -1;
}
fan.addEventListener('pointermove', ev => {
  const d = fanDayAt(ev); if (d !== hoverDay) { hoverDay = d; drawFan(); }
  if (d < 0) { hideTip(); return; }
  const day = `${route.ym}-${pad(d + 1)}`; const a = agg(ofM(route.ym).filter(e => e.data === day));
  showTipAt(ev.clientX, ev.clientY, `<div class="t">${DOW[dateOf(day).getDay()]}, ${pad(d + 1)}/${route.ym.slice(5)}</div>
    <div class="rw">Bruto <b>${brl(a.b)}</b></div><div class="rw">Líquido <b>${brl(a.l)}</b></div><div class="rw">Exames <b>${a.n}</b></div><div class="rw">Clique para filtrar</div>`);
});
fan.addEventListener('pointerleave', () => { hoverDay = -1; drawFan(); hideTip(); });
fan.addEventListener('click', ev => {
  const d = fanDayAt(ev); if (d < 0) return;
  const day = `${route.ym}-${pad(d + 1)}`; pinDay = pinDay === day ? '' : day; drawFan(); renderWL(true);
});

// espectro anual: este ano acima da linha de base, ano anterior espelhado abaixo
const dopState = {};
function monthly(y) { return Array.from({ length: 12 }, (_, i) => agg(ofM(`${y}-${pad(i + 1)}`)).b); }
function drawDop(c, y, hi = -1) {
  if (!c.clientWidth) return;
  const { x, w, h } = fit(c); x.clearRect(0, 0, w, h);
  const cur = monthly(y), prv = monthly(y - 1); const lastM = y === new Date().getFullYear() ? new Date().getMonth() : 11;
  const { top } = niceTop(Math.max(...cur, ...prv, 1));
  const L = 70, Rp = 18, base = h * .58, upH = base - 46, dnH = h - base - 26, cw = (w - L - Rp) / 12;
  dopState[c.id] = { L, cw, y, cur, prv };
  const X = i => L + (i + .5) * cw;
  x.strokeStyle = 'rgba(255,255,255,.05)'; x.lineWidth = 1;
  for (const f of [.5, 1]) { x.beginPath(); x.moveTo(L, base - upH * f); x.lineTo(w - Rp, base - upH * f); x.moveTo(L, base + dnH * f); x.lineTo(w - Rp, base + dnH * f); x.stroke(); }
  x.font = '500 10px "Martian Mono", monospace'; x.textBaseline = 'middle'; x.fillStyle = 'rgba(255,255,255,.35)'; x.textAlign = 'right';
  x.fillText(brlK(top), L - 10, base - upH); x.fillText(brlK(top / 2), L - 10, base - upH / 2); x.fillText(brlK(top / 2), L - 10, base + dnH / 2); x.fillText(brlK(top), L - 10, base + dnH);
  function env(vals, last, dir, H) {
    const pts = [[L, 0]]; for (let i = 0; i <= last; i++) pts.push([X(i), vals[i] / top * H]); pts.push([Math.min(w - Rp, X(last) + cw * .5), 0]);
    const p = new Path2D(); p.moveTo(pts[0][0], base);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6, c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      p.bezierCurveTo(c1x, base - dir * Math.max(0, c1y), c2x, base - dir * Math.max(0, c2y), p2[0], base - dir * p2[1]);
    }
    return p;
  }
  function fillSpec(p, dir, H, rgb, so) {
    x.save(); const fp = new Path2D(p); fp.lineTo(L, base); fp.closePath(); x.clip(fp);
    for (let px = L; px < w - Rp; px += 2) { const b = .18 + .82 * Math.pow(hash(px + so), 2); x.fillStyle = `rgba(${rgb},${(b * .55).toFixed(3)})`; if (dir > 0) x.fillRect(px, base - H, 1.4, H); else x.fillRect(px, base, 1.4, H); }
    const g = x.createLinearGradient(0, base, 0, base - dir * H); g.addColorStop(0, `rgba(${rgb},.35)`); g.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = g; x.fillRect(L, Math.min(base, base - dir * H), w, H);
    x.restore(); x.strokeStyle = `rgba(${rgb},.95)`; x.lineWidth = 1.5; x.stroke(p);
  }
  if (prv.some(Boolean)) fillSpec(env(prv, 11, -1, dnH), -1, dnH, '79,141,255', 977);
  if (cur.some(Boolean)) fillSpec(env(cur, lastM, 1, upH), 1, upH, '236,241,243', 13);
  x.strokeStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.moveTo(L, base + .5); x.lineTo(w - Rp, base + .5); x.stroke();
  const cal = cssVar('--caliper'); const cm = c.id === 'dop' && route.ym && route.ym.startsWith(y + '-') ? +route.ym.slice(5) - 1 : -1;
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  for (let i = 0; i < 12; i++) { x.fillStyle = i === cm ? cal : i === hi ? '#fff' : 'rgba(255,255,255,.4)'; x.fillText(MES[i], X(i), h - 8); }
  for (const [i, col] of [[cm, cal], [hi, 'rgba(255,255,255,.7)']]) {
    if (i < 0) continue;
    x.strokeStyle = col; x.lineWidth = 1; x.beginPath(); x.moveTo(X(i), base - upH - 6); x.lineTo(X(i), base + dnH + 2); x.stroke();
    if (i <= lastM && cur[i]) { x.fillStyle = col; x.beginPath(); x.arc(X(i), base - cur[i] / top * upH, 4, 0, 7); x.fill(); }
  }
}
function wireDop(c, onPick) {
  const idx = ev => { const s = dopState[c.id]; if (!s) return -1; const i = Math.floor((ev.clientX - c.getBoundingClientRect().left - s.L) / s.cw); return i >= 0 && i < 12 ? i : -1; };
  c.addEventListener('pointermove', ev => {
    const s = dopState[c.id]; const i = idx(ev); drawDop(c, s.y, i);
    if (i < 0) { hideTip(); return; }
    const d = s.prv[i] && s.cur[i] ? (s.cur[i] - s.prv[i]) / s.prv[i] * 100 : null;
    showTipAt(ev.clientX, ev.clientY, `<div class="t">${MESL[i]}</div><div class="rw"><span><i></i>${s.y}</span><b>${brl(s.cur[i])}</b></div><div class="rw"><span><i class="p"></i>${s.y - 1}</span><b>${brl(s.prv[i])}</b></div>${d !== null ? `<div class="rw">Variação <b style="color:var(--${d >= 0 ? 'up' : 'down'})">${d >= 0 ? '▲' : '▼'} ${N1.format(Math.abs(d))}%</b></div>` : ''}`);
  });
  c.addEventListener('pointerleave', () => { hideTip(); const s = dopState[c.id]; if (s) drawDop(c, s.y); });
  c.addEventListener('click', ev => { const s = dopState[c.id]; const i = idx(ev); if (i >= 0) onPick(`${s.y}-${pad(i + 1)}`); });
}

/* ============================================================
   TELA: MÊS
   ============================================================ */
function deltaChip(cur, prev, label) {
  if (!prev) return '';
  const p = (cur - prev) / prev * 100;
  if (Math.abs(p) < .5) return `<span class="delta flat">=</span><span>${esc(label)}</span>`;
  return `<span class="delta ${p > 0 ? 'up' : 'down'}">${p > 0 ? '▲' : '▼'} ${N1.format(Math.abs(p))}%</span><span>${esc(label)}</span>`;
}
function renderMes(dir, { sweepIt = true } = {}) {
  const ym = route.ym; const Y = +ym.slice(0, 4), M = +ym.slice(5);
  const rapid = !!dir && performance.now() - lastNav < 320; if (dir) lastNav = performance.now();
  // título desliza na direção da navegação (sem animar em navegação rápida pelo teclado)
  const h1 = $('#mtitle'); const html = `<span class="inner">${MESL[M - 1]} <span class="yr">${Y}</span></span>`;
  const old = h1.firstElementChild;
  if (dir && old && !reduce && !rapid) {
    old.getAnimations().forEach(a => a.cancel());
    old.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${-dir * 24}px)`, opacity: 0 }], { duration: 120, easing: 'ease-in' }).onfinish = () => {
      h1.innerHTML = html; h1.firstElementChild.animate([{ transform: `translateX(${dir * 24}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.23,1,.32,1)' });
    };
  } else h1.innerHTML = html;
  $('#prev').disabled = ym <= minYM(); $('#next').disabled = ym >= curYM();
  renderCine();
  const list = ofM(ym), a = agg(list);
  const isCur = ym === curYM(), pym = shiftYM(ym, -1); let pl = ofM(pym); let lab = `vs ${MESL[+pym.slice(5) - 1].toLowerCase()}`;
  if (isCur) { const dd = todayISO().slice(8); pl = pl.filter(e => e.data.slice(8) <= dd); lab = `vs ${MES[+pym.slice(5) - 1]} até dia ${+dd}`; }
  const p = agg(pl);
  const [ip, cp] = N2.format(a.l).split(','); setRoll($('#hero'), ip, !rapid); setRoll($('#cents'), ',' + cp, !rapid);
  $('#herosub').innerHTML = deltaChip(a.l, p.l, lab) || `<span class="dim">${list.length ? 'sem mês anterior para comparar' : 'nenhum exame lançado'}</span>`;
  const { v } = dayVals(ym); const today = isCur ? new Date().getDate() - 1 : v.length - 1;
  const worked = v.slice(0, today + 1).filter(Boolean); const avg = worked.length ? worked.reduce((s, x) => s + x, 0) / worked.length : 0;
  let best = -1; v.forEach((x, i) => { if (x && (best < 0 || x > v[best])) best = i; });
  const row = (k, val, extra = '', cls = '') => `<div class="row"><span class="k">${k}</span><span class="lead"></span><span class="v ${cls}">${val}${extra}</span></div>`;
  const pct = (c, pv) => pv ? ` <small>${c >= pv ? '▲' : '▼'} ${N1.format(Math.abs((c - pv) / pv * 100))}%</small>` : '';
  $('#meas').innerHTML =
    row('Bruto', brl(a.b), pct(a.b, p.b)) +
    row('Taxas de cartão', a.t ? '−' + brl(a.t) : '—') +
    row('Exames', a.n, pct(a.n, p.n)) +
    row('Atendimentos', a.at, a.at ? ` <small>ticket ${brl(a.b / a.at)}</small>` : '') +
    row('Média por dia trabalhado', '▸ ' + brl(avg), '', 'focal') +
    row('Melhor dia', best >= 0 ? `${pad(best + 1)}/${ym.slice(5)} · ${brl(v[best])}` : '—');
  // formas de pagamento
  const pm = new Map(); for (const e of list) { const k = e.pagamento || ''; const o = pm.get(k) || { s: 0, n: 0 }; o.s += e.valor; o.n++; pm.set(k, o); }
  const pmax = Math.max(1, ...[...pm.values()].map(o => o.s));
  $('#mix').innerHTML = [...pm.entries()].sort((x, y) => y[1].s - x[1].s).map(([k, o]) =>
    `<div class="it"><span class="nm">${pagNome(k)}</span><div class="track"><div class="fill" style="transform:scaleX(${o.s / pmax})"></div></div><span class="vv"><b>${brl(o.s)}</b> · ${N0.format(o.s / (a.b || 1) * 100)}%</span></div>`).join('') || '<span class="dim">Sem lançamentos</span>';
  // anotações estilo aparelho
  const us = list.filter(e => e.proc !== 'MG').length;
  $('#ann-tl').innerHTML = `<b>${MES[M - 1]} ${Y}</b> · ${a.n} ex · ${a.at} atd<br>${us} US · ${a.n - us} MG<br>1 linha = 1 dia · profundidade = bruto`;
  $('#ann-tr').innerHTML = `Bruto <b>${brl(a.b)}</b><br>Taxas <b>${a.t ? '−' + brl(a.t) : '—'}</b><br>Líq <b>${brl(a.l)}</b>`;
  $('#ann-bl').innerHTML = avg ? `<span class="cal">▸ foco</span> média/dia ${brl(avg)}` : '';
  $('#fan-empty').hidden = list.length > 0;
  runSweep(sweepIt && !rapid);
  drawDop($('#dop'), Y); $('#lg-y').textContent = Y; $('#lg-p').textContent = Y - 1; $('#spec-title').textContent = `Espectro anual · ${Y} · clique num mês`;
  $('#exp-mes').href = `/api/export.csv?de=${ym}-01&ate=${ym}-${daysIn(ym)}&nome=ganhos-${ym}`;
  renderWL(); renderRank();
}
function renderCine() {
  const months = []; const start = shiftYM(curYM(), -23) > minYM() ? shiftYM(curYM(), -23) : minYM();
  for (let m = start; m <= curYM(); m = shiftYM(m, 1)) months.push(m);
  const vals = months.map(m => agg(ofM(m)).b); const mx = Math.max(...vals, 1);
  const el = $('#cine');
  el.innerHTML = months.map((m, i) => `<button data-ym="${m}" aria-current="${m === route.ym}" data-tip="${MESL[+m.slice(5) - 1]} ${m.slice(0, 4)} · ${brl(vals[i])}" aria-label="${MESL[+m.slice(5) - 1]} ${m.slice(0, 4)}" class="press"><span class="b" style="height:${Math.max(3, vals[i] / mx * 30)}px"></span><span class="l">${MES[+m.slice(5) - 1][0].toUpperCase()}</span></button>`).join('');
  months.forEach((m, i) => { if (m.endsWith('-01') && i > 0) { const b = el.children[i]; const s = document.createElement('span'); s.className = 'yr'; s.textContent = m.slice(0, 4); s.style.left = b.offsetLeft + 'px'; el.appendChild(s); } });
}
function goMonth(ym) {
  if (ym < minYM() || ym > curYM() || ym === route.ym) return;
  history.replaceState(null, '', '#/mes/' + ym); applyRoute();
}

/* ---------- worklist ---------- */
const ICON_E = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M10.5 2.5l3 3L6 13H3v-3z"/></svg>';
const ICON_D = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5"/></svg>';
function wlList() {
  const nq = norm(q.trim());
  return ofM(route.ym).filter(e => (!nq || norm(e.exame).includes(nq) || norm(e.medico).includes(nq)) && (!pinDay || e.data === pinDay) && (!filt || e[filt.k] === filt.v))
    .sort((a, b) => b.data.localeCompare(a.data) || b.created_at - a.created_at);
}
function renderWL(scroll) {
  const l = wlList(); const by = new Map(); for (const e of l) { if (!by.has(e.data)) by.set(e.data, []); by.get(e.data).push(e); }
  const focusedId = document.activeElement && document.activeElement.closest && document.activeElement.closest('#wl .r') ? document.activeElement.dataset.id : null;
  $('#wl').innerHTML = l.length ? [...by.entries()].map(([d, es]) => {
    const a = agg(es); const dt = dateOf(d);
    return `<div class="day" role="presentation"><span class="d">${DOW[dt.getDay()]} <b>${d.slice(8)}</b> ${MES[dt.getMonth()]}</span><span class="t">${a.n} ex · <b>${brl(a.b)}</b></span></div>` +
      es.map(e => `<div class="r${fresh.has(e.id) ? ' ghost' : ''}${e.pending ? ' pending' : ''}" data-id="${esc(e.id)}" tabindex="0" role="listitem" aria-label="${esc(e.exame)}, ${esc(e.medico)}, ${brl(e.valor)}">
        <div class="ex"><span class="tg${e.proc === 'MG' ? ' mg' : ''}">${e.proc}</span><span>${esc(e.exame)}</span></div>
        <span class="md">${esc(e.medico)}</span><span class="pg">${pagNome(e.pagamento)}${e.taxa ? ` · ${N1.format(e.taxa)}%` : ''}</span>
        <span class="vl">${brl(e.valor)}${e.taxa ? `<small>${brl(liq(e))}</small>` : ''}</span>
        <span class="ac"><button class="ib hit" data-act="edit" data-tip="Editar" data-kbd="↵" aria-label="Editar">${ICON_E}</button><button class="ib del hit" data-act="del" data-tip="Excluir" data-kbd="Del" aria-label="Excluir">${ICON_D}</button></span></div>`).join('');
  }).join('') : `<div class="empty">${q || pinDay || filt ? 'Nenhum exame com esses filtros' : 'Nenhum exame neste mês · pressione <kbd>N</kbd> para lançar'}</div>`;
  fresh.clear();
  if (focusedId) { const r = $(`#wl .r[data-id="${CSS.escape(focusedId)}"]`); if (r) r.focus({ preventScroll: true }); }
  const a = agg(l); $('#wl-foot').innerHTML = `<span>${plural(a.n, 'exame')} · ${plural(a.at, 'atendimento')}${q || pinDay || filt ? ' (filtrado)' : ''}</span><span>bruto <b>${brl(a.b)}</b> · líquido <b>${brl(a.l)}</b></span>`;
  const chips = []; if (pinDay) chips.push(['day', `Dia ${pinDay.slice(8)}/${pinDay.slice(5, 7)}`]); if (filt) chips.push(['f', filt.v]);
  $('#chips').innerHTML = chips.map(([k, t]) => `<span class="chip">${esc(t)}<button data-unchip="${k}" aria-label="Remover filtro ${esc(t)}">✕</button></span>`).join('');
  if (scroll) $('#wl').closest('.card').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
}
$('#q').addEventListener('input', e => { q = e.target.value; renderWL(); });
$('#q').addEventListener('keydown', e => { if (e.key === 'Escape') { if (q) { q = ''; e.target.value = ''; renderWL(); } else e.target.blur(); } if (e.key === 'ArrowDown' || e.key === 'Enter') { const r = $('#wl .r'); if (r) { e.preventDefault(); r.focus(); } } });
$('#chips').addEventListener('click', e => { const b = e.target.closest('[data-unchip]'); if (!b) return; if (b.dataset.unchip === 'day') { pinDay = ''; drawFan(); } else { filt = null; renderRank(); } renderWL(); });
$('#wl').addEventListener('click', e => {
  const row = e.target.closest('.r'); if (!row || row.classList.contains('pending')) return;
  const act = e.target.closest('[data-act]');
  if (act && act.dataset.act === 'del') deleteEntries([row.dataset.id]);
  else openSheet({ mode: 'edit', entry: entries.find(x => x.id === row.dataset.id) });
});
$('#wl').addEventListener('keydown', e => {
  const row = e.target.closest('.r'); if (!row || e.target !== row) return;
  if (e.key === 'Enter') { e.preventDefault(); openSheet({ mode: 'edit', entry: entries.find(x => x.id === row.dataset.id) }); }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteEntries([row.dataset.id]); }
});
function moveRow(d) {
  const rows = $$('#wl .r'); if (!rows.length) return;
  const i = rows.indexOf(document.activeElement);
  const n = rows[i < 0 ? (d > 0 ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, i + d))];
  n.focus({ preventScroll: true }); n.scrollIntoView({ block: 'nearest' });
}

/* ---------- ranking (sliders de TGC) ---------- */
function renderRank() {
  const m = new Map(); for (const e of ofM(route.ym)) { const o = m.get(e[rkKey]) || { n: 0, s: 0 }; o.n++; o.s += e.valor; m.set(e[rkKey], o); }
  const rows = [...m.entries()].sort((a, b) => b[1].s - a[1].s).slice(0, 8); const mx = Math.max(1, ...rows.map(r => r[1].s));
  $('#rk').innerHTML = rows.length ? rows.map(([k, o]) => {
    const on = filt && filt.k === rkKey && filt.v === k;
    return `<div class="row" data-v="${esc(k)}" role="button" tabindex="0" aria-pressed="${!!on}"><span class="nm">${esc(k)}</span><span class="vv"><b>${brl(o.s)}</b> · ${o.n}×</span>
      <div class="sl" aria-hidden="true"><span class="fl" style="width:${o.s / mx * 100}%"></span><span class="kn" style="left:${o.s / mx * 100}%"></span></div></div>`;
  }).join('') : '<div class="empty">Sem dados neste mês</div>';
  slide($('#rk-seg'), '[aria-pressed="true"]');
}
$('#rk-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; rkKey = b.dataset.k; $$('#rk-seg button').forEach(x => x.setAttribute('aria-pressed', x === b)); renderRank(); });
$('#rk').addEventListener('click', e => { const r = e.target.closest('.row'); if (!r) return; filt = filt && filt.v === r.dataset.v ? null : { k: rkKey, v: r.dataset.v }; renderRank(); renderWL(true); });
$('#rk').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('row')) { e.preventDefault(); e.target.click(); } });
$('#cine').addEventListener('click', e => { const b = e.target.closest('button'); if (b) goMonth(b.dataset.ym); });
$('#prev').addEventListener('click', () => goMonth(shiftYM(route.ym, -1)));
$('#next').addEventListener('click', () => goMonth(shiftYM(route.ym, 1)));
wireDop($('#dop'), m => goMonth(m));

/* ============================================================
   TELA: ANO
   ============================================================ */
function renderAno() {
  const y = route.y, curY = new Date().getFullYear(); const minY = +minYM().slice(0, 4);
  $('#ytitle').innerHTML = `<span class="inner">${y}</span>`; $('#yprev').disabled = y <= minY; $('#ynext').disabled = y >= curY;
  $('#exp-ano').href = `/api/export.csv?de=${y}-01-01&ate=${y}-12-31&nome=ganhos-${y}`;
  const isCur = y === curY; const corte = isCur ? todayISO().slice(5) : '12-31';
  const list = entries.filter(e => e.data.startsWith(y + '-')), a = agg(list);
  const p = agg(entries.filter(e => e.data.startsWith((y - 1) + '-') && e.data.slice(5) <= corte));
  const last = isCur ? new Date().getMonth() : 11;
  const ms = Array.from({ length: last + 1 }, (_, i) => agg(ofM(`${y}-${pad(i + 1)}`)));
  const ativos = ms.filter(m => m.n); let best = -1; ms.forEach((m, i) => { if (m.b && (best < 0 || m.b > ms[best].b)) best = i; });
  const dl = (c, pv) => { if (!pv) return ''; const d = (c - pv) / pv * 100; return `<span class="delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${N1.format(Math.abs(d))}%</span>`; };
  $('#ykpis').innerHTML = `
    <div><span class="eyebrow">Bruto${isCur ? ' até hoje' : ''}</span><span class="v">${brl(a.b)}</span><small>${dl(a.b, p.b)} ${p.b ? `vs ${y - 1}${isCur ? ' no mesmo período' : ''}` : ''}</small></div>
    <div><span class="eyebrow">Líquido</span><span class="v">${brl(a.l)}</span><small>taxas ${a.t ? '−' + brl(a.t) : '—'}</small></div>
    <div><span class="eyebrow">Exames</span><span class="v">${N0.format(a.n)}</span><small>${dl(a.n, p.n)} ${plural(a.at, 'atendimento')}</small></div>
    <div><span class="eyebrow">Média mensal</span><span class="v">${brl(ativos.length ? a.b / ativos.length : 0)}</span><small>${plural(ativos.length, 'mês com movimento', 'meses com movimento')}</small></div>
    <div><span class="eyebrow">Melhor mês</span><span class="v">${best >= 0 ? MESL[best] : '—'}</span><small>${best >= 0 ? brl(ms[best].b) : ''}</small></div>`;
  drawDop($('#dop2'), y); $('#lg-y2').textContent = y; $('#lg-p2').textContent = y - 1;
  const rows = ms.map((m, i) => {
    const pm = agg(ofM(`${y - 1}-${pad(i + 1)}`).filter(e => !(isCur && i === last) || e.data.slice(8) <= todayISO().slice(8)));
    return `<tr data-ym="${y}-${pad(i + 1)}" tabindex="0"><td>${MESL[i]}</td><td>${m.n || '<span class="dim">—</span>'}</td><td>${m.n ? brl(m.b) : '<span class="dim">—</span>'}</td><td class="dim">${m.t ? '−' + brl(m.t) : '—'}</td><td>${m.n ? brl(m.l) : '<span class="dim">—</span>'}</td><td>${m.b && pm.b ? dl(m.b, pm.b) : '<span class="dim">—</span>'}</td></tr>`;
  }).reverse();
  $('#ytable').innerHTML = `<caption>Mês a mês</caption><thead><tr><th>Mês</th><th>Exames</th><th>Bruto</th><th>Taxas</th><th>Líquido</th><th>vs ${y - 1}</th></tr></thead><tbody>${rows.join('')}</tbody>
    <tfoot><tr><td>Total</td><td>${a.n}</td><td>${brl(a.b)}</td><td class="dim">${a.t ? '−' + brl(a.t) : '—'}</td><td>${brl(a.l)}</td><td></td></tr></tfoot>`;
  const anos = [...new Set(entries.map(e => +e.data.slice(0, 4)))].sort((x, z) => z - x);
  $('#yall').innerHTML = `<caption>Todos os anos</caption><thead><tr><th>Ano</th><th>Exames</th><th>Bruto</th><th>Líquido</th></tr></thead><tbody>${anos.map(yy => { const g = agg(entries.filter(e => e.data.startsWith(yy + '-'))); return `<tr data-y="${yy}" tabindex="0"><td>${yy}${yy === curY ? ' <span class="dim">até hoje</span>' : ''}</td><td>${g.n}</td><td>${brl(g.b)}</td><td>${brl(g.l)}</td></tr>`; }).join('') || '<tr><td colspan="4" class="dim">Sem lançamentos</td></tr>'}</tbody>`;
}
function openRow(r) { if (r.dataset.ym) location.hash = '#/mes/' + r.dataset.ym; else if (r.dataset.y) location.hash = '#/ano/' + r.dataset.y; }
for (const id of ['#ytable', '#yall']) {
  $(id).addEventListener('click', e => { const r = e.target.closest('tbody tr[data-ym],tbody tr[data-y]'); if (r) openRow(r); });
  $(id).addEventListener('keydown', e => { const r = e.target.closest('tbody tr'); if (r && e.key === 'Enter') openRow(r); });
}
function goYear(y) { history.replaceState(null, '', '#/ano/' + y); applyRoute(); }
$('#yprev').addEventListener('click', () => goYear(route.y - 1));
$('#ynext').addEventListener('click', () => goYear(route.y + 1));
wireDop($('#dop2'), m => { location.hash = '#/mes/' + m; });

/* ============================================================
   TELA: AJUSTES
   ============================================================ */
function renderAjustes() {
  const t = settings.taxas;
  $('#taxgrid').innerHTML = CARTOES.map(k => `<label><span class="eyebrow">${k === 'credito' ? 'Crédito à vista' : PAG[k]}</span><span class="pct"><input class="inp" name="${k}" inputmode="decimal" value="${N2.format(t[k] || 0)}" aria-label="Taxa ${PAG[k]} em %"></span></label>`).join('');
  $('#taxas-badge').hidden = settings.taxasConferidas;
  loadAjustesExtras();
}
async function loadAjustesExtras() {
  try {
    const b = await api('GET', '/api/backup/status');
    $('#backup-status').innerHTML = b.ultimo ? `Último backup automático: <b class="num">${b.ultimo.split('-').reverse().join('/')}</b> · ${plural(b.quantidade, 'cópia guardada', 'cópias guardadas')}` : 'O primeiro backup automático sai logo após o servidor iniciar.';
  } catch (e) { $('#backup-status').textContent = 'Não foi possível verificar os backups.'; }
  try {
    const tr = await api('GET', '/api/trash');
    $('#trash').innerHTML = tr.length ? `<div class="trash">${tr.map(e => `<div class="r" data-id="${esc(e.id)}"><span class="pg">${e.data.split('-').reverse().join('/')}</span>
      <div class="ex"><span class="tg${e.proc === 'MG' ? ' mg' : ''}">${e.proc}</span><span>${esc(e.exame)}</span></div><span class="md">${esc(e.medico)}</span>
      <span class="vl">${brl(e.valor)}</span><span style="text-align:right"><button class="ghostbtn press" data-restore>Restaurar</button></span></div>`).join('')}</div>`
      : '<div class="empty">Lixeira vazia</div>';
  } catch (e) { $('#trash').innerHTML = '<div class="empty">Não foi possível carregar.</div>'; }
}
$('#trash').addEventListener('click', async e => {
  const b = e.target.closest('[data-restore]'); if (!b) return; const row = b.closest('.r'); const id = row.dataset.id;
  row.style.height = row.offsetHeight + 'px'; void row.offsetHeight; row.classList.add('gone');
  try { await api('POST', '/api/entries/restore', { ids: [id] }); await loadEntries(); toast('Exame restaurado', '', null); setTimeout(loadAjustesExtras, 260); }
  catch (err) { toast(err.message, '', null, { error: true }); loadAjustesExtras(); }
});
$('#taxas-form').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target, err = $('#taxas-err'), btn = $('#taxas-save'); err.textContent = '';
  const taxas = {}; for (const k of CARTOES) taxas[k] = parseMoney(f[k].value);
  btn.disabled = true;
  try {
    await api('PUT', '/api/settings', { taxas }); settings = await api('GET', '/api/settings');
    btn.textContent = 'Salvo ✓'; setTimeout(() => { btn.textContent = 'Salvar taxas'; }, 1600);
    $('#taxas-badge').hidden = true; $('#aj-dot').hidden = true; renderAjustes();
  } catch (x) { err.textContent = x.message; }
  finally { btn.disabled = false; }
});
$('#logout').addEventListener('click', async () => { try { await api('POST', '/api/logout'); } catch (e) { /* ignora */ } location.reload(); });
// ação perigosa com confirmação no próprio botão (sem diálogo)
let armTimer = 0;
$('#logout-all').addEventListener('click', async e => {
  const b = e.currentTarget;
  if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Clique de novo para confirmar'; clearTimeout(armTimer); armTimer = setTimeout(() => { delete b.dataset.armed; b.textContent = 'Sair de todos os dispositivos'; }, 3000); return; }
  try { await api('POST', '/api/logout-all'); } catch (x) { /* ignora */ } location.reload();
});

/* ============================================================
   FOLHA DE LANÇAMENTO / EDIÇÃO
   ============================================================ */
const ov = $('#ov'), form = $('#sheet');
let sheet = { mode: 'add' }, payVal = '', lastFocus = null;
function combobox(input, optionsFn, onPick) {
  const box = input.closest('.cb'); let ul = null, items = [], act = 0;
  const close = () => { if (ul) { ul.remove(); ul = null; } input.setAttribute('aria-expanded', 'false'); };
  const hl = s => { const nq = norm(input.value.trim()); if (!nq) return esc(s); const i = norm(s).indexOf(nq); return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + nq.length)) + '</mark>' + esc(s.slice(i + nq.length)); };
  const paint = () => { ul.innerHTML = items.map((o, i) => `<li role="option" data-i="${i}" aria-selected="${i === act}"><span>${hl(o.label)}</span>${o.meta ? `<span class="p">${o.meta}</span>` : ''}</li>`).join(''); const a = ul.children[act]; if (a) a.scrollIntoView({ block: 'nearest' }); };
  const open = () => {
    const nq = norm(input.value.trim());
    items = optionsFn().filter(o => !nq || norm(o.label).includes(nq)).slice(0, 9);
    if (!items.length || (items.length === 1 && items[0].label === input.value)) { close(); return; }
    act = Math.min(act, items.length - 1);
    if (!ul) {
      ul = document.createElement('ul'); ul.className = 'lb'; ul.setAttribute('role', 'listbox'); box.appendChild(ul);
      ul.addEventListener('mousedown', e => { const li = e.target.closest('li'); if (li) { e.preventDefault(); pick(+li.dataset.i); } });
      ul.addEventListener('mousemove', e => { const li = e.target.closest('li'); if (li && +li.dataset.i !== act) { act = +li.dataset.i; paint(); } });
    }
    paint(); input.setAttribute('aria-expanded', 'true');
  };
  const pick = i => { const o = items[i]; if (!o) return; input.value = o.label; close(); onPick(o); };
  input.addEventListener('input', () => { act = 0; open(); input.classList.remove('err'); updateTotals(); });
  input.addEventListener('focus', open); input.addEventListener('blur', () => setTimeout(close, 90));
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!ul) open(); else { act = (act + 1) % items.length; paint(); } }
    else if (e.key === 'ArrowUp' && ul) { e.preventDefault(); act = (act - 1 + items.length) % items.length; paint(); }
    else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && ul && items.length) { e.preventDefault(); e.stopPropagation(); pick(act); }
    else if (e.key === 'Escape' && ul) { e.stopPropagation(); e.preventDefault(); close(); }
    else if (e.key === 'Tab' && ul && items.length && input.value.trim() && !e.shiftKey) { pick(act); }
  });
}
function addRow({ ex = '', vl = '', focus = true } = {}) {
  const d = document.createElement('div'); d.className = 'exrow';
  d.innerHTML = `<div class="cb"><input class="inp" name="ex" placeholder="Exame — digite para buscar" role="combobox" aria-expanded="false" aria-label="Exame"></div>
    <div class="money"><input class="inp" name="vl" inputmode="decimal" placeholder="0,00" aria-label="Valor"><span class="lp" hidden>último valor cobrado</span></div>
    <button type="button" class="x press" aria-label="Remover exame" data-tip="Remover exame">✕</button>`;
  $('#f-rows').appendChild(d);
  const exI = d.querySelector('[name=ex]'), vlI = d.querySelector('[name=vl]'), lp = d.querySelector('.lp');
  exI.value = ex; vlI.value = vl;
  combobox(exI, () => exameOptions().map(e => { const p = lastPrice(e); return { label: e, meta: p ? brl(p) : '' }; }), o => {
    const p = lastPrice(o.label);
    if (p && (!vlI.value || sheet.mode === 'add')) { vlI.value = N2.format(p); lp.hidden = false; }
    vlI.focus(); vlI.select(); updateTotals();
  });
  vlI.addEventListener('input', () => { vlI.classList.remove('err'); lp.hidden = true; updateTotals(); });
  vlI.addEventListener('focus', () => vlI.select());
  vlI.addEventListener('blur', () => { const n = parseMoney(vlI.value); if (n > 0) vlI.value = N2.format(n); });
  vlI.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); $('#f-med').value ? $('#pay button[tabindex="0"]').focus() : $('#f-med').focus(); } });
  d.querySelector('.x').addEventListener('click', () => {
    if ($$('#f-rows .exrow').length > 1) {
      if (reduce) { d.remove(); updateTotals(); return; }
      d.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-4px)' }], { duration: 140, easing: 'ease-in' }).onfinish = () => { d.remove(); updateTotals(); };
    } else { exI.value = ''; vlI.value = ''; lp.hidden = true; updateTotals(); exI.focus(); }
  });
  if (focus) exI.focus();
}
combobox($('#f-med'), () => freq('medico').map(m => ({ label: m })), () => { $('#pay button[tabindex="0"]').focus(); });
$('#f-med').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && $('#f-med').getAttribute('aria-expanded') !== 'true') { e.preventDefault(); $('#pay button[tabindex="0"]').focus(); } });
$('#pay').innerHTML = PAGK.map((k, i) => `<button type="button" role="radio" aria-checked="false" data-k="${k}" tabindex="${i ? -1 : 0}"><span class="n">${i + 1}</span>${PAG[k]}</button>`).join('') + '<span class="ind"></span>';
function defaultTaxa(k) { if (!CARTOES.includes(k)) return 0; if (sheet.mode === 'edit' && sheet.entry && sheet.entry.pagamento === k) return sheet.entry.taxa || 0; return settings.taxas[k] || 0; }
function setPay(k, focus) {
  payVal = k;
  $$('#pay button').forEach(b => { const on = b.dataset.k === k; b.setAttribute('aria-checked', on); b.tabIndex = on || (!k && b === $('#pay button')) ? 0 : -1; if (on && focus) b.focus(); });
  $('#pay').classList.remove('err'); slide($('#pay'), '[aria-checked="true"]');
  const t = $('#taxa');
  if (CARTOES.includes(k)) {
    t.innerHTML = `Taxa da maquininha <span class="pct"><input class="inp" id="f-taxa" inputmode="decimal" value="${N2.format(defaultTaxa(k))}" aria-label="Taxa da maquininha em %"></span><span>${settings.taxasConferidas ? 'padrão de Ajustes' : '<span style="color:var(--caliper)">confira as taxas em Ajustes</span>'}</span>`;
    $('#f-taxa').addEventListener('input', updateTotals);
    $('#f-taxa').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.ctrlKey) { e.preventDefault(); form.requestSubmit(); } });
  } else t.innerHTML = k ? 'Sem taxa — entra 100% líquido' : '';
  updateTotals();
}
$('#pay').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setPay(b.dataset.k); });
$('#pay').addEventListener('keydown', e => {
  const i = PAGK.indexOf(payVal);
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const n = i < 0 ? 0 : (i + (e.key === 'ArrowRight' ? 1 : -1) + PAGK.length) % PAGK.length; setPay(PAGK[n], true); }
  else if (/^[1-5]$/.test(e.key)) { e.preventDefault(); setPay(PAGK[+e.key - 1], true); }
  else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); if (!payVal) { const b = e.target.closest('button'); if (b) setPay(b.dataset.k, true); } else form.requestSubmit(); }
});
function sheetRows() { return $$('#f-rows .exrow').map(d => ({ d, ex: d.querySelector('[name=ex]').value.trim(), vl: parseMoney(d.querySelector('[name=vl]').value) })); }
function curTaxa() { const el = $('#f-taxa'); if (!el || !CARTOES.includes(payVal)) return 0; const t = parseMoney(el.value); return t >= 0 ? t : 0; }
function updateTotals() {
  const b = sheetRows().reduce((s, r) => s + (r.vl > 0 ? r.vl : 0), 0); const t = curTaxa(); const tx = r2(b * t / 100);
  $('#t-bruto').textContent = brl(b); $('#t-taxa').textContent = t ? `−${brl(tx)}` : '—';
  setRoll($('#t-liq'), brl(b - tx), true);
}
function openSheet(opts = { mode: 'add' }) {
  if (!ov.hidden) return;
  sheet = opts; lastFocus = document.activeElement; hideTip();
  const edit = opts.mode === 'edit', e = opts.entry, dr = opts.draft;
  if (edit && !e) return;
  $('#sheet-t').textContent = edit ? 'Editar exame' : 'Novo atendimento';
  $('#ex-lab').textContent = edit ? 'Exame' : 'Exames';
  $('#f-add').hidden = edit; $('#f-del').hidden = !edit;
  $('#f-save').firstChild.textContent = edit ? 'Salvar alterações ' : 'Salvar ';
  $('#f-rows').innerHTML = ''; $('#ferr').textContent = '';
  if (edit) addRow({ ex: e.exame, vl: N2.format(e.valor), focus: false });
  else if (dr) dr.rows.forEach(r => addRow({ ex: r.ex, vl: r.vl > 0 ? N2.format(r.vl) : '', focus: false }));
  else addRow({ focus: false });
  $$('#f-rows .x').forEach(x => { x.hidden = edit; });
  $('#f-med').value = edit ? e.medico : dr ? dr.med : '';
  $('#f-data').value = edit ? e.data : dr ? dr.data : todayISO();
  $('#f-data').max = todayISO();
  setRoll($('#t-liq'), brl(0), false);
  setPay(edit ? (e.pagamento || '') : dr ? dr.pag : '');
  if (dr && dr.taxa != null && $('#f-taxa')) $('#f-taxa').value = N2.format(dr.taxa);
  updateTotals();
  ov.hidden = false; ov.classList.remove('out'); document.body.classList.add('sheet-open');
  requestAnimationFrame(() => { ov.classList.add('on'); slide($('#pay'), '[aria-checked="true"]'); const f = $('#f-rows [name=ex]'); f.focus(); if (edit) f.select(); });
}
function closeSheet() {
  if (ov.hidden || ov.classList.contains('out')) return;
  ov.classList.add('out'); ov.classList.remove('on'); document.body.classList.remove('sheet-open');
  setTimeout(() => { ov.hidden = true; ov.classList.remove('out'); $('#sheet').style.transform = ''; }, reduce ? 0 : 200);
  if (lastFocus && lastFocus.isConnected && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}
$('#open-sheet').addEventListener('click', () => openSheet());
$('#f-add').addEventListener('click', () => addRow());
$('#f-del').addEventListener('click', () => { const id = sheet.entry.id; closeSheet(); deleteEntries([id]); });
ov.addEventListener('mousedown', e => { if (e.target === ov) closeSheet(); });
form.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); return; }
  if (e.altKey && (e.key === '+' || e.key === '=') && sheet.mode === 'add') { e.preventDefault(); addRow(); return; }
  if (e.key === 'Tab') { // mantém o foco dentro da folha
    const f = $$('#sheet input, #sheet button').filter(x => x.offsetParent && x.tabIndex >= 0 && !x.disabled);
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i === 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  }
});
// gaveta arrastável no celular (Vaul): puxar para baixo fecha
(() => {
  let y0 = 0, t0 = 0, dy = 0, drag = false;
  const sh = $('#sheet'), mq = matchMedia('(max-width:720px)');
  sh.addEventListener('pointerdown', e => { if (!mq.matches || e.pointerType === 'mouse' || !e.target.closest('.grab,.sh')) return; drag = true; y0 = e.clientY; t0 = performance.now(); sh.style.transition = 'none'; sh.setPointerCapture(e.pointerId); });
  sh.addEventListener('pointermove', e => { if (!drag) return; dy = Math.max(0, e.clientY - y0); sh.style.transform = `translateY(${dy}px)`; });
  sh.addEventListener('pointerup', () => { if (!drag) return; drag = false; sh.style.transition = ''; const v = dy / (performance.now() - t0);
    if (dy > 120 || v > .5) closeSheet(); else sh.style.transform = ''; dy = 0; });
})();
form.addEventListener('submit', async e => {
  e.preventDefault(); const err = $('#ferr'); err.textContent = '';
  const rs = sheetRows().filter(r => r.ex || r.vl), med = $('#f-med').value.trim(), day = $('#f-data').value;
  const fail = (m, el) => { err.textContent = m; if (el) { el.classList.add('err'); el.focus(); if (!reduce) el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }], { duration: 260, easing: 'ease-out' }); } };
  if (!day) return fail('Informe a data.', $('#f-data'));
  if (day > todayISO()) return fail('A data não pode ser no futuro.', $('#f-data'));
  if (!rs.length) return fail('Informe ao menos um exame.', $('#f-rows [name=ex]'));
  for (const r of rs) {
    if (!r.ex) return fail('Falta o nome do exame.', r.d.querySelector('[name=ex]'));
    if (!(r.vl > 0)) return fail(`Valor inválido para "${r.ex}".`, r.d.querySelector('[name=vl]'));
  }
  if (!med) return fail('Informe o médico solicitante.', $('#f-med'));
  const edit = sheet.mode === 'edit';
  if (!payVal && !(edit && !sheet.entry.pagamento)) { $('#pay').classList.add('err'); return fail('Escolha a forma de pagamento.', $('#pay button[tabindex="0"]')); }
  const taxa = curTaxa();
  if (edit) return saveEdit(sheet.entry, { exame: rs[0].ex, valor: rs[0].vl, data: day, medico: med, pagamento: payVal || null, taxa });
  saveNew({ rows: rs.map(r => ({ ex: r.ex, vl: r.vl })), med, data: day, pag: payVal, taxa });
});
// salvar é otimista: a folha fecha na hora e a linha aparece pendente até o servidor confirmar
async function saveNew(draft) {
  closeSheet();
  const temps = draft.rows.map((r, i) => ({ id: 'tmp' + Date.now() + i, exame: r.ex, proc: /mamografia/i.test(r.ex) ? 'MG' : 'US', valor: r2(r.vl), data: draft.data, medico: draft.med, pagamento: draft.pag, taxa: CARTOES.includes(draft.pag) ? draft.taxa : 0, created_at: Date.now() + i, pending: true }));
  entries.push(...temps);
  if (!draft.data.startsWith(route.ym) || route.page !== 'mes') { history.replaceState(null, '', '#/mes/' + draft.data.slice(0, 7)); applyRoute(); }
  else renderMes(0, { sweepIt: false });
  try {
    const r = await api('POST', '/api/entries', temps.map(t => ({ exame: t.exame, valor: t.valor, data: t.data, medico: t.medico, pagamento: t.pagamento, taxa: t.taxa })));
    await loadEntries(); r.ids.forEach(id => fresh.add(id)); refresh();
    const b = temps.reduce((s, i) => s + i.valor, 0), l = temps.reduce((s, i) => s + liq(i), 0);
    toast(`Atendimento salvo · ${plural(temps.length, 'exame')}`, `${brl(b)} → líquido ${brl(l)}`, async () => { await api('POST', '/api/entries/delete', { ids: r.ids }); await loadEntries(); refresh(); });
  } catch (x) {
    entries = entries.filter(e => !temps.includes(e)); refresh();
    toast('Não foi possível salvar', x.message, () => openSheet({ mode: 'add', draft }), { error: true, label: 'Reabrir' });
  }
}
async function saveEdit(entry, body) {
  closeSheet();
  const before = { exame: entry.exame, valor: entry.valor, data: entry.data, medico: entry.medico, pagamento: entry.pagamento, taxa: entry.taxa };
  try {
    await api('PUT', '/api/entries/' + encodeURIComponent(entry.id), body);
    await loadEntries(); fresh.add(entry.id);
    if (!body.data.startsWith(route.ym) && route.page === 'mes') { history.replaceState(null, '', '#/mes/' + body.data.slice(0, 7)); applyRoute(); } else refresh();
    toast('Alterações salvas', body.exame, async () => { await api('PUT', '/api/entries/' + encodeURIComponent(entry.id), before); await loadEntries(); refresh(); });
  } catch (x) { toast('Não foi possível salvar', x.message, () => openSheet({ mode: 'edit', entry }), { error: true, label: 'Reabrir' }); }
}
async function deleteEntries(ids) {
  const items = entries.filter(e => ids.includes(e.id)); if (!items.length) return;
  // foco vai para a próxima linha (navegação por teclado continua)
  const rows = $$('#wl .r'); const cur = rows.find(r => r.dataset.id === ids[0]); const next = cur && (rows[rows.indexOf(cur) + 1] || rows[rows.indexOf(cur) - 1]);
  if (cur) { cur.style.height = cur.offsetHeight + 'px'; void cur.offsetHeight; cur.classList.add('gone'); }
  const nextId = next && next.dataset.id;
  setTimeout(() => {
    entries = entries.filter(e => !ids.includes(e.id)); refresh();
    if (nextId) { const n = $(`#wl .r[data-id="${CSS.escape(nextId)}"]`); if (n) n.focus({ preventScroll: true }); }
  }, reduce || !cur ? 0 : 240);
  try {
    await api('POST', '/api/entries/delete', { ids });
    toast(`Excluído: ${items[0].exame}${items.length > 1 ? ` e mais ${items.length - 1}` : ''}`, brl(items.reduce((s, e) => s + e.valor, 0)),
      async () => { await api('POST', '/api/entries/restore', { ids }); await loadEntries(); ids.forEach(id => fresh.add(id)); refresh(); });
  } catch (x) { await loadEntries().catch(() => {}); refresh(); toast('Não foi possível excluir', x.message, null, { error: true }); }
}
function refresh() { if (route.page === 'mes') renderMes(0, { sweepIt: false }); else if (route.page === 'ano') renderAno(); }

/* ============================================================
   TOASTS — pilha com profundidade, pausa no hover/aba oculta,
   arrastar para o lado dispensa (Sonner)
   ============================================================ */
const tbox = $('#toasts'); let toasts = [], expanded = false;
function layoutToasts() {
  let off = 0;
  toasts.forEach((t, i) => {
    const el = t.el;
    if (expanded) { el.style.transform = `translateY(${-off}px)`; el.style.opacity = 1; off += el.offsetHeight + 8; }
    else { el.style.transform = `translateY(${-i * 10}px) scale(${1 - i * .05})`; el.style.opacity = i > 2 ? 0 : 1; }
    el.style.zIndex = 100 - i; el.style.pointerEvents = i > 2 && !expanded ? 'none' : '';
  });
}
function toast(msg, sub, action, { error = false, label = 'Desfazer' } = {}) {
  const el = document.createElement('li'); el.className = 'toast' + (error ? ' err' : '');
  el.innerHTML = `<span class="dot"></span><span class="msg">${esc(msg)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>${action ? `<button class="act press">${esc(label)}</button>` : ''}`;
  tbox.prepend(el);
  const t = { el, left: action ? 7000 : 3500, start: 0, timer: 0 }; toasts.unshift(t);
  const kill = () => { clearTimeout(t.timer); if (!toasts.includes(t)) return; toasts = toasts.filter(x => x !== t); el.style.opacity = 0; el.style.transform += ' translateY(12px)'; setTimeout(() => el.remove(), 320); layoutToasts(); };
  t.kill = kill; t.pause = () => { clearTimeout(t.timer); t.left -= performance.now() - t.start; }; t.resume = () => { t.start = performance.now(); t.timer = setTimeout(kill, Math.max(800, t.left)); };
  if (action) el.querySelector('.act').addEventListener('click', async () => {
    kill();
    try { await action(); if (label === 'Desfazer') toast('Desfeito', '', null); } catch (x) { toast(x.message, '', null, { error: true }); }
  });
  let sx = 0, st = 0, dx = 0, drag = false;
  el.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; drag = true; sx = e.clientX; st = performance.now(); el.setPointerCapture(e.pointerId); el.style.transition = 'none'; });
  el.addEventListener('pointermove', e => { if (!drag) return; dx = Math.max(0, e.clientX - sx); el.style.transform = `translateX(${dx}px)`; el.style.opacity = 1 - dx / 300; });
  el.addEventListener('pointerup', () => { if (!drag) return; drag = false; el.style.transition = ''; const v = dx / (performance.now() - st);
    if (dx > 80 || v > .11) { clearTimeout(t.timer); toasts = toasts.filter(x => x !== t); el.style.transform = 'translateX(120%)'; el.style.opacity = 0; setTimeout(() => el.remove(), 320); layoutToasts(); } else layoutToasts(); dx = 0; });
  requestAnimationFrame(() => { layoutToasts(); if (expanded || document.hidden) { t.start = performance.now(); } else t.resume(); });
  if (toasts.length > 5) toasts[toasts.length - 1].kill();
}
tbox.addEventListener('mouseenter', () => { expanded = true; toasts.forEach(t => t.pause()); layoutToasts(); });
tbox.addEventListener('mouseleave', () => { expanded = false; toasts.forEach(t => t.resume()); layoutToasts(); });
document.addEventListener('visibilitychange', () => toasts.forEach(t => document.hidden ? t.pause() : t.resume()));

/* ============================================================
   TECLADO
   ============================================================ */
document.addEventListener('keydown', e => {
  if (!ov.hidden) { if (e.key === 'Escape') { e.preventDefault(); closeSheet(); } return; }
  if ($('#app').hidden) return;
  const typing = e.target.closest('input,textarea,select,[contenteditable]');
  if (typing) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === '/') { e.preventDefault(); if (route.page !== 'mes') location.hash = '#/mes/' + lastYm; requestAnimationFrame(() => $('#q').focus()); }
  else if (k === 'n' || k === 'N') { e.preventDefault(); openSheet(); }
  else if (k === 'ArrowLeft' || k === 'ArrowRight') {
    if (e.target.closest('.seg,.pay,.tabs')) return;
    const d = k === 'ArrowLeft' ? -1 : 1;
    if (route.page === 'mes') goMonth(shiftYM(route.ym, d));
    else if (route.page === 'ano') { const b = d < 0 ? $('#yprev') : $('#ynext'); if (!b.disabled) goYear(route.y + d); }
  }
  else if (route.page === 'mes' && (k === 'j' || k === 'k')) { e.preventDefault(); moveRow(k === 'j' ? 1 : -1); }
  else if (route.page === 'mes' && e.target.closest('#wl .r') && (k === 'ArrowDown' || k === 'ArrowUp')) { e.preventDefault(); moveRow(k === 'ArrowDown' ? 1 : -1); }
});

/* ============================================================
   ROTEAMENTO
   ============================================================ */
function parseRoute() {
  const [p, a] = location.hash.replace(/^#\/?/, '').split('/');
  if (p === 'ano') return { page: 'ano', y: /^\d{4}$/.test(a || '') ? +a : new Date().getFullYear() };
  if (p === 'ajustes') return { page: 'ajustes' };
  const ym = /^\d{4}-\d{2}$/.test(a || '') && a <= curYM() ? a : (p === 'mes' && !a ? lastYm : curYM());
  return { page: 'mes', ym };
}
function applyRoute() {
  const prev = route; route = parseRoute();
  if (route.page === 'mes') { if (prev.ym !== route.ym) { pinDay = ''; hoverDay = -1; } lastYm = route.ym; }
  $$('.tabs a').forEach(a => a.setAttribute('aria-selected', a.dataset.tab === route.page));
  $('.tabs a[data-tab="mes"]').href = '#/mes/' + lastYm;
  slide($('.tabs'), '[aria-selected="true"]');
  const changed = prev.page !== route.page;
  for (const k of ['mes', 'ano', 'ajustes']) {
    const s = $('#v-' + k); s.hidden = k !== route.page;
    if (changed && k === route.page && !reduce && prev.page) s.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.23,1,.32,1)' });
  }
  hideTip();
  if (route.page === 'mes') renderMes(changed ? 0 : Math.sign((route.ym > prev.ym) - (route.ym < prev.ym)), { sweepIt: changed || prev.ym !== route.ym });
  else if (route.page === 'ano') renderAno();
  else renderAjustes();
  if (changed) scrollTo({ top: 0 });
}
addEventListener('hashchange', applyRoute);

/* ============================================================
   LOGIN + INÍCIO
   ============================================================ */
function drawLoginFan(p) {
  const c = $('#login-fan'); const { x, w, h } = fit(c); x.clearRect(0, 0, w, h);
  const span = 74 * Math.PI / 180, R = Math.min(h * 1.05, w * .75), ax = w / 2, ay = h * .5 - R * .62, r0 = R * .17;
  sectorPath(x, ax, ay, r0, R, -span / 2, -span / 2 + span * p); x.save(); x.clip();
  const g = x.createRadialGradient(ax, ay, r0, ax, ay, R); g.addColorStop(0, 'rgba(255,255,255,.05)'); g.addColorStop(1, 'rgba(255,255,255,.015)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.globalAlpha = .09; x.fillStyle = x.createPattern(noise, 'repeat'); x.fillRect(0, 0, w, h); x.restore();
  for (let i = 1; i < 5; i++) { x.strokeStyle = 'rgba(255,255,255,.04)'; x.beginPath(); x.arc(ax, ay, r0 + (R - r0) * i / 5, Math.PI / 2 + span / 2 - span * p, Math.PI / 2 + span / 2); x.stroke(); }
  if (p < 1) { const t = -span / 2 + span * p; x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(ax + r0 * Math.sin(t), ay + r0 * Math.cos(t)); x.lineTo(ax + R * Math.sin(t), ay + R * Math.cos(t)); x.stroke(); }
}
function showLogin() {
  $('#app').hidden = true; closeSheet(); $('#login').hidden = false;
  const pw = $('#login-pw'); pw.value = ''; setTimeout(() => pw.focus(), 60);
  if (reduce) { drawLoginFan(1); return; }
  const t0 = performance.now(); const step = now => { const p = Math.min(1, easeOut((now - t0) / 1400)); drawLoginFan(p); if (p < 1 && !$('#login').hidden) requestAnimationFrame(step); }; requestAnimationFrame(step);
}
function showApp() {
  $('#login').hidden = true; $('#app').hidden = false;
  $('#aj-dot').hidden = settings.taxasConferidas;
  route = { page: '' }; applyRoute();
}
$('#login-form').addEventListener('submit', async ev => {
  ev.preventDefault();
  const pw = $('#login-pw'), err = $('#login-err'), btn = $('.login-go'), box = $('.login-field');
  if (!pw.value) { pw.focus(); return; }
  btn.disabled = true; err.textContent = '';
  try {
    await api('POST', '/api/login', { password: pw.value });
    await loadAll();
    if (!reduce) await $('.login').animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.98)' }], { duration: 180, easing: 'ease-in' }).finished;
    showApp();
  } catch (e) {
    if (e.status === 429) err.textContent = `Muitas tentativas. Tente de novo em ${e.data.minutos} min.`;
    else if (e.status === 401) err.textContent = e.data && e.data.restantes <= 2 ? `Senha incorreta · restam ${e.data.restantes} tentativa(s)` : 'Senha incorreta';
    else err.textContent = e.message;
    box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
    pw.select();
  } finally { btn.disabled = false; }
});

function tick() { const d = new Date(); $('#clock').textContent = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => {
  if (!$('#login').hidden) drawLoginFan(1);
  slide($('.tabs'), '[aria-selected="true"]'); slide($('#rk-seg'), '[aria-pressed="true"]'); slide($('#pay'), '[aria-checked="true"]');
  if (route.page === 'mes') { drawFan(); drawDop($('#dop'), +route.ym.slice(0, 4)); renderCine(); }
  if (route.page === 'ano') drawDop($('#dop2'), route.y);
}, 100); });

async function init() {
  try {
    cfg = await api('GET', '/api/config');
    $$('[data-dono]').forEach(x => { x.textContent = cfg.dono || cfg.nome; });
    document.title = cfg.dono ? `Ganhos · ${cfg.dono}` : cfg.nome;
  } catch (e) { /* segue com o padrão */ }
  tick(); setInterval(tick, 1000);
  try {
    const me = await api('GET', '/api/me');
    if (!me.auth) return showLogin();
    await loadAll(); showApp();
  } catch (e) { showLogin(); }
  if (document.fonts) document.fonts.ready.then(() => { if (!$('#app').hidden && route.page === 'mes') { drawFan(); drawDop($('#dop'), +route.ym.slice(0, 4)); slide($('.tabs'), '[aria-selected="true"]'); slide($('#rk-seg'), '[aria-pressed="true"]'); renderCine(); } });
}
init();
