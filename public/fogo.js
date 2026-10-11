/* ============================================================
   Motor de fogo em canvas 2D, sem dependências (perfumaria: o Lançar em chamas,
   a chama na ponta da linha do dia, o líquido em chamas e a meta conjunta acesa).
   Cópia do motor da skill de perfumaria, reescrito a partir do "Canvas Fire Button"
   (InstaLanding, MIT, Ray Velez), que por sua vez se baseia no Fire Button do Rive
   Marketplace. A chama não é vídeo nem ruído: são gotas de Bézier sobrepostas, línguas
   laterais, um fluxo de partículas sem estado (calculado por hash) e um núcleo branco.
   Script comum (a CSP do controle só aceita script-src 'self'): expõe window.Fogo.
   ============================================================ */
(() => {
  'use strict';
  const REDUZ = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FLAMA = ['#ffd36b', '#ff9a2e', '#ff5a1f', '#c2260f'];   // ouro → laranja → vermelho → brasa (hex de 6 dígitos!)
  const DPR = () => Math.min(2, globalThis.devicePixelRatio || 1);
  const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7 + 17.3) * 43758.5453; return s - Math.floor(s); };
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const suave = (atual, alvo, dt, tau) => atual + (alvo - atual) * (1 - Math.exp(-dt / tau));

  function sprite(c) {
    const sp = document.createElement('canvas'); sp.width = sp.height = 64;
    const g = sp.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, c); gr.addColorStop(0.35, c + 'b0'); gr.addColorStop(1, c + '00');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return sp;
  }
  let SPR = null;   // brilhos pré-desenhados (criados no primeiro uso)
  const sprites = () => (SPR ??= ['#fffbe8', '#fff1b8', ...FLAMA, '#7a1a06'].map(sprite));

  function gota(ctx, cx, by, w, h, lean) {
    ctx.beginPath(); ctx.moveTo(cx, by + w * 0.95);
    ctx.bezierCurveTo(cx - w * 1.35, by + w * 0.85, cx - w * 1.05 + lean * 0.25, by - h * 0.38, cx + lean, by - h);
    ctx.bezierCurveTo(cx + w * 1.05 + lean * 0.25, by - h * 0.38, cx + w * 1.35, by + w * 0.85, cx, by + w * 0.95);
    ctx.closePath();
  }
  function vgrad(ctx, y0, y1, stops) { const g = ctx.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }

  /* Uma chama com base em (cx, by) e tamanho s, nas coordenadas atuais do contexto.
     o = { seed, t, lit 0..1, boost 0..2, lean, desfoque, taxa }
     desfoque=true usa shadowBlur (mais bonito e mais caro); false usa brilho pré-desenhado. */
  function chama(ctx, cx, by, s, o) {
    const SP = sprites(), sd = o.seed, a = o.lit, t = o.t, blur = !!o.desfoque, boost = o.boost || 0;
    if (a <= 0.01) return;
    const flick = Math.sin(t * 9.1 + sd) * 0.5 + Math.sin(t * 14.3 + sd * 2.1) * 0.3 + Math.sin(t * 23.7 + sd * 0.7) * 0.2;
    const fullH = s * (1.3 + boost) * 1.05, fullW = s * (0.3 + 0.1 * boost) * 1.05;
    const H = lerp(s * 0.3, fullH, a) * (1 + 0.05 * Math.sin(t * 21.7 + sd * 2.3) + 0.04 * flick * (0.5 + a));
    const W = lerp(s * 0.1, fullW, a) * (1 + 0.04 * Math.sin(t * 7.7 + sd));
    const lean = s * (0.05 * Math.sin(t * 6.3 + sd) + 0.02 * flick) * (0.4 + a) + (o.lean || 0) * s;
    ctx.save();
    const r0 = H * 0.9, yc = by - H * 0.4, g = ctx.createRadialGradient(cx, yc, 0, cx, yc, r0);   // calor em volta
    g.addColorStop(0, `rgba(255,130,40,${0.5 * a})`); g.addColorStop(0.5, `rgba(255,70,15,${0.18 * a})`); g.addColorStop(1, 'rgba(255,70,15,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(cx - r0, yc - r0, r0 * 2, r0 * 2);
    ctx.globalCompositeOperation = 'source-over';
    for (let q = 0; q < 4; q++) {                             // línguas laterais, cada uma no seu ritmo
      const side = [-0.55, 0.5, -0.2, 0.28][q], lick = 0.5 + 0.5 * Math.sin(t * (5.1 + q * 2.3) + sd * 1.7 + q * 2.1);
      ctx.globalAlpha = a * (0.45 + 0.3 * lick);
      if (blur) { ctx.shadowColor = FLAMA[2]; ctx.shadowBlur = s * 0.2; }
      gota(ctx, cx + W * side, by + s * 0.02, W * (0.42 + 0.12 * lick), H * (0.45 + 0.45 * lick), lean * 1.6 + W * side * 0.9);
      ctx.fillStyle = vgrad(ctx, by, by - H, [[0, FLAMA[3]], [0.45, FLAMA[2]], [1, 'rgba(255,150,60,0)']]); ctx.fill();
    }
    [[FLAMA[3], 1.12, 0.96], [FLAMA[2], 0.98, 0.9], [FLAMA[1], 0.8, 0.76], [FLAMA[0], 0.6, 0.6]].forEach(([c, wk, hk], i) => {
      const wob = 0.07 * Math.sin(t * (8.3 + i * 3.7) + sd + i * 1.3) + 0.04 * Math.sin(t * (19.1 + i * 5.3) + sd * 2 + i);
      ctx.globalAlpha = a * (i ? 0.72 : 0.6);
      if (blur) { ctx.shadowColor = c; ctx.shadowBlur = s * (0.22 + 0.14 * boost); }
      gota(ctx, cx, by + s * 0.015 * i, W * wk, H * hk * (1 + wob), lean * (1.15 - i * 0.2)); ctx.fillStyle = c; ctx.fill();
    });
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'lighter';
    if (!blur) { const r = W * 2.4; ctx.globalAlpha = a * 0.32; ctx.drawImage(SP[3], cx - r + lean * 0.5, by - H * 0.45 - r, r * 2, r * 2); }
    if (o.taxa > 0) {                                         // fluxo de partículas: a partícula j é função de hash(j)
      const TAXA = o.taxa, VIDA = 0.85;
      for (let j = Math.ceil((t - VIDA) * TAXA); j <= Math.floor(t * TAXA); j++) {
        const k = sd * 7919 + j, u = (t - j / TAXA) / (0.4 + 0.45 * hash(k, 1));
        if (u < 0 || u >= 1) continue;
        const wisp = hash(k, 7) < 0.14, rise = Math.pow(u, 0.85) * (wisp ? 1.35 : 1), side = (hash(k, 2) - 0.5) * 2;
        const px = cx + lean * rise * 1.4 + side * W * 0.85 * (1 - Math.min(1, rise) * 0.85) + Math.sin(t * 7.3 + hash(k, 3) * 6.28 + u * 5) * s * 0.07 * u;
        const py = by - H * 1.02 * rise * (0.85 + 0.3 * hash(k, 4)), r = W * (wisp ? 0.5 : 1.15) * (1 - 0.72 * u) * (0.7 + 0.5 * hash(k, 5));
        ctx.globalAlpha = a * Math.pow(1 - u, 1.1) * clamp01(u * 3) * 0.42;
        ctx.drawImage(SP[Math.min(6, 2 + Math.floor(u * 4.5 + hash(k, 6) * 0.9))], px - r, py - r, r * 2, r * 2);
      }
    }
    ctx.globalAlpha = a * 0.9;                                // núcleo branco
    gota(ctx, cx, by + s * 0.07, W * 0.28, H * 0.26, lean * 0.3);
    ctx.fillStyle = vgrad(ctx, by + s * 0.1, by - H * 0.26, [[0, '#ffffff'], [0.4, '#fff4c9'], [1, FLAMA[0]]]); ctx.fill();
    ctx.restore();
  }

  /* Um único requestAnimationFrame para todas as chamas; dorme quando nenhum participante
     pede quadro e para com a aba escondida. Participante: (dt, t) => true se quer o próximo quadro. */
  function criaLaco() {
    const participantes = new Set();
    let raf = 0, ultimo = 0, T = 0;
    function quadro(agora) {
      raf = 0; if (document.hidden) return;
      const dt = Math.min(0.05, (agora - ultimo) / 1000); ultimo = agora; T += dt;
      let segue = false;
      for (const p of participantes) segue = p(dt, T) || segue;
      if (segue) raf = requestAnimationFrame(quadro);
    }
    function acorda() { if (!raf && !document.hidden) { ultimo = performance.now(); raf = requestAnimationFrame(quadro); } }
    document.addEventListener('visibilitychange', acorda);
    return { registra(fn) { participantes.add(fn); acorda(); }, acorda };
  }

  /* Brasas e fumaça num <canvas> fixo de tela inteira (pointer-events: none). x, y = clientX/Y. */
  function criaBrasas(cv, laco) {
    const ctx = cv.getContext('2d'), SP = sprites();
    const CORES = ['#ffe08a', '#ffd36b', '#ffb238', '#ff8a1f', '#ff5a1f', '#ff3d0a'];
    const MAX = REDUZ ? 120 : 900;
    let lista = [], d = 1, sujo = false;
    const dimensiona = () => { d = DPR(); const w = Math.round(innerWidth * d), h = Math.round(innerHeight * d); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } };
    const poe = p => { if (lista.length >= MAX) lista.shift(); lista.push(p); };
    function rajada(x, y, forca = 1) {
      const n = Math.round(26 * forca * (REDUZ ? 0.3 : 1));
      for (let i = 0; i < n; i++) {
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = (1.2 + Math.random() * 3.6) * forca * 60;
        poe({ x: x + scrollX, y: y + scrollY, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, sobe: -(40 + Math.random() * 60), vida: 0.7 + Math.random() * 0.9, u: 0, r: 1 + Math.random() * 1.6, c: CORES[i % CORES.length], fase: Math.random() * 6 });
      }
      laco.acorda();
    }
    function fumaca(x, y) {
      for (let i = 0; i < 9; i++) poe({ x: x + scrollX + (Math.random() - 0.5) * 20, y: y + scrollY, vx: (Math.random() - 0.5) * 30, vy: -(30 + Math.random() * 40), sobe: -10, vida: 1.1 + Math.random() * 0.6, u: 0, r: 5 + Math.random() * 5, c: '#8f877f', fumo: true, fase: 0 });
      laco.acorda();
    }
    function fio(x, y) {
      poe({ x: x + scrollX + (Math.random() - 0.5) * 14, y: y + scrollY, vx: (Math.random() - 0.5) * 40, vy: -(60 + Math.random() * 90), sobe: -30, vida: 0.8 + Math.random() * 0.7, u: 0, r: 0.8 + Math.random() * 1.2, c: CORES[(Math.random() * 6) | 0], fase: Math.random() * 6 });
      laco.acorda();
    }
    laco.registra((dt, t) => {
      if (!lista.length) { if (sujo) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); sujo = false; } return false; }
      dimensiona(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.setTransform(d, 0, 0, d, -scrollX * d, -scrollY * d); sujo = true;
      const atr = Math.pow(0.985, dt * 60);
      lista = lista.filter(p => (p.u += dt / p.vida) < 1);
      for (const p of lista) {
        p.vx *= atr; p.vy = p.vy * atr + p.sobe * dt; p.x += (p.vx + Math.sin(t * 3 + p.fase) * 14) * dt; p.y += p.vy * dt;
        const fade = (1 - p.u) * Math.min(1, p.u * 8);
        if (p.fumo) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.18 * fade; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + p.u * 2.5), 0, 6.283); ctx.fill(); continue; }
        ctx.globalCompositeOperation = 'lighter';
        const halo = p.r * 7; ctx.globalAlpha = 0.55 * fade; ctx.drawImage(SP[p.c === '#ff3d0a' ? 5 : 3], p.x - halo, p.y - halo, halo * 2, halo * 2);
        ctx.globalAlpha = fade; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      return true;
    });
    return { rajada, fumaca, fio };
  }

  window.Fogo = { chama, criaLaco, criaBrasas, suave, DPR, REDUZ };
})();
