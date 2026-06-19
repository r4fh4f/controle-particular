/* ============================================================
   Controle de Ganhos Particulares — Radiologia (US / MG)
   Vanilla JS · localStorage · 3 layouts
   ============================================================ */
'use strict';

/* ---------- constants ---------- */
// Catálogo real extraído dos demonstrativos (ordenado por frequência)
const EXAMES_US = [
  'US - Abdome total',
  'US - Transvaginal',
  'US - Mamas',
  'US - Articular (por articulação)',
  'Doppler colorido venoso de membro inferior',
  'US - Órgãos superficiais (tireóide)',
  'US - Aparelho urinário (rins, ureteres e bexiga)',
  'US - Estruturas superficiais (cervical)',
  'US - Obstétrica com Doppler colorido',
  'US - Abdome superior',
  'Doppler colorido de órgão ou estrutura',
  'US - Obstétrica',
  'US - Abdome inferior feminino',
  'US - Obstétrica morfológica',
  'US - Obstétrica 1º trimestre',
  'US - Obstétrica com translucência nucal',
  'US - Abdome inferior masculino (bexiga e próstata)',
  'US - Dermatológico (pele e subcutâneo)',
  'Doppler colorido arterial de membro inferior',
  'US - Obstétrica: perfil biofísico fetal',
  'Doppler colorido venoso de membro superior',
  'US - Glândulas salivares (todas)',
  'Doppler colorido de aorta e artérias renais',
  'Doppler colorido de aorta e ilíacas',
  'Doppler colorido de vasos cervicais (carótidas)',
  'US - Torácico extracardíaco'
];
const EXAMES_MG = ['Mamografia'];
const MG_EXAME = 'Mamografia';
const MEDICOS = [
  'Dr. Marcelo Ferreira','Dra. Ana Beatriz Rocha','Dr. Roberto Lima',
  'Dra. Carla Souza','Dr. Paulo Mendes','Dra. Juliana Antunes','Dr. Henrique Sá'
];

const LKEY = 'rad_particular_layout';

/* ---------- format helpers ---------- */
const BRL = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const brl = v => BRL.format(v||0);
const brlShort = v => 'R$ '+new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(Math.round(v||0));
const pad = n => String(n).padStart(2,'0');
const fmtDate = iso => { const [y,m,d]=iso.split('-'); return `${d}/${m}`; };
const fmtDateFull = iso => { const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; };
const MES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MES_LONG = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

/* ---------- date helpers ---------- */
const todayISO = () => { const d=new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const parseISO = iso => { const [y,m,d]=iso.split('-').map(Number); return new Date(y,m-1,d); };
function startOfWeek(d){ const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; }
function weekKey(d){ const s=startOfWeek(d); return `${s.getFullYear()}-${pad(s.getMonth()+1)}-${pad(s.getDate())}`; }
function monthKey(iso){ return iso.slice(0,7); }

/* ---------- state ---------- */
let entries = [];
let layout = localStorage.getItem(LKEY) || 'planilha';
let period = 'mes';      // 'tudo' | 'mes' | 'semana' | 'YYYY-MM'
let editId = null;

/* ---------- suggestions (catálogo + histórico salvo no servidor) ---------- */
function addUnique(arr,val){ val=(val||'').trim(); if(!val) return; if(!arr.some(x=>x.toLowerCase()===val.toLowerCase())) arr.push(val); }
function mergedExames(){ const out=[]; [...EXAMES_US,...EXAMES_MG,...entries.map(e=>e.exame)].forEach(v=>addUnique(out,v)); return out.sort((a,b)=>a.localeCompare(b,'pt-BR')); }
function mergedMedicos(){ const out=[]; [...MEDICOS,...entries.map(e=>e.medico)].forEach(v=>addUnique(out,v)); return out.sort((a,b)=>a.localeCompare(b,'pt-BR')); }

/* ---------- compute ---------- */
const sortByDate = arr => [...arr].sort((a,b)=> a.data<b.data?1: a.data>b.data?-1:0);

function totals(){
  const now=new Date();
  const wk=weekKey(now), mk=`${now.getFullYear()}-${pad(now.getMonth()+1)}`;
  let week=0,month=0,total=0;
  for(const e of entries){
    total+=e.valor;
    if(monthKey(e.data)===mk) month+=e.valor;
    if(weekKey(parseISO(e.data))===wk) week+=e.valor;
  }
  return {week,month,total,count:entries.length, ticket: entries.length? total/entries.length:0};
}

function periodEntries(){
  const now=new Date();
  if(period==='tudo') return entries;
  if(period==='semana'){ const wk=weekKey(now); return entries.filter(e=>weekKey(parseISO(e.data))===wk); }
  if(period==='mes'){ const mk=`${now.getFullYear()}-${pad(now.getMonth()+1)}`; return entries.filter(e=>monthKey(e.data)===mk); }
  return entries.filter(e=>monthKey(e.data)===period); // specific YYYY-MM
}
function periodLabel(){
  if(period==='tudo')return'Todo o período';
  if(period==='semana')return'Esta semana';
  if(period==='mes'){const n=new Date();return `${MES_LONG[n.getMonth()]} ${n.getFullYear()}`;}
  const [y,m]=period.split('-');return `${MES_LONG[+m-1]} ${y}`;
}
function availableMonths(){
  const set=new Set(entries.map(e=>monthKey(e.data)));
  return [...set].sort().reverse();
}

function rankBy(field, list){
  const m=new Map();
  for(const e of list){ const k=e[field]; const o=m.get(k)||{count:0,sum:0}; o.count++; o.sum+=e.valor; m.set(k,o); }
  return [...m.entries()].map(([k,v])=>({key:k,...v})).sort((a,b)=>b.sum-a.sum);
}
function procSplit(list){
  let us={count:0,sum:0},mg={count:0,sum:0};
  for(const e of list){ const t=e.proc==='US'?us:mg; t.count++; t.sum+=e.valor; }
  return {us,mg};
}
function weeklyTrend(n=6){
  const now=new Date(); const cur=startOfWeek(now);
  const weeks=[];
  for(let i=n-1;i>=0;i--){ const s=new Date(cur); s.setDate(s.getDate()-i*7); weeks.push({key:weekKey(s),start:s,sum:0}); }
  const idx=new Map(weeks.map((w,i)=>[w.key,i]));
  for(const e of entries){ const k=weekKey(parseISO(e.data)); if(idx.has(k)) weeks[idx.get(k)].sum+=e.valor; }
  return weeks;
}

/* ---------- DOM helper ---------- */
const $ = s => document.querySelector(s);
function esc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

/* ---------- shared markup builders ---------- */
function datalists(){
  return `<datalist id="dl-exames">${mergedExames().map(e=>`<option value="${esc(e)}">`).join('')}</datalist>
  <datalist id="dl-medicos">${mergedMedicos().map(m=>`<option value="${esc(m)}">`).join('')}</datalist>`;
}
function refreshDatalists(){ const m=$('#dl-mount'); if(m) m.innerHTML=datalists(); }

function formHtml(){
  const e = editId ? entries.find(x=>x.id===editId) : null;
  const v = (k,d='')=> e? esc(e[k]) : d;
  const us = e? e.proc==='US' : true;
  const isMG = !us;
  return `<form class="form" id="entry-form">
    <div class="field">
      <label>Procedimento</label>
      <div class="proc-toggle">
        <label class="us"><input type="radio" name="proc" value="US" ${us?'checked':''}><span class="dot"></span>Ultrassom</label>
        <label class="mg"><input type="radio" name="proc" value="MG" ${isMG?'checked':''}><span class="dot"></span>Mamografia</label>
      </div>
    </div>
    <div class="field">
      <label>Exame</label>
      <input name="exame" list="dl-exames" autocomplete="off" placeholder="ex.: US Abdome total" value="${v('exame', isMG?MG_EXAME:'')}" ${isMG?'readonly':''} required>
    </div>
    <div class="row2">
      <div class="field">
        <label>Valor (particular)</label>
        <div class="field-prefix"><span>R$</span><input class="mono" name="valor" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0,00" value="${e?e.valor:''}" required></div>
      </div>
      <div class="field">
        <label>Data</label>
        <input class="mono" name="data" type="date" value="${v('data',todayISO())}" required>
      </div>
    </div>
    ${e?'':`<div class="bi-block" id="bi-block" style="${us?'':'display:none'}">
      <label class="bi-check"><input type="checkbox" id="bi-toggle"><span class="bi-box"></span>Lançar 2º exame no mesmo atendimento <em>(caso bilateral)</em></label>
      <div class="bi-fields" id="bi-fields" style="display:none">
        <div class="field"><label>2º exame</label><input name="exame2" list="dl-exames" autocomplete="off" placeholder="ex.: US Mama contralateral"></div>
        <div class="field"><label>Valor do 2º</label><div class="field-prefix"><span>R$</span><input class="mono" name="valor2" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0,00"></div></div>
      </div>
    </div>`}
    <div class="field">
      <label>Médico solicitante</label>
      <input name="medico" list="dl-medicos" autocomplete="off" placeholder="ex.: Dr. Marcelo Ferreira" value="${v('medico')}" required>
    </div>
    <div style="display:flex;gap:10px;margin-top:2px">
      <button type="submit" class="btn-primary btn" style="flex:1;justify-content:center">${e?'Salvar alterações':'Adicionar lançamento'}</button>
      ${e?'<button type="button" class="btn" id="cancel-edit">Cancelar</button>':''}
    </div>
  </form>`;
}

function tagHtml(proc){ return proc==='US'
  ? '<span class="tag us"><span class="dot"></span>US</span>'
  : '<span class="tag mg"><span class="dot"></span>MG</span>'; }

function tableHtml(list,{addrow=false}={}){
  const rows = sortByDate(list).map(e=>`<tr data-id="${e.id}">
    <td class="date">${fmtDateFull(e.data)}</td>
    <td class="exame">${esc(e.exame)}</td>
    <td>${tagHtml(e.proc)}</td>
    <td>${esc(e.medico)}</td>
    <td class="val">${brl(e.valor)}</td>
    <td><div class="rowact">
      <button class="iconbtn" data-act="edit" title="Editar">✎</button>
      <button class="iconbtn del" data-act="del" title="Excluir">✕</button>
    </div></td>
  </tr>`).join('');
  const add = addrow ? `<tr class="addrow" id="inline-add">
    <td><input class="mono" name="data" type="date" value="${todayISO()}" title="Data"></td>
    <td><input name="exame" list="dl-exames" placeholder="Exame…" autocomplete="off"></td>
    <td><select name="proc"><option value="US">US</option><option value="MG">MG</option></select></td>
    <td><input name="medico" list="dl-medicos" placeholder="Médico…" autocomplete="off"></td>
    <td><input class="mono" name="valor" type="number" min="0" step="0.01" placeholder="Valor" style="text-align:right"></td>
    <td><div style="display:flex;justify-content:flex-end"><button class="iconbtn" data-act="inline-add" title="Adicionar (Enter)" style="color:var(--accent)">↵</button></div></td>
  </tr>` : '';
  const total = list.reduce((s,e)=>s+e.valor,0);
  const body = (rows||add)
    ? `<div class="tbl-wrap"><table class="tbl"><thead><tr>
        <th style="width:96px">Data</th><th>Exame</th><th style="width:70px">Proc.</th>
        <th>Médico solicitante</th><th style="width:120px;text-align:right">Valor</th><th style="width:70px"></th>
      </tr></thead><tbody>${add}${rows}</tbody></table></div>`
    : emptyHtml();
  const foot = list.length ? `<div class="tfoot"><span style="color:var(--faint);font-family:var(--mono);font-size:12px">${list.length} lançamento${list.length>1?'s':''} · ${periodLabel()}</span><span class="total">${brl(total)}</span></div>` : '';
  return body+foot;
}

function emptyHtml(){
  return `<div class="empty"><div class="big">Nenhum lançamento neste período</div><div class="sm">Adicione um atendimento particular para começar</div></div>`;
}

function barsHtml(data,{accent2=false,metric='sum',max=6}={}){
  if(!data.length) return `<div class="empty"><div class="sm">Sem dados</div></div>`;
  const top=data.slice(0,max);
  const peak=Math.max(...top.map(d=>d[metric]))||1;
  return `<div class="bars">${top.map(d=>{
    const w=Math.max(4,(d[metric]/peak)*100);
    return `<div class="bar-row">
      <div class="barlab"><span class="name">${esc(d.key)}</span>
        <span class="meta"><b>${brlShort(d.sum)}</b> · ${d.count}×</span></div>
      <div class="bar-track"><div class="bar-fill${accent2?' b2':''}" style="width:${w}%"></div></div>
    </div>`;}).join('')}</div>`;
}

function splitHtml(list){
  const {us,mg}=procSplit(list); const tot=us.sum+mg.sum||1;
  const uf=Math.max(us.sum/tot*100,us.sum?14:0), mf=Math.max(mg.sum/tot*100,mg.sum?14:0);
  return `<div class="split">
    <div class="s-us" style="flex:${uf}"><span>US</span><span class="s-num">${us.count}×</span></div>
    <div class="s-mg" style="flex:${mf}"><span>MG</span><span class="s-num">${mg.count}×</span></div>
  </div>
  <div style="display:flex;justify-content:space-between;margin-top:10px;font-family:var(--mono);font-size:12px;color:var(--muted)">
    <span style="color:var(--accent)">Ultrassom · ${brl(us.sum)}</span>
    <span style="color:var(--accent-2)">Mamografia · ${brl(mg.sum)}</span>
  </div>`;
}

function trendHtml(){
  const w=weeklyTrend(6); const peak=Math.max(...w.map(x=>x.sum))||1;
  return `<div class="trend">${w.map((x,i)=>{
    const h=Math.max(3,(x.sum/peak)*100); const now=i===w.length-1;
    return `<div class="tcol">
      <span class="tval">${x.sum?brlShort(x.sum):''}</span>
      <div class="tbar${now?' now':''}" style="height:${h}%"></div>
      <span class="tlab">${pad(x.start.getDate())}/${pad(x.start.getMonth()+1)}</span>
    </div>`;}).join('')}</div>
  <div style="text-align:center;font-family:var(--mono);font-size:11px;color:var(--faint);margin-top:8px">Ganho por semana · últimas 6</div>`;
}

function kpisHtml(){
  const t=totals();
  return `<div class="kpis">
    <div class="kpi accent"><div class="lab">Ganho da semana</div><div class="val mono">${brl(t.week)}</div><div class="sub">semana atual</div></div>
    <div class="kpi accent"><div class="lab">Ganho do mês</div><div class="val mono">${brl(t.month)}</div><div class="sub">${MES_LONG[new Date().getMonth()].toLowerCase()}</div></div>
    <div class="kpi"><div class="lab">Total geral</div><div class="val mono">${brl(t.total)}</div><div class="sub">acumulado</div></div>
    <div class="kpi"><div class="lab">Lançamentos</div><div class="val mono">${t.count}</div><div class="sub">ticket médio ${brl(t.ticket)}</div></div>
  </div>`;
}

function filterHtml(){
  const months=availableMonths().map(m=>{const [y,mm]=m.split('-');return `<option value="${m}" ${period===m?'selected':''}>${MES_LONG[+mm-1]} ${y}</option>`;}).join('');
  return `<div class="filter"><span style="font-family:var(--mono)">Período</span>
    <select id="period-sel">
      <option value="mes" ${period==='mes'?'selected':''}>Este mês</option>
      <option value="semana" ${period==='semana'?'selected':''}>Esta semana</option>
      <option value="tudo" ${period==='tudo'?'selected':''}>Tudo</option>
      <optgroup label="Meses">${months}</optgroup>
    </select></div>`;
}

function rankingsPanels(list){
  return `<div class="panel">
      <div class="panel-h"><h2>Exames mais frequentes</h2><span class="hint">particular · por valor</span></div>
      <div class="panel-b">${barsHtml(rankBy('exame',list))}</div>
    </div>
    <div class="panel">
      <div class="panel-h"><h2>Médicos que mais solicitam</h2><span class="hint">particular · por valor</span></div>
      <div class="panel-b">${barsHtml(rankBy('medico',list),{accent2:true})}</div>
    </div>`;
}

/* ============================================================
   LAYOUTS
   ============================================================ */
function renderPlanilha(list){
  return `${kpisHtml()}
  <div class="grid-rail section-gap">
    <div class="stack">
      <div class="panel">
        <div class="panel-h"><h2>Planilha de lançamentos particulares</h2>${filterHtml()}</div>
        ${tableHtml(list,{addrow:true})}
      </div>
    </div>
    <div class="stack sticky">
      <div class="panel">
        <div class="panel-h"><h2>US × MG</h2></div>
        <div class="panel-b">${splitHtml(list)}</div>
      </div>
      ${rankingsPanels(list)}
    </div>
  </div>`;
}

function renderPainel(list){
  return `${kpisHtml()}
  <div class="grid-2 section-gap">
    <div class="panel"><div class="panel-h"><h2>Evolução semanal</h2><span class="hint">ganho particular</span></div><div class="panel-b">${trendHtml()}</div></div>
    <div class="panel"><div class="panel-h"><h2>US × MG</h2><span class="hint">${periodLabel()}</span></div><div class="panel-b" style="display:flex;flex-direction:column;justify-content:center;gap:6px">${splitHtml(list)}</div></div>
  </div>
  <div class="grid-2 section-gap">${rankingsPanels(list)}</div>
  <div class="panel section-gap">
    <div class="panel-h"><h2>Lançamentos</h2>${filterHtml()}<button class="btn btn-primary" id="open-form" style="margin-left:12px">+ Novo</button></div>
    ${tableHtml(list)}
  </div>`;
}

function renderLancamento(list){
  const t=totals();
  return `<div class="grid-side">
    <div class="stack sticky">
      <div class="panel">
        <div class="panel-h"><h2>${editId?'Editar lançamento':'Novo lançamento'}</h2><span class="hint">particular</span></div>
        <div class="panel-b">${formHtml()}</div>
      </div>
      <div class="kpis" style="grid-template-columns:1fr 1fr">
        <div class="kpi accent"><div class="lab">Semana</div><div class="val mono" style="font-size:22px">${brl(t.week)}</div></div>
        <div class="kpi accent"><div class="lab">Mês</div><div class="val mono" style="font-size:22px">${brl(t.month)}</div></div>
      </div>
    </div>
    <div class="stack">
      <div class="panel">
        <div class="panel-h"><h2>Lançamentos recentes</h2>${filterHtml()}</div>
        ${tableHtml(list)}
      </div>
      <div class="grid-2">${rankingsPanels(list)}</div>
    </div>
  </div>`;
}

/* ---------- main render ---------- */
function render(){
  document.querySelectorAll('.seg button').forEach(b=>b.setAttribute('aria-selected', b.dataset.layout===layout));
  const list = periodEntries();
  const view=$('#view');
  if(layout==='planilha') view.innerHTML=renderPlanilha(list);
  else if(layout==='painel') view.innerHTML=renderPainel(list);
  else view.innerHTML=renderLancamento(list);
  // focus exame field on lancamento layout for fast entry
  if(layout==='lancamento'){ const f=view.querySelector('input[name=exame]'); if(f && !editId) {/* keep */} }
}

/* ---------- API ---------- */
const API={
  async list(){ const r=await fetch('/api/entries',{headers:{'Accept':'application/json'}}); if(r.status===401) throw 'auth'; if(!r.ok) throw 'erro'; return r.json(); },
  async add(items){ const r=await fetch('/api/entries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(items)}); if(r.status===401) throw 'auth'; if(!r.ok) throw 'erro'; return r.json(); },
  async update(id,e){ const r=await fetch('/api/entries/'+encodeURIComponent(id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(e)}); if(r.status===401) throw 'auth'; if(!r.ok) throw 'erro'; return r.json(); },
  async del(id){ const r=await fetch('/api/entries/'+encodeURIComponent(id),{method:'DELETE'}); if(r.status===401) throw 'auth'; },
  async login(pw){ const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})}); return r.ok; },
  async logout(){ await fetch('/api/logout',{method:'POST'}); }
};

async function reload(){
  try{ entries = await API.list(); }
  catch(e){ if(e==='auth'){ showLogin(); return; } alert('Erro ao carregar os dados. Verifique a conexão e tente novamente.'); return; }
  refreshDatalists(); render();
}

/* ---------- mutations (via servidor) ---------- */
async function addEntries(items){
  if(!items.length) return false;
  try{ await API.add(items); }catch(e){ if(e==='auth')showLogin(); else alert('Não foi possível salvar. Tente novamente.'); return false; }
  await reload(); return true;
}
async function updateEntry(id,d){
  try{ await API.update(id,{exame:d.exame.trim(),proc:d.proc==='MG'?'MG':'US',valor:parseFloat(d.valor),data:d.data,medico:d.medico.trim()}); }
  catch(e){ if(e==='auth')showLogin(); else alert('Não foi possível salvar. Tente novamente.'); return false; }
  await reload(); return true;
}
async function delEntry(id){
  try{ await API.del(id); }catch(e){ if(e==='auth')showLogin(); else alert('Não foi possível excluir. Tente novamente.'); return; }
  await reload();
}

function readForm(form){
  const f=new FormData(form);
  return {exame:f.get('exame'),proc:f.get('proc'),valor:f.get('valor'),data:f.get('data'),medico:f.get('medico')};
}

/* ---------- events ---------- */
function wire(){
  // layout switch
  document.querySelectorAll('.seg button').forEach(b=>b.addEventListener('click',()=>{
    layout=b.dataset.layout; localStorage.setItem(LKEY,layout); editId=null; render();
  }));
  const logoutBtn=$('#logout-btn'); if(logoutBtn) logoutBtn.addEventListener('click',async()=>{ await API.logout(); location.reload(); });
  const exportBtn=$('#export-btn'); if(exportBtn) exportBtn.addEventListener('click',()=>{ window.location='/api/export.csv'; });

  // delegated events inside #view
  const view=$('#view');
  view.addEventListener('submit',async ev=>{
    if(ev.target.id==='entry-form'){
      ev.preventDefault();
      const form=ev.target;
      if(editId){ const d=readForm(form); if(d.proc==='MG')d.exame=MG_EXAME; if(!d.exame||!d.valor||!d.data||!d.medico)return; const id=editId; editId=null; if(!await updateEntry(id,d)){ editId=id; } }
      else { if(await submitEntryForm(form)){ const fx=$('#view').querySelector('input[name=exame]'); if(fx) fx.focus(); } }
    }
  });
  view.addEventListener('click',async ev=>{
    const actBtn=ev.target.closest('[data-act]');
    if(actBtn){
      const act=actBtn.dataset.act;
      if(act==='inline-add'){ submitInline(); return; }
      const tr=actBtn.closest('tr'); const id=tr&&tr.dataset.id; if(!id) return;
      if(act==='del'){ const e=entries.find(x=>x.id===id); if(e && confirm(`Excluir "${e.exame}" (${brl(e.valor)})?`)){ if(editId===id)editId=null; await delEntry(id); } }
      if(act==='edit'){ editId=id; if(layout!=='lancamento'){ layout='lancamento'; localStorage.setItem(LKEY,layout); } render(); window.scrollTo({top:0,behavior:'smooth'}); }
      return;
    }
    if(ev.target.id==='cancel-edit'){ editId=null; render(); }
    if(ev.target.id==='open-form'){ layout='lancamento'; localStorage.setItem(LKEY,layout); render(); }
  });
  view.addEventListener('change',ev=>{
    if(ev.target.id==='period-sel'){ period=ev.target.value; render(); }
    if(ev.target.name==='proc' && ev.target.closest('#entry-form')){ applyProcUI(ev.target.closest('#entry-form')); }
    if(ev.target.id==='bi-toggle'){ const f=$('#bi-fields'); if(f){ f.style.display=ev.target.checked?'':'none'; if(ev.target.checked){ const x=f.querySelector('[name=exame2]'); if(x)x.focus(); } } }
    if(ev.target.name==='proc' && ev.target.closest('#inline-add')){
      const ex=ev.target.closest('#inline-add').querySelector('[name=exame]');
      if(ev.target.value==='MG'){ ex.value=MG_EXAME; ex.readOnly=true; ex.style.opacity='.55'; }
      else { if(ex.value===MG_EXAME)ex.value=''; ex.readOnly=false; ex.style.opacity='1'; }
    }
  });
  view.addEventListener('keydown',ev=>{
    if(ev.key==='Enter' && ev.target.closest('#inline-add')){ ev.preventDefault(); submitInline(); }
  });
}

function applyProcUI(form){
  const proc=form.querySelector('input[name=proc]:checked').value;
  const ex=form.querySelector('input[name=exame]');
  const bi=form.querySelector('#bi-block');
  const tog=form.querySelector('#bi-toggle');
  const fld=form.querySelector('#bi-fields');
  if(proc==='MG'){
    ex.value=MG_EXAME; ex.readOnly=true; ex.classList.add('locked');
    if(bi)bi.style.display='none'; if(tog)tog.checked=false; if(fld)fld.style.display='none';
  } else {
    ex.readOnly=false; ex.classList.remove('locked');
    if(ex.value===MG_EXAME)ex.value='';
    if(bi)bi.style.display='';
    if(!ex.value)ex.focus();
  }
}

async function submitEntryForm(form){
  const d=readForm(form);
  if(d.proc==='MG') d.exame=MG_EXAME;
  if(!d.exame||!d.valor||!d.data||!d.medico) return false;
  const items=[{exame:d.exame,proc:d.proc,valor:d.valor,data:d.data,medico:d.medico}];
  if(d.proc==='US'){
    const tog=form.querySelector('#bi-toggle');
    const ex2=form.querySelector('[name=exame2]'), val2=form.querySelector('[name=valor2]');
    if(tog && tog.checked && ex2 && ex2.value.trim() && val2 && val2.value){
      items.push({exame:ex2.value, proc:'US', valor:val2.value, data:d.data, medico:d.medico});
    }
  }
  return await addEntries(items);
}

async function submitInline(){
  const row=$('#inline-add'); if(!row) return;
  const get=n=>row.querySelector(`[name=${n}]`);
  const d={exame:get('exame').value,proc:get('proc').value,valor:get('valor').value,data:get('data').value,medico:get('medico').value};
  if(d.proc==='MG') d.exame=MG_EXAME;
  if(!d.exame||!d.valor||!d.medico){ const miss=!d.exame?get('exame'):!d.valor?get('valor'):get('medico'); miss.focus(); miss.style.borderColor='var(--danger)'; return; }
  if(await addEntries([{exame:d.exame,proc:d.proc,valor:d.valor,data:d.data,medico:d.medico}])){ const ni=$('#inline-add'); if(ni) ni.querySelector('[name=exame]').focus(); }
}

/* ---------- login + init ---------- */
function showLogin(){ const ov=$('#login'); if(ov) ov.style.display='grid'; const app=$('.app'); if(app) app.style.display='none'; const pw=$('#login-pw'); if(pw){ pw.value=''; setTimeout(()=>pw.focus(),50); } }
function showApp(){ const ov=$('#login'); if(ov) ov.style.display='none'; const app=$('.app'); if(app) app.style.display=''; }

function wireLogin(){
  const form=$('#login-form'); if(!form) return;
  form.addEventListener('submit',async ev=>{
    ev.preventDefault();
    const pw=$('#login-pw').value; const err=$('#login-err'); const btn=form.querySelector('button');
    btn.disabled=true; err.textContent='';
    let ok=false; try{ ok=await API.login(pw); }catch(e){ ok=false; }
    btn.disabled=false;
    if(ok){ showApp(); await reload(); }
    else { err.textContent='Senha incorreta.'; $('#login-pw').value=''; $('#login-pw').focus(); }
  });
}

async function init(){
  wireLogin();
  wire();
  try{
    entries = await API.list();
    showApp(); refreshDatalists(); render();
  }catch(e){
    showLogin();
  }
}
document.addEventListener('DOMContentLoaded',init);
