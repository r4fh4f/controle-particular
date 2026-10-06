/* ============================================================
   Controle de Ganhos Particulares — Frontend
   Vanilla JS · telas: Lançar · Mês · Ano · Ajustes
   ============================================================ */
'use strict';

/* ---------- catálogo ---------- */
// Catálogo real extraído dos demonstrativos (sugestões iniciais; o histórico entra junto)
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
const PAG = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito à vista', credito_parc: 'Crédito parcelado' };
const PAG_ORDEM = ['dinheiro', 'pix', 'debito', 'credito', 'credito_parc'];
const CARTOES = ['debito', 'credito', 'credito_parc'];
const SEM_PAG = 'Não informado';

/* ---------- formatação ---------- */
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl = v => BRL.format(v || 0);
const NUM2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUM1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const INT = new Intl.NumberFormat('pt-BR');
const brlCompact = v => Math.abs(v) >= 1000 ? 'R$ ' + NUM1.format(v / 1000) + ' mil' : 'R$ ' + INT.format(Math.round(v));
const pad = n => String(n).padStart(2, '0');
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MES_LONG = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const round2 = n => Math.round(n * 100) / 100;
const plural = (n, s, p) => `${INT.format(n)} ${n === 1 ? s : (p || s + 's')}`;

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const curYM = () => todayISO().slice(0, 7);
const fmtDM = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const fmtDMY = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const parseISO = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ymLabel = ym => `${MES_LONG[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
function shiftYM(ym, delta) { const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + delta, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
const daysIn = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
function startOfWeek(d) { const x = new Date(d); x.setDate(x.getDate() - (x.getDay() + 6) % 7); x.setHours(0, 0, 0, 0); return x; }

// aceita "250", "250,50", "1.250,50", "1250.5"
function parseMoney(s) {
  s = String(s == null ? '' : s).replace(/[R$\s]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return Number(s);
}
const liquido = e => round2(e.valor * (1 - (e.taxa || 0) / 100));
const procOf = exame => /mamografia/i.test(exame) ? 'MG' : 'US';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

/* ---------- estado ---------- */
let entries = [];
let settings = { taxas: { debito: 0, credito: 0, credito_parc: 0 }, taxasConferidas: true };
let route = { page: 'lancar' };
const mesUI = { q: '', pag: '', proc: '', medico: '', exame: '', dia: '', sort: 'data', dir: -1 };
const rankUI = { exame: { metric: 'sum', all: false }, medico: { metric: 'sum', all: false } };

/* ---------- API ---------- */
class ApiErr extends Error { constructor(msg, status, data) { super(msg); this.status = status; this.data = data; } }
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
async function loadEntries() { entries = await api('GET', '/api/entries'); refreshDatalists(); }
async function loadAll() {
  const [e, s] = await Promise.all([api('GET', '/api/entries'), api('GET', '/api/settings')]);
  entries = e; settings = s; refreshDatalists();
}

/* ---------- agregações ---------- */
function agg(list) {
  let bruto = 0, liq = 0; const at = new Set();
  for (const e of list) { bruto += e.valor; liq += liquido(e); at.add(e.atendimento || e.id); }
  return { bruto: round2(bruto), liq: round2(liq), taxas: round2(bruto - liq), n: list.length, atend: at.size, ticket: at.size ? bruto / at.size : 0 };
}
const ofMonth = ym => entries.filter(e => e.data.startsWith(ym));
const ofYear = y => entries.filter(e => e.data.startsWith(y + '-'));
const between = (de, ate) => entries.filter(e => e.data >= de && e.data <= ate);

function rank(list, field) {
  const m = new Map();
  for (const e of list) {
    const k = e[field]; const o = m.get(k) || { key: k, count: 0, sum: 0 };
    o.count++; o.sum += e.valor; m.set(k, o);
  }
  return [...m.values()];
}
function byPagamento(list) {
  const m = new Map();
  for (const e of list) {
    const k = e.pagamento || ''; const o = m.get(k) || { key: k, count: 0, sum: 0, taxas: 0 };
    o.count++; o.sum += e.valor; o.taxas += e.valor - liquido(e); m.set(k, o);
  }
  return [...PAG_ORDEM, ''].filter(k => m.has(k)).map(k => m.get(k));
}
function procSplit(list) {
  const r = { US: { count: 0, sum: 0 }, MG: { count: 0, sum: 0 } };
  for (const e of list) { const t = r[e.proc === 'MG' ? 'MG' : 'US']; t.count++; t.sum += e.valor; }
  return r;
}
// último valor cobrado por exame (para preencher automaticamente)
function lastPrice(exame) {
  const k = exame.trim().toLowerCase(); let best = null;
  for (const e of entries) if (e.exame.toLowerCase() === k && (!best || e.created_at > best.created_at)) best = e;
  return best ? best.valor : null;
}

/* ---------- sugestões (datalists) ---------- */
function freqList(values) {
  const m = new Map();
  for (const v of values) { const k = v.trim(); if (!k) continue; const low = k.toLowerCase(); const o = m.get(low) || { v: k, n: 0 }; o.n++; m.set(low, o); }
  return [...m.values()].sort((a, b) => b.n - a.n || a.v.localeCompare(b.v, 'pt-BR')).map(o => o.v);
}
function refreshDatalists() {
  const ex = freqList(entries.map(e => e.exame));
  for (const c of EXAMES_CATALOGO) if (!ex.some(x => x.toLowerCase() === c.toLowerCase())) ex.push(c);
  const med = freqList(entries.map(e => e.medico));
  $('#dl-mount').innerHTML =
    `<datalist id="dl-exames">${ex.map(v => `<option value="${esc(v)}">`).join('')}</datalist>` +
    `<datalist id="dl-medicos">${med.map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
}

/* ============================================================
   GRÁFICOS (SVG desenhado no tamanho real do container)
   ============================================================ */
let charts = [];
function chartSlot(o) { charts.push(o); return `<div class="chart" data-chart="${charts.length - 1}" style="height:${o.height || 240}px"></div>`; }
function drawCharts(root = document) {
  $$('[data-chart]', root).forEach(el => { const o = charts[+el.dataset.chart]; if (o) el.innerHTML = columnSvg(o, Math.max(280, el.clientWidth)); });
}
function niceTicks(max) {
  if (!(max > 0)) return { ticks: [0], top: 1 };
  const raw = max / 4, p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw);
  const top = Math.ceil(max / step) * step, ticks = [];
  for (let t = 0; t <= top + 1e-9; t += step) ticks.push(t);
  return { ticks, top };
}
function barPath(x, y, w, h) {
  if (h <= 0) return '';
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
function columnSvg(o, W) {
  const H = o.height || 240, padL = 62, padR = 6, padT = 12, padB = 26;
  const n = o.labels.length, k = o.series.length;
  const max = Math.max(0, ...o.series.flatMap(s => s.values));
  const { ticks, top } = niceTicks(max);
  const pw = W - padL - padR, ph = H - padT - padB, band = pw / n;
  const bw = Math.max(2, Math.min(24, (band * 0.72 - (k - 1) * 2) / k));
  const y = v => padT + ph - (v / top) * ph;
  let s = `<svg width="${W}" height="${H}" role="img" aria-label="${esc(o.aria || '')}">`;
  for (const t of ticks) s += `<line class="gridline" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/><text x="${padL - 8}" y="${y(t) + 4}" text-anchor="end">${esc(brlCompact(t))}</text>`;
  s += `<line class="axis" x1="${padL}" x2="${W - padR}" y1="${y(0)}" y2="${y(0)}"/>`;
  for (let i = 0; i < n; i++) {
    const cx = padL + band * i + band / 2, gw = k * bw + (k - 1) * 2;
    s += `<g class="col${o.onClick ? ' go' : ''}" data-ci="${i}"><rect class="hit" x="${padL + band * i}" y="${padT}" width="${band}" height="${ph}"/>`;
    o.series.forEach((se, j) => { const v = se.values[i]; if (v > 0) s += `<path class="bar ${se.cls || ''}" d="${barPath(cx - gw / 2 + j * (bw + 2), y(v), bw, y(0) - y(v))}"/>`; });
    const xl = o.xLabel ? o.xLabel(i) : o.labels[i];
    if (xl) s += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${esc(xl)}</text>`;
    s += '</g>';
  }
  return s + '</svg>';
}
function legendHtml(items) { return `<div class="legend">${items.map(([cls, txt]) => `<span><i class="${cls}"></i>${esc(txt)}</span>`).join('')}</div>`; }

// tooltip
const tip = () => $('#tip');
document.addEventListener('mousemove', ev => {
  const col = ev.target.closest && ev.target.closest('.chart .col');
  if (!col) { tip().hidden = true; return; }
  const o = charts[+col.closest('[data-chart]').dataset.chart]; if (!o || !o.tip) return;
  const t = tip(); t.innerHTML = o.tip(+col.dataset.ci); t.hidden = false;
  const r = t.getBoundingClientRect();
  let x = ev.clientX + 14, yy = ev.clientY + 14;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
  if (yy + r.height > innerHeight - 8) yy = ev.clientY - r.height - 14;
  t.style.left = x + 'px'; t.style.top = yy + 'px';
});
document.addEventListener('click', ev => {
  const col = ev.target.closest && ev.target.closest('.chart .col.go');
  if (!col) return;
  const o = charts[+col.closest('[data-chart]').dataset.chart]; if (o && o.onClick) o.onClick(+col.dataset.ci);
});
let resizeT; addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => drawCharts(), 120); });

/* ---------- blocos reutilizáveis ---------- */
function deltaHtml(cur, prev, label) {
  if (!prev) return cur ? `<span class="delta flat">sem base de comparação</span>` : '';
  const p = (cur - prev) / prev * 100;
  if (Math.abs(p) < 0.5) return `<span class="delta flat">= ${esc(label)}</span>`;
  return `<span class="delta ${p > 0 ? 'up' : 'down'}">${p > 0 ? '▲' : '▼'} ${NUM1.format(Math.abs(p))}% ${esc(label)}</span>`;
}
function kpi(lab, val, sub, cls = '') {
  return `<div class="kpi ${cls}"><div class="lab">${lab}</div><div class="val">${val}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
}
function tag(proc) { return proc === 'MG' ? '<span class="tag mg">MG</span>' : '<span class="tag">US</span>'; }
const pagNome = p => p ? PAG[p] : SEM_PAG;

function pagamentosHtml(list) {
  const rows = byPagamento(list);
  if (!rows.length) return `<div class="empty">Sem lançamentos</div>`;
  const tot = rows.reduce((s, r) => s + r.sum, 0) || 1, peak = Math.max(...rows.map(r => r.sum)) || 1;
  const taxas = rows.reduce((s, r) => s + r.taxas, 0);
  return `<div class="hbars">${rows.map(r => `<div class="hbar">
      <div class="top"><span>${esc(r.key ? PAG[r.key] : SEM_PAG)}</span>
      <span class="m"><b>${brl(r.sum)}</b> · ${NUM1.format(r.sum / tot * 100)}% · ${r.count}×${r.taxas > 0.004 ? ` · taxa ${brl(r.taxas)}` : ''}</span></div>
      <div class="track"><div class="fill" style="width:${Math.max(1, r.sum / peak * 100)}%"></div></div></div>`).join('')}</div>
    <p class="note">Total pago em taxas de cartão: <b class="mono">${brl(taxas)}</b></p>`;
}
function splitHtml(list) {
  const s = procSplit(list), tot = s.US.sum + s.MG.sum;
  if (!tot) return `<div class="empty">Sem lançamentos</div>`;
  const us = s.US.sum / tot * 100, mg = 100 - us;
  return `<div class="stack100" role="img" aria-label="Ultrassom ${NUM1.format(us)}%, Mamografia ${NUM1.format(mg)}%">
      ${s.US.sum ? `<div class="us" style="flex:${us}"></div>` : ''}${s.MG.sum ? `<div class="mg" style="flex:${mg}"></div>` : ''}</div>
    <div class="split-legend">
      <div><div class="k"><i></i>Ultrassom · ${NUM1.format(us)}%</div><div class="n">${brl(s.US.sum)} · ${s.US.count}×</div></div>
      <div><div class="k"><i class="mg"></i>Mamografia · ${NUM1.format(mg)}%</div><div class="n">${brl(s.MG.sum)} · ${s.MG.count}×</div></div>
    </div>`;
}
function rankPanel(title, field, list, { clickable }) {
  const ui = rankUI[field];
  const rows = rank(list, field).sort((a, b) => ui.metric === 'sum' ? b.sum - a.sum || b.count - a.count : b.count - a.count || b.sum - a.sum);
  const peak = Math.max(1, ...rows.map(r => r[ui.metric]));
  const shown = ui.all ? rows : rows.slice(0, 8);
  const body = rows.length ? `<div class="tbl-wrap${ui.all ? ' scroll' : ''}"><table class="tbl">
      <thead><tr><th>${field === 'exame' ? 'Exame' : 'Médico'}</th><th class="num">Qtd</th><th class="num">Total</th><th class="num">Média</th><th style="width:22%"></th></tr></thead>
      <tbody>${shown.map(r => `<tr${clickable ? ` class="click" data-act="filter" data-field="${field}" data-val="${esc(r.key)}" title="Filtrar a lista por este ${field === 'exame' ? 'exame' : 'médico'}"` : ''}>
        <td>${esc(r.key)}</td><td class="num">${r.count}</td><td class="num">${brl(r.sum)}</td><td class="num faint">${brl(r.sum / r.count)}</td>
        <td><div class="cellbar" style="width:${r[ui.metric] / peak * 100}%"></div></td></tr>`).join('')}</tbody>
    </table></div>
    ${rows.length > 8 ? `<div class="tfoot-bar"><button class="link" data-act="rank-all" data-field="${field}">${ui.all ? 'Mostrar só os 8 primeiros' : `Ver todos (${rows.length})`}</button></div>` : ''}`
    : `<div class="empty">Sem lançamentos</div>`;
  return `<div class="panel"><div class="panel-h"><h3>${title}</h3>
      <div class="right seg small" role="group" aria-label="Ordenar por">
        <button data-act="rank-metric" data-field="${field}" data-metric="sum" aria-pressed="${ui.metric === 'sum'}">Valor</button>
        <button data-act="rank-metric" data-field="${field}" data-metric="count" aria-pressed="${ui.metric === 'count'}">Qtd</button>
      </div></div>${body}</div>`;
}
function exportBtn(de, ate, nome, label = 'Exportar CSV') {
  return `<a class="btn" href="/api/export.csv?de=${de}&ate=${ate}&nome=${nome}" download>${label}</a>`;
}

/* ============================================================
   TELA: LANÇAR
   ============================================================ */
function examRowHtml() {
  return `<div class="exam-row">
    <input class="inp" name="exame" list="dl-exames" placeholder="Exame (digite para buscar)" aria-label="Exame">
    <div class="money"><span>R$</span><input class="inp" name="valor" inputmode="decimal" placeholder="0,00" aria-label="Valor"></div>
    <span class="tag" data-proc>US</span>
    <button type="button" class="x" data-act="rm-row" title="Remover exame" aria-label="Remover exame">✕</button>
  </div>`;
}
function renderLancar() {
  const aviso = settings.taxasConferidas ? '' : `<div class="banner"><b>Confira as taxas da maquininha</b> — o valor líquido dos pagamentos em cartão usa essas taxas. <a class="link" href="#/ajustes">Abrir Ajustes</a></div>`;
  return `${aviso}<div class="grid-side">
    <div class="panel sticky">
      <div class="panel-h"><h3>Novo atendimento</h3><span class="hint right">um paciente · um ou mais exames</span></div>
      <div class="panel-b">
      <form id="att-form" class="form" autocomplete="off" novalidate>
        <div class="row2">
          <div class="field"><label for="f-data">Data</label><input id="f-data" class="mono" name="data" type="date" value="${todayISO()}" required></div>
          <div class="field"><label for="f-medico">Médico solicitante</label><input id="f-medico" name="medico" list="dl-medicos" placeholder="Nome do médico"></div>
        </div>
        <div class="field"><span class="lbl">Exames</span>
          <div class="exam-rows" id="exam-rows">${examRowHtml()}</div>
          <button type="button" class="btn btn-sm" data-act="add-row" style="align-self:flex-start;margin-top:2px">+ Outro exame neste atendimento</button>
        </div>
        <div class="field"><span class="lbl">Forma de pagamento</span>
          <div class="pay" id="pay" role="radiogroup">${PAG_ORDEM.map(k => `<label><input type="radio" name="pagamento" value="${k}">${PAG[k]}</label>`).join('')}</div>
          <div class="taxa-row" id="taxa-row" hidden>Taxa da maquininha
            <input class="inp" name="taxa" inputmode="decimal" aria-label="Taxa da maquininha em %"> %
            <span class="faint">padrão definido em Ajustes</span></div>
        </div>
        <div class="summary">
          <div><span class="lbl">Bruto</span><span class="v" id="s-bruto">R$ 0,00</span></div>
          <div><span class="lbl">Taxa cartão</span><span class="v" id="s-taxa">—</span></div>
          <div><span class="lbl">Líquido</span><span class="v net" id="s-liq">R$ 0,00</span></div>
        </div>
        <div class="form-err" id="form-err"></div>
        <div style="display:flex;align-items:center;gap:12px">
          <button type="submit" class="btn btn-primary" style="flex:1;justify-content:center;padding:12px">Salvar atendimento</button>
          <span class="kbd" title="Atalho">Ctrl + Enter</span>
        </div>
      </form></div>
    </div>
    <div class="stack" id="lancar-side">${lancarSideHtml()}</div>
  </div>`;
}
function lancarSideHtml() {
  const hoje = todayISO(), ym = curYM();
  const ws = toISO(startOfWeek(new Date()));
  const aH = agg(entries.filter(e => e.data === hoje)), aW = agg(between(ws, hoje)), aM = agg(ofMonth(ym));
  const recentes = [...entries].sort((a, b) => b.created_at - a.created_at).slice(0, 15);
  return `<div class="mini">
      ${kpi('Hoje', `<span class="mono">${brl(aH.bruto)}</span>`, plural(aH.n, 'exame'))}
      ${kpi('Esta semana', `<span class="mono">${brl(aW.bruto)}</span>`, plural(aW.n, 'exame'))}
      ${kpi(MES_LONG[+ym.slice(5) - 1], `<span class="mono">${brl(aM.bruto)}</span>`, `líquido ${brl(aM.liq)}`)}
    </div>
    <div class="panel">
      <div class="panel-h"><h3>Últimos lançados</h3><a class="link right" href="#/mes/${ym}">Ver o mês completo →</a></div>
      ${recentes.length ? `<ul class="recent">${recentes.map(e => `<li data-id="${esc(e.id)}">
        <span class="d">${fmtDM(e.data)}</span>
        <div class="e"><div>${esc(e.exame)}</div><div class="s">${esc(e.medico)} · ${esc(pagNome(e.pagamento))}</div></div>
        <span class="v">${brl(e.valor)}</span>
        <span class="acts" style="display:flex"><button class="iconbtn" data-act="edit" title="Editar">✎</button><button class="iconbtn del" data-act="del" title="Excluir">✕</button></span>
      </li>`).join('')}</ul>` : `<div class="empty"><div class="big">Nenhum lançamento ainda</div>Use o formulário ao lado.</div>`}
    </div>`;
}
function refreshLancarSide() { const s = $('#lancar-side'); if (s) s.innerHTML = lancarSideHtml(); }

function formTaxa(form) {
  const p = form.querySelector('input[name=pagamento]:checked');
  if (!p || !CARTOES.includes(p.value)) return 0;
  const t = parseMoney(form.querySelector('[name=taxa]').value);
  return t >= 0 ? t : 0;
}
function updateSummary(form) {
  let bruto = 0;
  $$('.exam-row', form).forEach(r => { const v = parseMoney($('[name=valor]', r).value); if (v > 0) bruto += v; });
  const t = formTaxa(form), taxa = round2(bruto * t / 100);
  $('#s-bruto').textContent = brl(bruto);
  $('#s-taxa').textContent = t ? `− ${brl(taxa)} (${NUM2.format(t)}%)` : '—';
  $('#s-liq').textContent = brl(bruto - taxa);
}
async function submitAtendimento(form) {
  const err = $('#form-err'); err.textContent = '';
  $$('.err', form).forEach(x => x.classList.remove('err'));
  const data = form.data.value, medico = form.medico.value.trim();
  const pagEl = form.querySelector('input[name=pagamento]:checked');
  const fail = (msg, el) => { err.textContent = msg; if (el) { el.classList.add('err'); if (el.focus) el.focus(); } return false; };
  const rows = $$('.exam-row', form).map(r => ({ r, exame: $('[name=exame]', r).value.trim(), valor: parseMoney($('[name=valor]', r).value) }))
    .filter(x => x.exame || x.valor);
  if (!data) return fail('Informe a data.', form.data);
  if (!rows.length) return fail('Informe ao menos um exame.', $('[name=exame]', form));
  for (const x of rows) {
    if (!x.exame) return fail('Falta o nome do exame.', $('[name=exame]', x.r));
    if (!(x.valor > 0)) return fail(`Valor inválido para "${x.exame}".`, $('[name=valor]', x.r));
  }
  if (!medico) return fail('Informe o médico solicitante.', form.medico);
  if (!pagEl) { $('#pay').classList.add('err'); return fail('Escolha a forma de pagamento.'); }
  const taxa = formTaxa(form);
  const items = rows.map(x => ({ exame: x.exame, valor: x.valor, data, medico, pagamento: pagEl.value, taxa }));
  const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
  try {
    const r = await api('POST', '/api/entries', items);
    const total = items.reduce((s, i) => s + i.valor, 0);
    toast(`Atendimento salvo · ${plural(items.length, 'exame')} · ${brl(total)}`, { undo: async () => { await api('POST', '/api/entries/delete', { ids: r.ids }); await afterChange(); } });
    // prepara o próximo: mantém a data, limpa o resto
    form.medico.value = ''; $('#exam-rows').innerHTML = examRowHtml();
    $$('input[name=pagamento]', form).forEach(x => { x.checked = false; });
    $('#taxa-row').hidden = true; $('#pay').classList.remove('err');
    updateSummary(form); form.medico.focus();
    await loadEntries(); refreshLancarSide();
  } catch (e) { fail(e.message); }
  finally { btn.disabled = false; }
}

/* ============================================================
   TELA: MÊS
   ============================================================ */
function renderMes(ym) {
  const list = ofMonth(ym), a = agg(list);
  const isCur = ym === curYM(), prevYM = shiftYM(ym, -1);
  let prevList = ofMonth(prevYM), cmpLabel = `vs ${MES_LONG[+prevYM.slice(5) - 1].toLowerCase()}`;
  if (isCur) { const dia = todayISO().slice(8); prevList = prevList.filter(e => e.data.slice(8) <= dia); cmpLabel = `vs ${MES[+prevYM.slice(5) - 1]} até dia ${+dia}`; }
  const p = agg(prevList);
  const nDias = daysIn(ym), porDia = Array.from({ length: nDias }, () => []);
  list.forEach(e => porDia[+e.data.slice(8) - 1].push(e));
  const vals = porDia.map(d => round2(d.reduce((s, e) => s + e.valor, 0)));
  const anos = availableYears();
  const minYM = anos.length ? `${anos[0]}-01` : ym;

  return `<div class="pagehead">
      <button class="navbtn" data-act="go-month" data-ym="${prevYM}" title="Mês anterior (←)" ${prevYM < minYM ? 'disabled' : ''}>‹</button>
      <h2>${ymLabel(ym)}</h2>
      <button class="navbtn" data-act="go-month" data-ym="${shiftYM(ym, 1)}" title="Próximo mês (→)" ${ym >= curYM() ? 'disabled' : ''}>›</button>
      <input type="month" id="mes-pick" value="${ym}" max="${curYM()}" aria-label="Escolher mês">
      ${isCur ? '' : `<a class="btn btn-ghost" href="#/mes/${curYM()}">Mês atual</a>`}
      <span class="spacer"></span>
      <a class="btn btn-ghost" href="#/ano/${ym.slice(0, 4)}">Ver o ano ${ym.slice(0, 4)}</a>
      ${exportBtn(`${ym}-01`, `${ym}-${nDias}`, `ganhos-${ym}`)}
    </div>
    <div class="kpis" style="--n:5">
      ${kpi('Bruto', brl(a.bruto), deltaHtml(a.bruto, p.bruto, cmpLabel), 'hero')}
      ${kpi('Líquido', brl(a.liq), a.taxas ? `taxas de cartão −${brl(a.taxas)}` : 'sem taxas de cartão')}
      ${kpi('Exames', INT.format(a.n), deltaHtml(a.n, p.n, cmpLabel))}
      ${kpi('Atendimentos', INT.format(a.atend), 'pacientes atendidos')}
      ${kpi('Ticket médio', brl(a.ticket), 'por atendimento')}
    </div>
    <div class="grid-2 wide section-gap">
      <div class="panel"><div class="panel-h"><h3>Ganho bruto por dia</h3><span class="hint right">clique num dia para ver os exames</span></div>
        <div class="panel-b">${list.length ? chartSlot({
          labels: vals.map((_, i) => i + 1), series: [{ values: vals }], height: 230, aria: `Ganho bruto por dia em ${ymLabel(ym)}`,
          xLabel: i => (i === 0 || (i + 1) % 5 === 0) ? String(i + 1) : '',
          tip: i => { const d = `${ym}-${pad(i + 1)}`, g = agg(porDia[i]);
            return `<div class="t">${DOW[parseISO(d).getDay()]}, ${fmtDM(d)}</div><div class="r">Bruto <b>${brl(g.bruto)}</b></div><div class="r">Líquido <b>${brl(g.liq)}</b></div><div class="r">Exames <b>${g.n}</b></div>`; },
          onClick: i => { if (porDia[i].length) { mesUI.dia = `${ym}-${pad(i + 1)}`; updateMesTable(); $('#mes-entries').scrollIntoView({ behavior: 'smooth' }); } },
        }) : `<div class="empty"><div class="big">Nenhum lançamento em ${ymLabel(ym).toLowerCase()}</div></div>`}</div></div>
      <div class="stack">
        <div class="panel"><div class="panel-h"><h3>Formas de pagamento</h3></div><div class="panel-b">${pagamentosHtml(list)}</div></div>
        <div class="panel"><div class="panel-h"><h3>Ultrassom × Mamografia</h3></div><div class="panel-b">${splitHtml(list)}</div></div>
      </div>
    </div>
    <div class="grid-2 section-gap">
      ${rankPanel('Exames', 'exame', list, { clickable: true })}
      ${rankPanel('Médicos solicitantes', 'medico', list, { clickable: true })}
    </div>
    <div class="panel section-gap" id="mes-entries">
      <div class="panel-h"><h3>Lançamentos do mês</h3><span class="hint">clique no cabeçalho para ordenar</span></div>
      <div class="filterbar">
        <input class="inp search" id="mes-q" type="search" placeholder="Buscar exame ou médico…" value="${esc(mesUI.q)}">
        <select class="inp" id="mes-pag" aria-label="Forma de pagamento"><option value="">Todas as formas</option>
          ${[...PAG_ORDEM, 'nao'].map(k => `<option value="${k}" ${mesUI.pag === k ? 'selected' : ''}>${k === 'nao' ? SEM_PAG : PAG[k]}</option>`).join('')}</select>
        <select class="inp" id="mes-proc" aria-label="Procedimento"><option value="">US e MG</option>
          <option value="US" ${mesUI.proc === 'US' ? 'selected' : ''}>Só ultrassom</option><option value="MG" ${mesUI.proc === 'MG' ? 'selected' : ''}>Só mamografia</option></select>
        <span id="mes-chips" style="display:contents"></span>
      </div>
      <div id="mes-table"></div>
    </div>`;
}
function mesFiltered() {
  const q = mesUI.q.trim().toLowerCase();
  return ofMonth(route.ym).filter(e =>
    (!q || e.exame.toLowerCase().includes(q) || e.medico.toLowerCase().includes(q)) &&
    (!mesUI.pag || (mesUI.pag === 'nao' ? !e.pagamento : e.pagamento === mesUI.pag)) &&
    (!mesUI.proc || e.proc === mesUI.proc) &&
    (!mesUI.medico || e.medico === mesUI.medico) &&
    (!mesUI.exame || e.exame === mesUI.exame) &&
    (!mesUI.dia || e.data === mesUI.dia));
}
const SORTERS = {
  data: (a, b) => a.data.localeCompare(b.data) || a.created_at - b.created_at,
  exame: (a, b) => a.exame.localeCompare(b.exame, 'pt-BR'),
  medico: (a, b) => a.medico.localeCompare(b.medico, 'pt-BR'),
  pagamento: (a, b) => pagNome(a.pagamento).localeCompare(pagNome(b.pagamento), 'pt-BR'),
  valor: (a, b) => a.valor - b.valor,
  liquido: (a, b) => liquido(a) - liquido(b),
};
function updateMesTable() {
  const chips = [];
  if (mesUI.dia) chips.push(['dia', `Dia ${fmtDM(mesUI.dia)}`]);
  if (mesUI.exame) chips.push(['exame', mesUI.exame]);
  if (mesUI.medico) chips.push(['medico', mesUI.medico]);
  const anyFilter = chips.length || mesUI.q || mesUI.pag || mesUI.proc;
  $('#mes-chips').innerHTML = chips.map(([k, t]) => `<span class="chip">${esc(t)}<button data-act="unfilter" data-field="${k}" aria-label="Remover filtro">✕</button></span>`).join('')
    + (anyFilter ? `<button class="link" data-act="clear-filters">Limpar filtros</button>` : '');
  const list = mesFiltered().sort((a, b) => SORTERS[mesUI.sort](a, b) * mesUI.dir || (b.created_at - a.created_at));
  const th = (k, t, num) => `<th class="sortable${num ? ' num' : ''}" data-act="sort" data-col="${k}">${t}${mesUI.sort === k ? ` <span class="arr">${mesUI.dir > 0 ? '↑' : '↓'}</span>` : ''}</th>`;
  const a = agg(list);
  $('#mes-table').innerHTML = list.length ? `<div class="tbl-wrap scroll"><table class="tbl">
      <thead><tr>${th('data', 'Data')}${th('exame', 'Exame')}${th('medico', 'Médico solicitante')}${th('pagamento', 'Pagamento')}${th('valor', 'Bruto', 1)}${th('liquido', 'Líquido', 1)}<th style="width:72px"></th></tr></thead>
      <tbody>${list.map(e => `<tr data-id="${esc(e.id)}">
        <td class="date">${fmtDM(e.data)} <span class="faint">${DOW[parseISO(e.data).getDay()]}</span></td>
        <td>${tag(e.proc)} ${esc(e.exame)}</td><td>${esc(e.medico)}</td>
        <td>${esc(pagNome(e.pagamento))}${e.taxa ? ` <span class="faint mono" style="font-size:11.5px">${NUM2.format(e.taxa)}%</span>` : ''}</td>
        <td class="num">${brl(e.valor)}</td><td class="num">${brl(liquido(e))}</td>
        <td><div class="acts"><button class="iconbtn" data-act="edit" title="Editar">✎</button><button class="iconbtn del" data-act="del" title="Excluir">✕</button></div></td>
      </tr>`).join('')}</tbody></table></div>
    <div class="tfoot-bar"><span class="faint">${plural(a.n, 'exame')} · ${plural(a.atend, 'atendimento')}${anyFilter ? ' (filtrado)' : ''}</span>
      <span>Bruto <b>${brl(a.bruto)}</b> · Líquido <b>${brl(a.liq)}</b></span></div>`
    : `<div class="empty"><div class="big">Nenhum lançamento${anyFilter ? ' com esses filtros' : ''}</div></div>`;
}

/* ============================================================
   TELA: ANO
   ============================================================ */
function availableYears() {
  const ys = new Set(entries.map(e => +e.data.slice(0, 4))); ys.add(new Date().getFullYear());
  return [...ys].sort((a, b) => a - b);
}
function renderAno(y) {
  const anos = availableYears(), curY = new Date().getFullYear();
  const list = ofYear(y), a = agg(list);
  const isCur = y === curY;
  // comparação justa: no ano corrente, compara com o mesmo período do ano anterior
  const corte = isCur ? todayISO().slice(5) : '12-31';
  const prevList = ofYear(y - 1).filter(e => e.data.slice(5) <= corte), p = agg(prevList);
  const cmpLabel = isCur ? `vs ${y - 1} no mesmo período` : `vs ${y - 1}`;
  const meses = Array.from({ length: 12 }, (_, i) => `${y}-${pad(i + 1)}`);
  const mAgg = meses.map(m => agg(list.filter(e => e.data.startsWith(m))));
  const pAgg = meses.map(m => agg(ofMonth(`${y - 1}${m.slice(4)}`)));
  // no mês corrente, a coluna "vs ano anterior" compara só até o mesmo dia
  const pAggTab = pAgg.slice();
  if (isCur) { const mm = todayISO().slice(4, 7), dia = todayISO().slice(8); pAggTab[new Date().getMonth()] = agg(ofMonth(`${y - 1}${mm}`).filter(e => e.data.slice(8) <= dia)); }
  const ativos = mAgg.filter(m => m.n > 0);
  const media = ativos.length ? a.bruto / ativos.length : 0;
  let melhor = -1; mAgg.forEach((m, i) => { if (m.bruto > 0 && (melhor < 0 || m.bruto > mAgg[melhor].bruto)) melhor = i; });
  const temPrev = pAgg.some(m => m.n);
  const ultimoMes = isCur ? new Date().getMonth() : 11;

  const series = [{ values: mAgg.map(m => m.bruto) }];
  if (temPrev) series.push({ values: pAgg.map(m => m.bruto), cls: 'prev' });

  return `<div class="pagehead">
      <button class="navbtn" data-act="go-year" data-y="${y - 1}" title="Ano anterior (←)" ${y <= anos[0] ? 'disabled' : ''}>‹</button>
      <h2>${y}</h2>
      <button class="navbtn" data-act="go-year" data-y="${y + 1}" title="Próximo ano (→)" ${y >= curY ? 'disabled' : ''}>›</button>
      <span class="spacer"></span>
      ${exportBtn(`${y}-01-01`, `${y}-12-31`, `ganhos-${y}`, `Exportar ${y} (CSV)`)}
    </div>
    <div class="kpis" style="--n:5">
      ${kpi(isCur ? 'Bruto no ano (até hoje)' : 'Bruto no ano', brl(a.bruto), deltaHtml(a.bruto, p.bruto, cmpLabel), 'hero')}
      ${kpi('Líquido', brl(a.liq), a.taxas ? `taxas de cartão −${brl(a.taxas)}` : 'sem taxas de cartão')}
      ${kpi('Exames', INT.format(a.n), deltaHtml(a.n, p.n, cmpLabel))}
      ${kpi('Média mensal', brl(media), ativos.length ? `bruto · ${plural(ativos.length, 'mês com lançamentos', 'meses com lançamentos')}` : '—')}
      ${kpi('Melhor mês', melhor >= 0 ? MES_LONG[melhor] : '—', melhor >= 0 ? brl(mAgg[melhor].bruto) : '')}
    </div>
    <div class="panel section-gap"><div class="panel-h"><h3>Ganho bruto por mês</h3><span class="hint right">clique num mês para abrir</span></div>
      <div class="panel-b">${temPrev ? legendHtml([['', String(y)], ['prev', String(y - 1)]]) : ''}${chartSlot({
        labels: MES, series, height: 260, aria: `Ganho bruto por mês em ${y}`,
        tip: i => `<div class="t">${MES_LONG[i]}</div><div class="r"><span><i></i>${y}</span><b>${brl(mAgg[i].bruto)}</b></div>`
          + (temPrev ? `<div class="r"><span><i class="prev"></i>${y - 1}</span><b>${brl(pAgg[i].bruto)}</b></div>` : '')
          + `<div class="r">Exames <b>${mAgg[i].n}</b></div><div class="r">Líquido <b>${brl(mAgg[i].liq)}</b></div>`,
        onClick: i => { location.hash = `#/mes/${meses[i]}`; },
      })}</div></div>
    <div class="grid-2 wide section-gap">
      <div class="panel"><div class="panel-h"><h3>Mês a mês</h3><span class="hint right">clique numa linha para abrir o mês</span></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Mês</th><th class="num">Exames</th><th class="num">Atend.</th><th class="num">Bruto</th><th class="num">Taxas</th><th class="num">Líquido</th>${temPrev ? `<th class="num">vs ${y - 1}</th>` : ''}</tr></thead>
          <tbody>${meses.slice(0, ultimoMes + 1).map((m, i) => { const r = mAgg[i]; return `<tr class="click" data-act="open-month" data-ym="${m}">
            <td>${MES_LONG[i]}</td><td class="num">${r.n || '—'}</td><td class="num">${r.atend || '—'}</td><td class="num">${r.n ? brl(r.bruto) : '—'}</td>
            <td class="num faint">${r.taxas ? brl(r.taxas) : '—'}</td><td class="num">${r.n ? brl(r.liq) : '—'}</td>
            ${temPrev ? `<td class="num">${pAggTab[i].bruto && r.bruto ? deltaHtml(r.bruto, pAggTab[i].bruto, '') : '<span class="faint">—</span>'}</td>` : ''}</tr>`; }).join('')}</tbody>
          <tfoot><tr><td>Total</td><td class="num">${a.n}</td><td class="num">${a.atend}</td><td class="num">${brl(a.bruto)}</td><td class="num">${brl(a.taxas)}</td><td class="num">${brl(a.liq)}</td>${temPrev ? '<td></td>' : ''}</tr></tfoot>
        </table></div></div>
      <div class="stack">
        <div class="panel"><div class="panel-h"><h3>Formas de pagamento</h3><span class="hint right">${y}</span></div><div class="panel-b">${pagamentosHtml(list)}</div></div>
        <div class="panel"><div class="panel-h"><h3>Ultrassom × Mamografia</h3><span class="hint right">${y}</span></div><div class="panel-b">${splitHtml(list)}</div></div>
      </div>
    </div>
    <div class="grid-2 section-gap">
      ${rankPanel(`Exames em ${y}`, 'exame', list, { clickable: false })}
      ${rankPanel(`Médicos solicitantes em ${y}`, 'medico', list, { clickable: false })}
    </div>
    ${anos.length > 1 ? `<div class="panel section-gap"><div class="panel-h"><h3>Todos os anos</h3></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ano</th><th class="num">Exames</th><th class="num">Bruto</th><th class="num">Taxas</th><th class="num">Líquido</th></tr></thead>
      <tbody>${[...anos].reverse().map(yy => { const g = agg(ofYear(yy)); return `<tr class="click" data-act="open-year" data-y="${yy}"><td>${yy}${yy === curY ? ' <span class="faint">(até hoje)</span>' : ''}</td><td class="num">${g.n}</td><td class="num">${brl(g.bruto)}</td><td class="num faint">${brl(g.taxas)}</td><td class="num">${brl(g.liq)}</td></tr>`; }).join('')}</tbody>
      </table></div></div>` : ''}`;
}

/* ============================================================
   TELA: AJUSTES
   ============================================================ */
function renderAjustes() {
  const t = settings.taxas;
  return `<div class="grid-2">
    <div class="stack">
      <div class="panel"><div class="panel-h"><h3>Taxas da maquininha</h3></div><div class="panel-b">
        <form id="taxas-form" class="form" novalidate>
          <div class="settings-grid">
            ${CARTOES.map(k => `<div class="field"><label for="tx-${k}">${PAG[k]} (%)</label><input id="tx-${k}" class="mono" name="${k}" inputmode="decimal" value="${NUM2.format(t[k] || 0)}"></div>`).join('')}
          </div>
          <div class="form-err" id="taxas-err"></div>
          <div><button class="btn btn-primary" type="submit">Salvar taxas</button></div>
        </form>
        <p class="note">Dinheiro e PIX não têm taxa. As taxas valem para os <b>próximos</b> lançamentos — cada lançamento guarda a taxa do dia em que foi feito (dá para corrigir editando o lançamento).</p>
      </div></div>
      <div class="panel"><div class="panel-h"><h3>Backup</h3></div><div class="panel-b">
        <p style="margin:0 0 12px" id="backup-status" class="muted">Verificando…</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a class="btn" href="/api/backup" download>Baixar cópia do banco (.db)</a>
          ${exportBtn('0000-01-01', '9999-12-31', 'ganhos-todos', 'Exportar tudo (CSV)')}
        </div>
        <p class="note">O servidor faz uma cópia automática por dia e guarda as últimas 30 — mas elas ficam no mesmo VPS. Uma vez por mês, baixe a cópia do banco e guarde fora (Google Drive, e-mail).</p>
      </div></div>
      <div class="panel"><div class="panel-h"><h3>Segurança</h3></div><div class="panel-b">
        <button class="btn btn-danger" data-act="logout-all">Sair de todos os dispositivos</button>
        <p class="note">Use se esqueceu o site aberto em outro computador. Todos os acessos (inclusive este) precisarão da senha de novo.</p>
      </div></div>
    </div>
    <div class="panel"><div class="panel-h"><h3>Lixeira</h3><span class="hint right">apagados há até 90 dias</span></div><div id="trash">
      <div class="empty">Carregando…</div></div></div>
  </div>`;
}
async function loadAjustesExtras() {
  try {
    const b = await api('GET', '/api/backup/status');
    $('#backup-status').innerHTML = b.ultimo ? `Último backup automático: <b class="mono">${fmtDMY(b.ultimo)}</b> · ${plural(b.quantidade, 'cópia guardada', 'cópias guardadas')} no servidor.` : 'Nenhum backup automático ainda (o primeiro sai alguns segundos após o servidor iniciar).';
  } catch (e) { $('#backup-status').textContent = 'Não foi possível verificar os backups.'; }
  try {
    const tr = await api('GET', '/api/trash');
    $('#trash').innerHTML = tr.length ? `<div class="tbl-wrap scroll"><table class="tbl"><thead><tr><th>Data</th><th>Exame</th><th class="num">Valor</th><th></th></tr></thead>
      <tbody>${tr.map(e => `<tr data-id="${esc(e.id)}"><td class="date">${fmtDMY(e.data)}</td><td>${esc(e.exame)}<div class="faint" style="font-size:12px">${esc(e.medico)}</div></td>
      <td class="num">${brl(e.valor)}</td><td class="num"><button class="btn btn-sm" data-act="restore">Restaurar</button></td></tr>`).join('')}</tbody></table></div>`
      : `<div class="empty"><div class="big">Lixeira vazia</div></div>`;
  } catch (e) { $('#trash').innerHTML = `<div class="empty">Não foi possível carregar.</div>`; }
}

/* ============================================================
   EDIÇÃO (janela) · EXCLUSÃO COM DESFAZER · AVISOS
   ============================================================ */
function openEdit(id) {
  const e = entries.find(x => x.id === id); if (!e) return;
  const dlg = $('#edit-dlg');
  const opts = (e.pagamento ? [] : [['', SEM_PAG]]).concat(PAG_ORDEM.map(k => [k, PAG[k]]));
  dlg.innerHTML = `<form method="dialog" id="edit-form" novalidate>
    <div class="panel-h"><h3>Editar lançamento</h3><span class="hint right">${tag(e.proc)}</span></div>
    <div class="panel-b form">
      <div class="field"><label for="ed-exame">Exame</label><input id="ed-exame" name="exame" list="dl-exames" value="${esc(e.exame)}"></div>
      <div class="row2">
        <div class="field"><label for="ed-valor">Valor bruto</label><div class="money"><span>R$</span><input id="ed-valor" name="valor" inputmode="decimal" value="${NUM2.format(e.valor)}"></div></div>
        <div class="field"><label for="ed-data">Data</label><input id="ed-data" class="mono" name="data" type="date" value="${e.data}"></div>
      </div>
      <div class="field"><label for="ed-medico">Médico solicitante</label><input id="ed-medico" name="medico" list="dl-medicos" value="${esc(e.medico)}"></div>
      <div class="row2">
        <div class="field"><label for="ed-pag">Pagamento</label><select id="ed-pag" name="pagamento">${opts.map(([k, t]) => `<option value="${k}" ${k === (e.pagamento || '') ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="field" id="ed-taxa-f" ${CARTOES.includes(e.pagamento) ? '' : 'hidden'}><label for="ed-taxa">Taxa (%)</label><input id="ed-taxa" class="mono" name="taxa" inputmode="decimal" value="${NUM2.format(e.taxa || 0)}"></div>
      </div>
      <div class="form-err" id="ed-err"></div>
    </div>
    <div class="foot">
      <button type="button" class="btn btn-danger left" data-act="ed-del">Excluir</button>
      <button type="button" class="btn" data-act="ed-cancel">Cancelar</button>
      <button type="submit" class="btn btn-primary">Salvar</button>
    </div></form>`;
  const f = $('#edit-form', dlg);
  f.pagamento.addEventListener('change', () => {
    const card = CARTOES.includes(f.pagamento.value);
    $('#ed-taxa-f', dlg).hidden = !card;
    if (card) f.taxa.value = NUM2.format(settings.taxas[f.pagamento.value] || 0);
  });
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const body = { exame: f.exame.value.trim(), valor: parseMoney(f.valor.value), data: f.data.value, medico: f.medico.value.trim(), pagamento: f.pagamento.value || null, taxa: parseMoney(f.taxa.value) || 0 };
    try { await api('PUT', '/api/entries/' + encodeURIComponent(id), body); dlg.close(); toast('Alterações salvas'); await afterChange(); }
    catch (err) { $('#ed-err', dlg).textContent = err.message; }
  });
  $('[data-act=ed-cancel]', dlg).addEventListener('click', () => dlg.close());
  $('[data-act=ed-del]', dlg).addEventListener('click', async () => { dlg.close(); await deleteEntries([id]); });
  dlg.showModal(); f.exame.focus();
}
async function deleteEntries(ids) {
  const e = entries.find(x => x.id === ids[0]);
  try {
    await api('POST', '/api/entries/delete', { ids });
    toast(`Excluído: ${e ? e.exame : 'lançamento'}`, { undo: async () => { await api('POST', '/api/entries/restore', { ids }); await afterChange(); } });
    await afterChange();
  } catch (err) { toast(err.message, { error: true }); }
}
// recarrega os dados e redesenha a tela atual sem perder o formulário de lançamento
async function afterChange() {
  await loadEntries();
  if (route.page === 'lancar') refreshLancarSide(); else render();
}
function toast(msg, { undo, error } = {}) {
  const box = $('#toast'), t = document.createElement('div');
  t.className = 'toast' + (error ? ' err' : '');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button class="link">Desfazer</button>' : ''}`;
  box.appendChild(t);
  const kill = () => t.remove();
  const timer = setTimeout(kill, undo ? 9000 : 3500);
  if (undo) t.querySelector('button').addEventListener('click', async () => {
    clearTimeout(timer); kill();
    try { await undo(); toast('Desfeito'); } catch (e) { toast(e.message, { error: true }); }
  });
}

/* ============================================================
   ROTEAMENTO E RENDER
   ============================================================ */
function parseRoute() {
  const [p, arg] = location.hash.replace(/^#\/?/, '').split('/');
  if (p === 'mes') return { page: 'mes', ym: /^\d{4}-\d{2}$/.test(arg || '') ? arg : curYM() };
  if (p === 'ano') return { page: 'ano', y: /^\d{4}$/.test(arg || '') ? +arg : new Date().getFullYear() };
  if (p === 'ajustes') return { page: 'ajustes' };
  return { page: 'lancar' };
}
function render() {
  const prev = route; route = parseRoute();
  if (route.page === 'mes' && (prev.page !== 'mes' || prev.ym !== route.ym)) mesUI.dia = '';
  $$('[data-nav]').forEach(a => { if (a.dataset.nav === route.page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  charts = []; tip().hidden = true;
  const view = $('#view');
  if (route.page === 'mes') { view.innerHTML = renderMes(route.ym); updateMesTable(); }
  else if (route.page === 'ano') view.innerHTML = renderAno(route.y);
  else if (route.page === 'ajustes') { view.innerHTML = renderAjustes(); loadAjustesExtras(); }
  else { view.innerHTML = renderLancar(); setTimeout(() => { const m = $('#f-medico'); if (m) m.focus(); }, 0); }
  drawCharts(view);
}
addEventListener('hashchange', () => { const y = scrollY, same = parseRoute().page === route.page; render(); if (!same) scrollTo(0, 0); else scrollTo(0, y); });

/* ---------- eventos (delegados) ---------- */
function wire() {
  const view = $('#view');
  $('#logout-btn').addEventListener('click', async () => { try { await api('POST', '/api/logout'); } catch (e) { /* ignora */ } location.reload(); });

  view.addEventListener('click', async ev => {
    const el = ev.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act, row = el.closest('[data-id]'), id = row && row.dataset.id;
    switch (act) {
      case 'edit': openEdit(id); break;
      case 'del': await deleteEntries([id]); break;
      case 'restore': await api('POST', '/api/entries/restore', { ids: [id] }); await loadEntries(); toast('Lançamento restaurado'); loadAjustesExtras(); break;
      case 'add-row': {
        $('#exam-rows').insertAdjacentHTML('beforeend', examRowHtml());
        $$('#exam-rows [name=exame]').pop().focus(); break;
      }
      case 'rm-row': {
        const rows = $$('#exam-rows .exam-row');
        if (rows.length > 1) el.closest('.exam-row').remove();
        else { $$('input', rows[0]).forEach(i => { i.value = ''; }); }
        updateSummary($('#att-form')); break;
      }
      case 'go-month': location.hash = `#/mes/${el.dataset.ym}`; break;
      case 'go-year': case 'open-year': location.hash = `#/ano/${el.dataset.y}`; break;
      case 'open-month': location.hash = `#/mes/${el.dataset.ym}`; break;
      case 'sort': {
        const c = el.dataset.col;
        if (mesUI.sort === c) mesUI.dir *= -1; else { mesUI.sort = c; mesUI.dir = ['data', 'valor', 'liquido'].includes(c) ? -1 : 1; }
        updateMesTable(); break;
      }
      case 'filter': mesUI[el.dataset.field] = el.dataset.val; updateMesTable(); $('#mes-entries').scrollIntoView({ behavior: 'smooth' }); break;
      case 'unfilter': mesUI[el.dataset.field] = ''; updateMesTable(); break;
      case 'clear-filters': Object.assign(mesUI, { q: '', pag: '', proc: '', medico: '', exame: '', dia: '' }); render(); break;
      case 'rank-metric': rankUI[el.dataset.field].metric = el.dataset.metric; rerenderKeepScroll(); break;
      case 'rank-all': rankUI[el.dataset.field].all = !rankUI[el.dataset.field].all; rerenderKeepScroll(); break;
      case 'logout-all':
        if (confirm('Encerrar o acesso em todos os dispositivos? Você precisará digitar a senha de novo.')) { await api('POST', '/api/logout-all'); location.reload(); }
        break;
    }
  });

  view.addEventListener('input', ev => {
    const t = ev.target;
    if (t.id === 'mes-q') { mesUI.q = t.value; updateMesTable(); return; }
    const form = t.closest('#att-form'); if (!form) return;
    if (t.name === 'exame') { const tg = $('[data-proc]', t.closest('.exam-row')); const p = procOf(t.value); tg.textContent = p; tg.classList.toggle('mg', p === 'MG'); }
    if (t.classList.contains('err')) t.classList.remove('err');
    updateSummary(form);
  });
  view.addEventListener('change', ev => {
    const t = ev.target;
    if (t.id === 'mes-pick' && t.value) { location.hash = `#/mes/${t.value}`; return; }
    if (t.id === 'mes-pag') { mesUI.pag = t.value; updateMesTable(); return; }
    if (t.id === 'mes-proc') { mesUI.proc = t.value; updateMesTable(); return; }
    const form = t.closest('#att-form'); if (!form) return;
    if (t.name === 'exame' && t.value.trim()) {
      // preenche com o último valor cobrado por este exame
      const v = $('[name=valor]', t.closest('.exam-row'));
      const lp = lastPrice(t.value);
      if (lp && !v.value) { v.value = NUM2.format(lp); updateSummary(form); }
    }
    if (t.name === 'pagamento') {
      $('#pay').classList.remove('err');
      const card = CARTOES.includes(t.value);
      $('#taxa-row').hidden = !card;
      if (card) form.taxa.value = NUM2.format(settings.taxas[t.value] || 0);
      updateSummary(form);
    }
    if (t.name === 'valor' && t.value) { const n = parseMoney(t.value); if (n > 0) t.value = NUM2.format(n); }
  });
  view.addEventListener('submit', async ev => {
    if (ev.target.id === 'att-form') { ev.preventDefault(); await submitAtendimento(ev.target); }
    if (ev.target.id === 'taxas-form') {
      ev.preventDefault();
      const f = ev.target, taxas = {};
      for (const k of CARTOES) taxas[k] = parseMoney(f[k].value);
      try { await api('PUT', '/api/settings', { taxas }); settings = await api('GET', '/api/settings'); toast('Taxas salvas'); }
      catch (e) { $('#taxas-err').textContent = e.message; }
    }
  });
  view.addEventListener('keydown', ev => {
    const form = ev.target.closest && ev.target.closest('#att-form');
    if (!form || ev.key !== 'Enter') return;
    if (ev.ctrlKey || ev.metaKey) { ev.preventDefault(); form.requestSubmit(); return; }
    if (ev.target.tagName === 'BUTTON') return;
    // Enter avança para o próximo campo (não salva sem querer)
    ev.preventDefault();
    if (ev.target.name === 'valor' && ev.target.closest('.exam-row') === $$('#exam-rows .exam-row').pop() && ev.target.value) { $('[name=medico]', form).value ? $('#pay input').focus() : form.medico.focus(); return; }
    const fields = $$('input:not([type=radio]):not([hidden]), #pay input:checked', form).filter(x => x.offsetParent);
    const i = fields.indexOf(ev.target); if (i >= 0 && fields[i + 1]) fields[i + 1].focus();
  });
  // ← → trocam de mês/ano quando não se está digitando
  document.addEventListener('keydown', ev => {
    if (ev.target.closest('input,select,textarea,dialog') || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    const d = ev.key === 'ArrowLeft' ? -1 : 1;
    const btn = $$('.pagehead .navbtn')[d < 0 ? 0 : 1];
    if (btn && !btn.disabled) btn.click();
  });
}
function rerenderKeepScroll() { const y = scrollY; render(); scrollTo(0, y); }

/* ---------- login + início ---------- */
function showLogin() { $('#login').hidden = false; $('.app').hidden = true; const pw = $('#login-pw'); pw.value = ''; setTimeout(() => pw.focus(), 50); }
function showApp() { $('#login').hidden = true; $('.app').hidden = false; }
function wireLogin() {
  $('#login-form').addEventListener('submit', async ev => {
    ev.preventDefault();
    const pw = $('#login-pw'), err = $('#login-err'), btn = ev.target.querySelector('button');
    btn.disabled = true; err.textContent = '';
    try {
      await api('POST', '/api/login', { password: pw.value });
      await loadAll(); showApp(); render();
    } catch (e) {
      if (e.status === 429) err.textContent = `Muitas tentativas. Tente de novo em ${e.data.minutos} min.`;
      else if (e.status === 401) err.textContent = e.data && e.data.restantes <= 2 ? `Senha incorreta. Restam ${e.data.restantes} tentativa(s).` : 'Senha incorreta.';
      else err.textContent = e.message;
      pw.value = ''; pw.focus();
    } finally { btn.disabled = false; }
  });
}
async function init() {
  try {
    const c = await api('GET', '/api/config');
    $$('[data-nome]').forEach(x => { x.textContent = c.nome; });
    $$('[data-inicial]').forEach(x => { x.textContent = c.inicial; });
    document.title = c.nome;
  } catch (e) { /* segue com o padrão */ }
  wireLogin(); wire();
  try {
    const me = await api('GET', '/api/me');
    if (!me.auth) return showLogin();
    await loadAll(); showApp(); render();
  } catch (e) { showLogin(); }
}
document.addEventListener('DOMContentLoaded', init);
