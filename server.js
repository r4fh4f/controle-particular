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
const PASSWORD = process.env.APP_PASSWORD || 'troque-esta-senha';
const SECRET   = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const DB_PATH  = process.env.DB_PATH || path.join(__dirname, 'data', 'controle.db');
const MAX_AGE  = 60 * 24 * 3600 * 1000; // 60 dias

// ---- banco de dados (arquivo único, deve ficar num volume persistente) ----
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
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
)`);

// ---- app ----
const app = express();
app.set('trust proxy', 1);            // atrás do Cloudflare / EasyPanel
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

// ---- auth: token = timestamp.hmac ----
function makeToken() {
  const ts = Date.now();
  const sig = crypto.createHmac('sha256', SECRET).update('auth' + ts).digest('hex');
  return ts + '.' + sig;
}
function validToken(t) {
  if (!t) return false;
  const [ts, sig] = String(t).split('.');
  if (!ts || !sig) return false;
  const expect = crypto.createHmac('sha256', SECRET).update('auth' + ts).digest('hex');
  let ok = false;
  try { ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect)); } catch (e) { ok = false; }
  return ok && (Date.now() - Number(ts) < MAX_AGE);
}
function auth(req, res, next) {
  if (validToken(req.cookies.token)) return next();
  res.status(401).json({ error: 'auth' });
}
const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: true, maxAge: MAX_AGE, path: '/' };

// ---- rotas de sessão ----
app.post('/api/login', (req, res) => {
  const pw = (req.body && req.body.password) || '';
  const ok = pw.length === PASSWORD.length &&
             crypto.timingSafeEqual(Buffer.from(pw.padEnd(64)), Buffer.from(PASSWORD.padEnd(64)));
  if (ok) { res.cookie('token', makeToken(), cookieOpts); res.json({ ok: true }); }
  else { res.status(401).json({ error: 'senha' }); }
});
app.post('/api/logout', (req, res) => { res.clearCookie('token', { path: '/' }); res.json({ ok: true }); });
app.get('/api/me', (req, res) => res.json({ auth: validToken(req.cookies.token) }));

// ---- helpers ----
function clean(e) {
  return {
    exame:  String(e.exame || '').trim().slice(0, 160),
    proc:   e.proc === 'MG' ? 'MG' : 'US',
    valor:  Math.round((Number(e.valor) || 0) * 100) / 100,
    data:   /^\d{4}-\d{2}-\d{2}$/.test(e.data) ? e.data : new Date().toISOString().slice(0, 10),
    medico: String(e.medico || '').trim().slice(0, 120),
  };
}
function valid(e) { return e.exame && e.medico && e.valor > 0; }

// ---- CRUD ----
app.get('/api/entries', auth, (req, res) => {
  res.json(db.prepare('SELECT id,exame,proc,valor,data,medico FROM entries ORDER BY data DESC, created_at DESC').all());
});

app.post('/api/entries', auth, (req, res) => {
  const items = (Array.isArray(req.body) ? req.body : [req.body]).map(clean).filter(valid);
  if (!items.length) return res.status(400).json({ error: 'invalido' });
  const ins = db.prepare('INSERT INTO entries(id,exame,proc,valor,data,medico,created_at) VALUES(?,?,?,?,?,?,?)');
  const ids = [];
  db.transaction(() => {
    for (const e of items) {
      const id = 'e' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
      ins.run(id, e.exame, e.proc, e.valor, e.data, e.medico, Date.now());
      ids.push(id);
    }
  })();
  res.json({ ok: true, ids });
});

app.put('/api/entries/:id', auth, (req, res) => {
  const e = clean(req.body);
  if (!valid(e)) return res.status(400).json({ error: 'invalido' });
  const r = db.prepare('UPDATE entries SET exame=?,proc=?,valor=?,data=?,medico=? WHERE id=?')
              .run(e.exame, e.proc, e.valor, e.data, e.medico, req.params.id);
  res.json({ ok: r.changes > 0 });
});

app.delete('/api/entries/:id', auth, (req, res) => {
  db.prepare('DELETE FROM entries WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---- exportar CSV (abre no Excel) ----
app.get('/api/export.csv', auth, (req, res) => {
  const rows = db.prepare('SELECT data,exame,proc,valor,medico FROM entries ORDER BY data DESC, created_at DESC').all();
  const esc = s => '"' + String(s).replace(/"/g, '""') + '"';
  const head = ['Data', 'Exame', 'Procedimento', 'Valor', 'Medico solicitante'].join(';');
  const body = rows.map(r => [
    r.data.split('-').reverse().join('/'),
    esc(r.exame),
    r.proc === 'MG' ? 'Mamografia' : 'Ultrassom',
    String(r.valor).replace('.', ','),
    esc(r.medico),
  ].join(';')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ganhos-particulares.csv"');
  res.send('\ufeff' + head + '\r\n' + body);   // BOM p/ acentos no Excel
});

// ---- estáticos (frontend) ----
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => console.log('Controle de Ganhos rodando na porta ' + PORT));
