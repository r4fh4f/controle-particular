/* ============================================================
   Controle de Ganhos Particulares — Backend
   Node + Express + SQLite (better-sqlite3) · login por senha
   ============================================================ */
'use strict';

const express = require('express');
const Database = require('better-sqlite3');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const PORT     = process.env.PORT || 3000;
const PASSWORD = process.env.APP_PASSWORD || '';
const DB_PATH  = process.env.DB_PATH || path.join(__dirname, 'data', 'controle.db');
const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups');
const SESSION_DAYS = 30;
const BACKUPS_KEEP = 30;   // cópias diárias mantidas
const TRASH_DAYS   = 90;   // lixeira

// Senha obrigatória: nunca subir com senha padrão ou vazia
const SENHAS_PADRAO = ['', 'troque-esta-senha', 'coloque-uma-senha-forte'];
if (SENHAS_PADRAO.includes(PASSWORD)) {
  console.error('ERRO: defina APP_PASSWORD (variável de ambiente) com uma senha forte. Servidor não iniciado.');
  process.exit(1);
}
if (PASSWORD.length < 10) console.warn('AVISO: APP_PASSWORD tem menos de 10 caracteres — considere uma senha mais longa.');

// Identidade visual do site (único arquivo que difere entre as cópias)
const SITE = Object.assign(
  { nome: 'Controle de Ganhos Particulares', dono: '', inicial: 'R', accent: [0.82, 0.14, 75], accent2: [0.68, 0.16, 255] },
  JSON.parse(fs.readFileSync(path.join(__dirname, 'site.config.json'), 'utf8'))
);

/* ---------- banco de dados ---------- */
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS entries(
  id         TEXT PRIMARY KEY,
  exame      TEXT NOT NULL,
  proc       TEXT NOT NULL,
  valor      REAL NOT NULL,
  data       TEXT NOT NULL,
  medico     TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions(
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings(
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);`);
// migração: colunas novas (bancos antigos ganham os campos sem perder dados)
const cols = db.prepare('PRAGMA table_info(entries)').all().map(c => c.name);
const addCol = (name, def) => { if (!cols.includes(name)) db.exec(`ALTER TABLE entries ADD COLUMN ${name} ${def}`); };
addCol('pagamento', 'TEXT');                   // null = lançamento antigo (não informado)
addCol('taxa', 'REAL NOT NULL DEFAULT 0');     // % da maquininha no momento do lançamento
addCol('atendimento', 'TEXT');                 // agrupa exames do mesmo paciente/atendimento
addCol('deleted_at', 'INTEGER');               // lixeira
addCol('updated_at', 'INTEGER');
db.exec('CREATE INDEX IF NOT EXISTS idx_entries_data ON entries(data)');

const PAGAMENTOS = ['dinheiro', 'pix', 'debito', 'credito', 'credito_parc'];   // credito_parc = legado (sem nº de parcelas)
const CARTOES = ['debito', 'credito', 'credito_parc'];
const MAX_PARCELAS = 12;

function getSetting(key, fallback) {
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return r ? JSON.parse(r.value) : fallback;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(key, JSON.stringify(value));
}

/* ---------- app ---------- */
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);            // atrás do Cloudflare / EasyPanel
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

// cabeçalhos de segurança
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'", "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com", "img-src 'self' data:", "connect-src 'self'",
    "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'", "object-src 'none'",
  ].join('; '));
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});

/* ---------- sessões (guardadas no banco: "Sair" invalida de verdade) ---------- */
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const cookieOpts = { httpOnly: true, sameSite: 'strict', secure: true, path: '/', maxAge: SESSION_DAYS * 864e5 };

function sessionOf(req) {
  const t = req.cookies.sid;
  if (!t || typeof t !== 'string' || t.length !== 64) return null;
  const s = db.prepare('SELECT token_hash,expires_at FROM sessions WHERE token_hash=?').get(sha256(t));
  if (!s || s.expires_at < Date.now()) return null;
  return s;
}
function auth(req, res, next) {
  const s = sessionOf(req);
  if (!s) return res.status(401).json({ error: 'auth' });
  // renovação deslizante (no máx. 1x por dia)
  const novo = Date.now() + SESSION_DAYS * 864e5;
  if (novo - s.expires_at > 864e5) {
    db.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').run(novo, s.token_hash);
    res.cookie('sid', req.cookies.sid, cookieOpts);
  }
  next();
}
// proteção CSRF: toda requisição que altera dados precisa deste cabeçalho
// (um site de terceiros não consegue enviá-lo sem permissão CORS)
function csrf(req, res, next) {
  if (req.method === 'GET' || req.get('X-Requested-With') === 'controle') return next();
  res.status(403).json({ error: 'csrf' });
}
app.use('/api', csrf);

/* ---------- login com limite de tentativas ---------- */
const HMAC_KEY = crypto.randomBytes(32);
const digest = s => crypto.createHmac('sha256', HMAC_KEY).update(String(s)).digest();
const PW_DIGEST = digest(PASSWORD);
const JANELA = 15 * 60 * 1000;
const falhas = new Map();    // ip -> [timestamps]
let falhasGlobais = [];

function clientIp(req) { return req.get('cf-connecting-ip') || req.ip || '?'; }
function recentes(arr) { const lim = Date.now() - JANELA; return arr.filter(t => t > lim); }

app.post('/api/login', (req, res) => {
  const ip = clientIp(req);
  const minhas = recentes(falhas.get(ip) || []);
  falhasGlobais = recentes(falhasGlobais);
  if (minhas.length >= 5 || falhasGlobais.length >= 30) {
    const espera = Math.ceil((Math.min(...(minhas.length >= 5 ? minhas : falhasGlobais)) + JANELA - Date.now()) / 60000);
    return res.status(429).json({ error: 'bloqueado', minutos: Math.max(1, espera) });
  }
  const pw = req.body && typeof req.body.password === 'string' ? req.body.password : '';
  if (crypto.timingSafeEqual(digest(pw), PW_DIGEST)) {
    falhas.delete(ip);
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions(token_hash,created_at,expires_at) VALUES(?,?,?)')
      .run(sha256(token), Date.now(), Date.now() + SESSION_DAYS * 864e5);
    res.cookie('sid', token, cookieOpts);
    return res.json({ ok: true });
  }
  minhas.push(Date.now()); falhas.set(ip, minhas); falhasGlobais.push(Date.now());
  if (falhas.size > 1000) for (const [k, v] of falhas) if (!recentes(v).length) falhas.delete(k);
  setTimeout(() => res.status(401).json({ error: 'senha', restantes: Math.max(0, 5 - minhas.length) }), 400);
});
app.post('/api/logout', (req, res) => {
  if (req.cookies.sid) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha256(String(req.cookies.sid)));
  res.clearCookie('sid', { path: '/', secure: true, sameSite: 'strict', httpOnly: true });
  res.json({ ok: true });
});
app.post('/api/logout-all', auth, (req, res) => {
  db.prepare('DELETE FROM sessions').run();
  res.clearCookie('sid', { path: '/', secure: true, sameSite: 'strict', httpOnly: true });
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => res.json({ auth: !!sessionOf(req) }));
app.get('/api/config', (req, res) => res.json({ nome: SITE.nome, dono: SITE.dono, inicial: SITE.inicial }));

// tema por site: cor do caliper (destaque) e da mamografia vêm do site.config.json
app.get('/theme.css', (req, res) => {
  const [l, c, h] = SITE.accent, [l2, c2, h2] = SITE.accent2;
  res.type('text/css').send(`:root{--caliper:oklch(${l} ${c} ${h});--mg:oklch(${l2} ${c2} ${h2})}`);
});

/* ---------- helpers ---------- */
function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
function procOf(exame) { return /mamografia/i.test(exame) ? 'MG' : 'US'; }
const round2 = n => Math.round(n * 100) / 100;

// valida e normaliza um lançamento; retorna {erro} ou o objeto limpo
function clean(e, { permitirSemPagamento = false } = {}) {
  if (!e || typeof e !== 'object') return { erro: 'dados inválidos' };
  const exame = String(e.exame || '').trim().slice(0, 160);
  const medico = String(e.medico || '').trim().slice(0, 120);
  const valor = round2(Number(e.valor));
  if (!exame) return { erro: 'informe o exame' };
  if (!medico) return { erro: 'informe o médico solicitante' };
  if (!(valor > 0 && valor < 1e6)) return { erro: 'valor inválido' };
  if (!validDate(e.data)) return { erro: 'data inválida' };
  let pagamento = e.pagamento == null || e.pagamento === '' ? null : String(e.pagamento);
  if (pagamento === null && !permitirSemPagamento) return { erro: 'informe a forma de pagamento' };
  if (pagamento !== null && !PAGAMENTOS.includes(pagamento)) return { erro: 'forma de pagamento inválida' };
  let taxa = CARTOES.includes(pagamento) ? round2(Number(e.taxa)) : 0;
  if (!(taxa >= 0 && taxa <= 30)) return { erro: 'taxa inválida (0 a 30%)' };
  return { exame, proc: procOf(exame), valor, data: e.data, medico, pagamento, taxa };
}

const COLS = 'id,exame,proc,valor,data,medico,pagamento,taxa,atendimento,created_at';
const novoId = () => 'e' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
const num2 = n => n.toFixed(2).replace('.', ',');

/* ---------- maquininhas (cada unidade da clínica tem a sua, com taxas próprias) ---------- */
const MAQ_PADRAO = [{ id: 'ecos1', nome: 'ECOS I' }, { id: 'ecos2', nome: 'ECOS II' }];
const CREDITO_PADRAO = [3.5, 4.9, 5.6, 6.3, 7.0, 7.6, 8.3, 8.9, 9.5, 10.1, 10.7, 11.3];   // 1x (à vista) .. 12x
function getMaquinas() {
  let m = getSetting('maquinas', null);
  if (!Array.isArray(m) || !m.length) {
    // primeira vez: parte das taxas únicas da versão anterior, se existirem
    const old = getSetting('taxas', null) || {};
    m = MAQ_PADRAO.map(x => ({
      id: x.id, nome: x.nome,
      debito: old.debito != null ? old.debito : 1.5,
      credito: CREDITO_PADRAO.map((v, i) => i === 0 ? (old.credito != null ? old.credito : v) : (old.credito_parc != null ? old.credito_parc : v)),
    }));
    setSetting('maquinas', m);
    setSetting('taxasConferidas', false);   // tabela nova, por parcela: pede conferência
  }
  return m;
}
function taxaTabela(maqs, forma, maquina, parcelas) {
  const m = maqs.find(x => x.id === maquina);
  if (!m) return 0;
  if (forma === 'debito') return m.debito || 0;
  if (forma === 'credito') return m.credito[Math.min(MAX_PARCELAS, Math.max(1, parcelas || 1)) - 1] || 0;
  return 0;
}
getMaquinas();

/* ---------- pagamentos: pertencem ao atendimento e podem ser divididos ---------- */
db.exec(`CREATE TABLE IF NOT EXISTS pagamentos(
  id           TEXT PRIMARY KEY,
  atendimento  TEXT NOT NULL,
  forma        TEXT NOT NULL,
  maquina      TEXT,
  maquina_nome TEXT,
  parcelas     INTEGER,
  valor        REAL NOT NULL,
  taxa         REAL NOT NULL DEFAULT 0,
  ordem        INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pag_atendimento ON pagamentos(atendimento);`);
const novoPagId = () => 'p' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
const insPagamento = db.prepare('INSERT INTO pagamentos(id,atendimento,forma,maquina,maquina_nome,parcelas,valor,taxa,ordem,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
const insEntry = db.prepare(`INSERT INTO entries(id,exame,proc,valor,data,medico,pagamento,taxa,atendimento,created_at,updated_at)
                             VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
const WHERE_AT = '(atendimento=? OR (atendimento IS NULL AND id=?))';
function gravarPagamentos(key, pagamentos, now) {
  db.prepare('DELETE FROM pagamentos WHERE atendimento=?').run(key);
  pagamentos.forEach((p, i) => insPagamento.run(novoPagId(), key, p.forma, p.maquina, p.maquina_nome, p.parcelas, p.valor, p.taxa, i, now));
}
// migração: lançamentos da versão anterior (pagamento no exame) ganham registro de pagamento
if (!getSetting('migr_pagamentos_v1', false)) {
  const rows = db.prepare('SELECT id,atendimento,pagamento,taxa,valor,created_at FROM entries WHERE pagamento IS NOT NULL AND deleted_at IS NULL').all();
  const comPag = new Set(db.prepare('SELECT DISTINCT atendimento FROM pagamentos').all().map(r => r.atendimento));
  const grupos = new Map();
  for (const r of rows) {
    const k = r.atendimento || r.id; if (comPag.has(k)) continue;
    if (!grupos.has(k)) grupos.set(k, new Map());
    const g = grupos.get(k), gk = r.pagamento + '|' + (r.taxa || 0);
    const pg = g.get(gk) || { forma: r.pagamento, taxa: r.taxa || 0, valor: 0, created_at: r.created_at };
    pg.valor = round2(pg.valor + r.valor); g.set(gk, pg);
  }
  db.transaction(() => {
    db.prepare('UPDATE entries SET atendimento=id WHERE atendimento IS NULL AND pagamento IS NOT NULL').run();
    for (const [k, g] of grupos) [...g.values()].forEach((pg, i) =>
      insPagamento.run(novoPagId(), k, pg.forma, null, null, pg.forma === 'credito' ? 1 : null, pg.valor, pg.taxa, i, pg.created_at));
  })();
  setSetting('migr_pagamentos_v1', true);
}

// valida um atendimento inteiro: exames + formas de pagamento (que precisam somar o total)
function cleanAtendimento(b, { novo }) {
  if (!b || typeof b !== 'object') return { erro: 'dados inválidos' };
  const medico = String(b.medico || '').trim().slice(0, 120);
  if (!validDate(b.data)) return { erro: 'data inválida' };
  if (!medico) return { erro: 'informe o médico solicitante' };
  const exs = Array.isArray(b.exames) ? b.exames : [];
  if (!exs.length || exs.length > 20) return { erro: 'informe de 1 a 20 exames' };
  const exames = [];
  for (const x of exs) {
    const exame = String((x && x.exame) || '').trim().slice(0, 160), valor = round2(Number(x && x.valor));
    if (!exame) return { erro: 'informe o nome do exame' };
    if (!(valor > 0 && valor < 1e6)) return { erro: `valor inválido para "${exame}"` };
    const id = x && typeof x.id === 'string' && /^e[0-9a-z]{6,40}$/.test(x.id) ? x.id : null;
    exames.push({ id, exame, proc: procOf(exame), valor });
  }
  const bruto = round2(exames.reduce((s, x) => s + x.valor, 0));
  const pgs = Array.isArray(b.pagamentos) ? b.pagamentos : [];
  if (!pgs.length && novo) return { erro: 'informe a forma de pagamento' };
  if (pgs.length > 4) return { erro: 'no máximo 4 formas de pagamento por atendimento' };
  const maqs = getMaquinas(), pagamentos = [];
  for (const pg of pgs) {
    const forma = String((pg && pg.forma) || '');
    if (!PAGAMENTOS.includes(forma) || (novo && forma === 'credito_parc')) return { erro: 'forma de pagamento inválida' };
    const valor = round2(Number(pg.valor));
    if (!(valor > 0)) return { erro: 'valor de pagamento inválido' };
    let maquina = null, maquina_nome = null, parcelas = null, taxa = 0;
    if (forma === 'debito' || forma === 'credito') {
      if (pg.maquina != null && pg.maquina !== '') {
        const m = maqs.find(x => x.id === pg.maquina);
        if (!m) return { erro: 'maquininha inválida' };
        maquina = m.id; maquina_nome = m.nome;
      } else if (novo) return { erro: 'escolha a maquininha' };
      if (forma === 'credito') {
        if (pg.parcelas != null && pg.parcelas !== '') {
          parcelas = Number(pg.parcelas);
          if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > MAX_PARCELAS) return { erro: 'número de parcelas inválido' };
        } else if (novo) return { erro: 'informe o número de parcelas' };
      }
    }
    if (CARTOES.includes(forma)) {
      taxa = pg.taxa != null && pg.taxa !== '' ? Math.round(Number(pg.taxa) * 100) / 100 : taxaTabela(maqs, forma, maquina, parcelas);
      if (!(taxa >= 0 && taxa <= 30)) return { erro: 'taxa inválida (0 a 30%)' };
    }
    pagamentos.push({ forma, maquina, maquina_nome, parcelas, valor, taxa });
  }
  if (pagamentos.length) {
    const soma = round2(pagamentos.reduce((s, x) => s + x.valor, 0));
    if (Math.abs(soma - bruto) > 0.011) return { erro: `a soma dos pagamentos (R$ ${num2(soma)}) não confere com o total dos exames (R$ ${num2(bruto)})` };
  }
  // cada exame guarda a taxa efetiva do atendimento: a soma dos líquidos dos exames = líquido real
  const taxaEf = pagamentos.length ? Math.round(pagamentos.reduce((s, x) => s + x.valor * x.taxa, 0) / bruto * 10000) / 10000 : 0;
  const resumo = !pagamentos.length ? null : pagamentos.length === 1 ? pagamentos[0].forma : 'misto';
  return { data: b.data, medico, exames, pagamentos, taxaEf, resumo };
}

/* ---------- lançamentos ---------- */
app.get('/api/entries', auth, (req, res) => {
  res.json(db.prepare(`SELECT ${COLS} FROM entries WHERE deleted_at IS NULL ORDER BY data DESC, created_at DESC`).all());
});

// cria um atendimento: um ou vários exames com mesma data, médico e pagamento
app.post('/api/entries', auth, (req, res) => {
  const raw = Array.isArray(req.body) ? req.body : [req.body];
  if (!raw.length || raw.length > 20) return res.status(400).json({ error: 'quantidade de exames inválida' });
  const items = [];
  for (const r of raw) { const c = clean(r); if (c.erro) return res.status(400).json({ error: c.erro }); items.push(c); }
  const atendimento = 'a' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
  const ins = db.prepare(`INSERT INTO entries(id,exame,proc,valor,data,medico,pagamento,taxa,atendimento,created_at,updated_at)
                          VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
  const ids = [];
  db.transaction(() => {
    const now = Date.now();
    for (const e of items) {
      const id = novoId();
      ins.run(id, e.exame, e.proc, e.valor, e.data, e.medico, e.pagamento, e.taxa, atendimento, now, now);
      ids.push(id);
    }
  })();
  res.json({ ok: true, ids });
  agendarMarco();
});

app.put('/api/entries/:id', auth, (req, res) => {
  const atual = db.prepare('SELECT pagamento FROM entries WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!atual) return res.status(404).json({ error: 'não encontrado' });
  const e = clean(req.body, { permitirSemPagamento: atual.pagamento === null });
  if (e.erro) return res.status(400).json({ error: e.erro });
  db.prepare('UPDATE entries SET exame=?,proc=?,valor=?,data=?,medico=?,pagamento=?,taxa=?,updated_at=? WHERE id=?')
    .run(e.exame, e.proc, e.valor, e.data, e.medico, e.pagamento, e.taxa, Date.now(), req.params.id);
  res.json({ ok: true });
  agendarMarco();
});

/* ---------- atendimentos ---------- */
const chaveAt = k => typeof k === 'string' && /^[ae][0-9a-z]{4,40}$/.test(k) ? k : null;
app.get('/api/pagamentos', auth, (req, res) => {
  res.json(db.prepare('SELECT id,atendimento,forma,maquina,maquina_nome,parcelas,valor,taxa,ordem FROM pagamentos WHERE deleted_at IS NULL ORDER BY atendimento, ordem').all());
});
app.post('/api/atendimentos', auth, (req, res) => {
  const a = cleanAtendimento(req.body, { novo: true });
  if (a.erro) return res.status(400).json({ error: a.erro });
  const key = 'a' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
  const now = Date.now(), ids = [];
  db.transaction(() => {
    a.exames.forEach((x, j) => { const id = novoId(); insEntry.run(id, x.exame, x.proc, x.valor, a.data, a.medico, a.resumo, a.taxaEf, key, now + j, now); ids.push(id); });
    gravarPagamentos(key, a.pagamentos, now);
  })();
  res.json({ ok: true, atendimento: key, ids });
  agendarMarco();
});
// edita o atendimento inteiro: exames (inclui, altera, remove), data, médico e pagamentos
app.put('/api/atendimentos/:key', auth, (req, res) => {
  const key = chaveAt(req.params.key);
  const atuais = key ? db.prepare(`SELECT id FROM entries WHERE deleted_at IS NULL AND ${WHERE_AT}`).all(key, key).map(r => r.id) : [];
  if (!atuais.length) return res.status(404).json({ error: 'atendimento não encontrado' });
  const a = cleanAtendimento(req.body, { novo: false });
  if (a.erro) return res.status(400).json({ error: a.erro });
  const now = Date.now(), ativos = new Set(atuais), manter = new Set(), ids = [];
  const upd = db.prepare('UPDATE entries SET exame=?,proc=?,valor=?,data=?,medico=?,pagamento=?,taxa=?,atendimento=?,updated_at=? WHERE id=?');
  const existe = db.prepare('SELECT 1 FROM entries WHERE id=?');
  db.transaction(() => {
    a.exames.forEach((x, j) => {
      if (x.id && ativos.has(x.id)) upd.run(x.exame, x.proc, x.valor, a.data, a.medico, a.resumo, a.taxaEf, key, now, x.id);
      else { x.id = x.id && !existe.get(x.id) ? x.id : novoId(); insEntry.run(x.id, x.exame, x.proc, x.valor, a.data, a.medico, a.resumo, a.taxaEf, key, now + j, now); }
      manter.add(x.id); ids.push(x.id);
    });
    for (const id of ativos) if (!manter.has(id)) db.prepare('DELETE FROM entries WHERE id=?').run(id);   // o "Desfazer" regrava com o mesmo id
    gravarPagamentos(key, a.pagamentos, now);
  })();
  res.json({ ok: true, ids });
  agendarMarco();
});
const listaChaves = b => Array.isArray(b && b.keys) ? b.keys.map(chaveAt).filter(Boolean).slice(0, 50) : [];
app.post('/api/atendimentos/delete', auth, (req, res) => {
  const keys = listaChaves(req.body), now = Date.now();
  const de = db.prepare(`UPDATE entries SET deleted_at=? WHERE deleted_at IS NULL AND ${WHERE_AT}`);
  const dp = db.prepare('UPDATE pagamentos SET deleted_at=? WHERE deleted_at IS NULL AND atendimento=?');
  db.transaction(() => keys.forEach(k => { de.run(now, k, k); dp.run(now, k); }))();
  res.json({ ok: true });
});
app.post('/api/atendimentos/restore', auth, (req, res) => {
  const keys = listaChaves(req.body);
  const ult = db.prepare(`SELECT MAX(deleted_at) t FROM entries WHERE ${WHERE_AT}`);
  const re = db.prepare(`UPDATE entries SET deleted_at=NULL WHERE deleted_at=? AND ${WHERE_AT}`);
  const rp = db.prepare('UPDATE pagamentos SET deleted_at=NULL WHERE deleted_at=? AND atendimento=?');
  db.transaction(() => keys.forEach(k => { const t = ult.get(k, k).t; if (t) { re.run(t, k, k); rp.run(t, k); } }))();
  res.json({ ok: true });
  agendarMarco();
});

// excluir = mandar para a lixeira (dá para desfazer) — rotas por exame mantidas por compatibilidade
app.post('/api/entries/delete', auth, (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.map(String).slice(0, 50) : [];
  const st = db.prepare('UPDATE entries SET deleted_at=? WHERE id=? AND deleted_at IS NULL');
  const now = Date.now();
  db.transaction(() => ids.forEach(id => st.run(now, id)))();
  res.json({ ok: true });
});
app.post('/api/entries/restore', auth, (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.map(String).slice(0, 50) : [];
  const st = db.prepare('UPDATE entries SET deleted_at=NULL WHERE id=?');
  db.transaction(() => ids.forEach(id => st.run(id)))();
  res.json({ ok: true });
  agendarMarco();
});
app.get('/api/trash', auth, (req, res) => {
  res.json(db.prepare(`SELECT ${COLS},deleted_at FROM entries WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all());
});

/* ---------- ajustes: maquininhas e taxas ---------- */
app.get('/api/settings', auth, (req, res) => {
  res.json({ maquinas: getMaquinas(), taxasConferidas: getSetting('taxasConferidas', false), maxParcelas: MAX_PARCELAS });
});
app.put('/api/settings', auth, (req, res) => {
  const recebidas = req.body && Array.isArray(req.body.maquinas) ? req.body.maquinas : null;
  if (!recebidas) return res.status(400).json({ error: 'dados inválidos' });
  const novas = [];
  for (const m of getMaquinas()) {
    const r = recebidas.find(x => x && x.id === m.id) || {};
    const nome = String(r.nome == null ? m.nome : r.nome).trim().slice(0, 30);
    if (!nome) return res.status(400).json({ error: 'dê um nome para cada maquininha' });
    const val = (v, ant) => v == null || v === '' ? ant : Math.round(Number(v) * 100) / 100;
    const debito = val(r.debito, m.debito);
    const credito = Array.from({ length: MAX_PARCELAS }, (_, k) => val(Array.isArray(r.credito) ? r.credito[k] : undefined, m.credito[k]));
    if (![debito, ...credito].every(v => v >= 0 && v <= 30)) return res.status(400).json({ error: `taxa inválida na ${nome} (use de 0 a 30%)` });
    novas.push({ id: m.id, nome, debito, credito });
  }
  setSetting('maquinas', novas); setSetting('taxasConferidas', true);
  res.json({ ok: true });
});

/* ---------- exportar CSV (abre no Excel) ---------- */
const NOME_PAG = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito à vista', credito_parc: 'Crédito parcelado', misto: 'Misto' };
const NOME_FORMA = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito', credito_parc: 'Crédito parcelado' };
function nomePagamento(p) {
  let s = NOME_FORMA[p.forma] || p.forma;
  if (p.forma === 'credito') s += p.parcelas > 1 ? ` ${p.parcelas}x` : p.parcelas === 1 ? ' à vista' : '';
  if (p.maquina_nome) s += ` (${p.maquina_nome})`;
  return s;
}
// aspas + neutraliza fórmulas (=, +, -, @) para o Excel
const csvEsc = s => { s = String(s == null ? '' : s); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
const periodo = q => [validDate(q.de) ? q.de : '0000-01-01', validDate(q.ate) ? q.ate : '9999-12-31'];
function enviarCsv(res, q, padrao, head, linhas) {
  const nome = q.nome && /^[\w-]{1,40}$/.test(q.nome) ? q.nome : padrao;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}.csv"`);
  res.send('﻿' + head.join(';') + '\r\n' + linhas.map(l => l.join(';')).join('\r\n'));   // BOM p/ acentos no Excel
}
app.get('/api/export.csv', auth, (req, res) => {
  const [de, ate] = periodo(req.query);
  const rows = db.prepare(`SELECT id,atendimento,data,exame,proc,valor,medico,pagamento,taxa FROM entries
                           WHERE deleted_at IS NULL AND data BETWEEN ? AND ? ORDER BY data, created_at`).all(de, ate);
  const pags = new Map();
  for (const p of db.prepare('SELECT * FROM pagamentos WHERE deleted_at IS NULL ORDER BY ordem').all()) {
    if (!pags.has(p.atendimento)) pags.set(p.atendimento, []); pags.get(p.atendimento).push(p);
  }
  const descPag = r => {
    const ps = pags.get(r.atendimento || r.id);
    if (ps && ps.length) return ps.length === 1 ? nomePagamento(ps[0]) : ps.map(p => `${nomePagamento(p)} R$ ${num2(p.valor)}`).join(' + ');
    return r.pagamento ? (NOME_PAG[r.pagamento] || r.pagamento) : 'Não informado';
  };
  enviarCsv(res, req.query, 'ganhos-particulares',
    ['Data', 'Exame', 'Procedimento', 'Médico solicitante', 'Pagamento', 'Valor bruto', 'Taxa %', 'Valor líquido'],
    rows.map(r => [r.data.split('-').reverse().join('/'), csvEsc(r.exame), r.proc === 'MG' ? 'Mamografia' : 'Ultrassom', csvEsc(r.medico),
      csvEsc(descPag(r)), num2(r.valor), num2(r.taxa || 0), num2(round2(r.valor * (1 - (r.taxa || 0) / 100)))]));
});
// uma linha por pagamento: serve para conferir com o extrato de cada maquininha
app.get('/api/export-pagamentos.csv', auth, (req, res) => {
  const [de, ate] = periodo(req.query);
  const rows = db.prepare(`SELECT p.id, p.forma, p.maquina_nome, p.parcelas, p.valor, p.taxa, p.ordem, p.created_at,
      MIN(e.data) AS data, MIN(e.medico) AS medico, GROUP_CONCAT(e.exame, ' + ') AS exames
    FROM pagamentos p JOIN entries e ON e.deleted_at IS NULL AND (e.atendimento = p.atendimento OR (e.atendimento IS NULL AND e.id = p.atendimento))
    WHERE p.deleted_at IS NULL GROUP BY p.id HAVING data BETWEEN ? AND ? ORDER BY data, p.created_at, p.ordem`).all(de, ate);
  enviarCsv(res, req.query, 'pagamentos',
    ['Data', 'Forma', 'Parcelas', 'Maquininha', 'Valor', 'Taxa %', 'Taxa R$', 'Valor líquido', 'Médico solicitante', 'Exames'],
    rows.map(r => [r.data.split('-').reverse().join('/'), NOME_FORMA[r.forma] || r.forma,
      r.forma === 'credito' ? (r.parcelas > 1 ? `${r.parcelas}x` : r.parcelas === 1 ? 'à vista' : '') : '',
      csvEsc(r.maquina_nome || ''), num2(r.valor), num2(r.taxa || 0), num2(round2(r.valor * (r.taxa || 0) / 100)),
      num2(round2(r.valor * (1 - (r.taxa || 0) / 100))), csvEsc(r.medico), csvEsc(r.exames)]));
});

/* ---------- meta conjunta (e-mail de comemoração) ----------
   Cada site responde o próprio total a quem tiver o MARCO_TOKEN.
   O site que tem MARCO_EMAIL_PARA soma o seu total com o do parceiro
   e, ao passar de MARCO_VALOR, envia o e-mail uma única vez. */
const nodemailer = require('nodemailer');
const { emailMarco } = require('./marco-email');
const MARCO = {
  token: process.env.MARCO_TOKEN || '',
  parceiro: (process.env.MARCO_PARCEIRO_URL || '').replace(/\/+$/, ''),
  para: process.env.MARCO_EMAIL_PARA || '',
  valor: Number(process.env.MARCO_VALOR) || 100000,
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
};
const marcoKey = () => 'marco_enviado_' + MARCO.valor;
function resumoLocal() {
  const rows = db.prepare('SELECT id,exame,valor,data,atendimento FROM entries WHERE deleted_at IS NULL').all();
  let bruto = 0, primeiro = null; const at = new Set(), porExame = {}, porMes = {};
  for (const r of rows) {
    bruto += r.valor; at.add(r.atendimento || r.id);
    porExame[r.exame] = (porExame[r.exame] || 0) + 1;
    const m = r.data.slice(0, 7); porMes[m] = round2((porMes[m] || 0) + r.valor);
    if (!primeiro || r.data < primeiro) primeiro = r.data;
  }
  return { dono: SITE.dono || SITE.nome, bruto: round2(bruto), exames: rows.length, atendimentos: at.size, primeiro, porExame, porMes };
}
function marcoTokenOk(t) { return !!MARCO.token && crypto.timingSafeEqual(digest(String(t || '')), digest(MARCO.token)); }
app.get('/api/marco/total', (req, res) => {
  if (!marcoTokenOk(req.get('X-Marco-Token'))) return res.status(404).json({ error: 'não encontrado' });
  res.json(resumoLocal());
});
async function situacaoMarco() {
  const partes = [resumoLocal()]; let erroParceiro = null;
  if (MARCO.parceiro && MARCO.token) {
    try {
      const r = await fetch(MARCO.parceiro + '/api/marco/total', { headers: { 'X-Marco-Token': MARCO.token }, signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error(r.status === 404 ? 'o outro site recusou a chave (MARCO_TOKEN diferente ou ausente)' : 'o outro site respondeu ' + r.status);
      partes.push(await r.json());
    } catch (e) { erroParceiro = e.name === 'TimeoutError' ? 'o outro site não respondeu' : e.message; }
  }
  return {
    valor: MARCO.valor, total: round2(partes.reduce((s, p) => s + p.bruto, 0)), partes, erroParceiro,
    enviado: getSetting(marcoKey(), null),
    emailConfigurado: !!(MARCO.para && MARCO.smtpUser && MARCO.smtpPass),
    parceiroConfigurado: !!(MARCO.parceiro && MARCO.token),
  };
}
async function enviarEmailMarco(s, teste) {
  // SMTP_HOST=console só imprime o e-mail no log (para testes locais)
  const transport = process.env.SMTP_HOST === 'console'
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport({ host: process.env.SMTP_HOST || 'smtp.gmail.com', port: Number(process.env.SMTP_PORT) || 465, secure: true, auth: { user: MARCO.smtpUser, pass: MARCO.smtpPass } });
  const { assunto, html, texto } = emailMarco(s, teste);
  const info = await transport.sendMail({ from: `"Controle de Ganhos" <${MARCO.smtpUser}>`, to: MARCO.para, subject: assunto, html, text: texto });
  if (process.env.SMTP_HOST === 'console') console.log('E-mail (console):', assunto, info.messageId);
}
let marcoRodando = false;
async function verificarMarco() {
  if (marcoRodando) return; marcoRodando = true;
  try {
    if (!MARCO.para || !MARCO.smtpUser || !MARCO.smtpPass || getSetting(marcoKey(), null)) return;
    const s = await situacaoMarco();
    if (s.parceiroConfigurado && s.erroParceiro) return;   // sem o total do outro site, tenta mais tarde
    if (s.total < MARCO.valor) return;
    await enviarEmailMarco(s, false);
    setSetting(marcoKey(), new Date().toISOString());
    console.log(`Meta de ${MARCO.valor} atingida (${s.total}). E-mail enviado para ${MARCO.para}.`);
  } catch (e) { console.error('Meta conjunta:', e.message); }
  finally { marcoRodando = false; }
}
let marcoTimer = 0;
const agendarMarco = () => { clearTimeout(marcoTimer); marcoTimer = setTimeout(verificarMarco, 3000); };
setTimeout(verificarMarco, 30 * 1000);
setInterval(verificarMarco, 3600 * 1000);   // pega também os lançamentos feitos no outro site
app.get('/api/marco', auth, async (req, res) => {
  const s = await situacaoMarco();
  res.json({ ...s, partes: s.partes.map(p => ({ dono: p.dono, bruto: p.bruto, exames: p.exames })) });
});
app.post('/api/marco/teste', auth, async (req, res) => {
  if (!(MARCO.para && MARCO.smtpUser && MARCO.smtpPass)) return res.status(400).json({ error: 'e-mail não configurado (MARCO_EMAIL_PARA, SMTP_USER, SMTP_PASS)' });
  try { await enviarEmailMarco(await situacaoMarco(), true); res.json({ ok: true, para: MARCO.para }); }
  catch (e) { res.status(502).json({ error: 'Falha ao enviar: ' + e.message }); }
});

/* ---------- backup ---------- */
function listBackups() {
  return fs.readdirSync(BACKUP_DIR).filter(f => /^controle-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
}
async function backupDiario() {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const alvo = path.join(BACKUP_DIR, `controle-${hoje}.db`);
    if (!fs.existsSync(alvo)) { await db.backup(alvo); console.log('Backup criado: ' + alvo); }
    const todos = listBackups();
    todos.slice(0, Math.max(0, todos.length - BACKUPS_KEEP)).forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
    // esvazia a lixeira antiga
    db.prepare('DELETE FROM entries WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(Date.now() - TRASH_DAYS * 864e5);
    db.prepare('DELETE FROM pagamentos WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(Date.now() - TRASH_DAYS * 864e5);
    db.prepare('DELETE FROM pagamentos WHERE atendimento NOT IN (SELECT COALESCE(atendimento, id) FROM entries)').run();
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  } catch (e) { console.error('Falha no backup:', e); }
}
setTimeout(backupDiario, 10 * 1000);
setInterval(backupDiario, 3 * 3600 * 1000);

app.get('/api/backup/status', auth, (req, res) => {
  const b = listBackups();
  res.json({ quantidade: b.length, ultimo: b.length ? b[b.length - 1].slice(9, 19) : null });
});
app.get('/api/backup', auth, async (req, res) => {
  const tmp = path.join(BACKUP_DIR, `download-${crypto.randomBytes(6).toString('hex')}.tmp`);
  try {
    await db.backup(tmp);
    const hoje = new Date().toISOString().slice(0, 10);
    res.download(tmp, `controle-backup-${hoje}.db`, () => fs.unlink(tmp, () => {}));
  } catch (e) { fs.unlink(tmp, () => {}); res.status(500).json({ error: 'backup' }); }
});

/* ---------- estáticos (frontend) ---------- */
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => console.log('Controle de Ganhos rodando na porta ' + PORT));
