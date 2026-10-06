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
  { nome: 'Controle de Ganhos Particulares', inicial: 'R', accent: [0.88, 0.20, 128], accent2: [0.80, 0.13, 248] },
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

const PAGAMENTOS = ['dinheiro', 'pix', 'debito', 'credito', 'credito_parc'];
const CARTOES = ['debito', 'credito', 'credito_parc'];
const TAXAS_PADRAO = { debito: 1.5, credito: 3.5, credito_parc: 5.0 };

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
app.get('/api/config', (req, res) => res.json({ nome: SITE.nome, inicial: SITE.inicial }));

// tema por site (cor de destaque vem do site.config.json)
app.get('/theme.css', (req, res) => {
  const [l, c, h] = SITE.accent, [l2, c2, h2] = SITE.accent2;
  res.type('text/css').send(`:root{
  --accent:oklch(${l} ${c} ${h});
  --accent-hover:oklch(${Math.min(0.96, l + 0.05)} ${c} ${h});
  --accent-ink:oklch(0.22 0.07 ${h});
  --accent-2:oklch(${l2} ${c2} ${h2});
  --accent-2-ink:oklch(0.22 0.05 ${h2});
}`);
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
});

app.put('/api/entries/:id', auth, (req, res) => {
  const atual = db.prepare('SELECT pagamento FROM entries WHERE id=? AND deleted_at IS NULL').get(req.params.id);
  if (!atual) return res.status(404).json({ error: 'não encontrado' });
  const e = clean(req.body, { permitirSemPagamento: atual.pagamento === null });
  if (e.erro) return res.status(400).json({ error: e.erro });
  db.prepare('UPDATE entries SET exame=?,proc=?,valor=?,data=?,medico=?,pagamento=?,taxa=?,updated_at=? WHERE id=?')
    .run(e.exame, e.proc, e.valor, e.data, e.medico, e.pagamento, e.taxa, Date.now(), req.params.id);
  res.json({ ok: true });
});

// excluir = mandar para a lixeira (dá para desfazer)
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
});
app.get('/api/trash', auth, (req, res) => {
  res.json(db.prepare(`SELECT ${COLS},deleted_at FROM entries WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all());
});

/* ---------- ajustes (taxas da maquininha) ---------- */
app.get('/api/settings', auth, (req, res) => {
  res.json({ taxas: getSetting('taxas', TAXAS_PADRAO), taxasConferidas: getSetting('taxasConferidas', false) });
});
app.put('/api/settings', auth, (req, res) => {
  const t = (req.body && req.body.taxas) || {};
  const taxas = {};
  for (const k of CARTOES) {
    const v = round2(Number(t[k]));
    if (!(v >= 0 && v <= 30)) return res.status(400).json({ error: 'taxa inválida (0 a 30%)' });
    taxas[k] = v;
  }
  setSetting('taxas', taxas); setSetting('taxasConferidas', true);
  res.json({ ok: true });
});

/* ---------- exportar CSV (abre no Excel) ---------- */
const NOME_PAG = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito à vista', credito_parc: 'Crédito parcelado' };
app.get('/api/export.csv', auth, (req, res) => {
  const de = validDate(req.query.de) ? req.query.de : '0000-01-01';
  const ate = validDate(req.query.ate) ? req.query.ate : '9999-12-31';
  const rows = db.prepare(`SELECT data,exame,proc,valor,medico,pagamento,taxa FROM entries
                           WHERE deleted_at IS NULL AND data BETWEEN ? AND ? ORDER BY data, created_at`).all(de, ate);
  // aspas + neutraliza fórmulas (=, +, -, @) para o Excel
  const esc = s => { s = String(s); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const num = n => n.toFixed(2).replace('.', ',');
  const head = ['Data', 'Exame', 'Procedimento', 'Médico solicitante', 'Pagamento', 'Valor bruto', 'Taxa %', 'Valor líquido'].join(';');
  const body = rows.map(r => [
    r.data.split('-').reverse().join('/'),
    esc(r.exame),
    r.proc === 'MG' ? 'Mamografia' : 'Ultrassom',
    esc(r.medico),
    r.pagamento ? NOME_PAG[r.pagamento] : 'Não informado',
    num(r.valor),
    num(r.taxa || 0),
    num(round2(r.valor * (1 - (r.taxa || 0) / 100))),
  ].join(';')).join('\r\n');
  const nome = req.query.nome && /^[\w-]{1,40}$/.test(req.query.nome) ? req.query.nome : 'ganhos-particulares';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}.csv"`);
  res.send('﻿' + head + '\r\n' + body);   // BOM p/ acentos no Excel
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
