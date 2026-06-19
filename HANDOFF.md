# Deploy — Controle de Ganhos Particulares

App web com **login por senha** que salva os lançamentos num banco no servidor.
Acesse de qualquer lugar (consultório, casa, celular) — sempre os mesmos dados.

- **Domínio alvo:** `rafael.hafner.work`
- **Stack:** Node + Express + SQLite (better-sqlite3). Frontend estático servido pelo próprio app.
- **Banco:** um arquivo SQLite em `/app/data/controle.db` — precisa de **volume persistente**.

---

## Estrutura

```
deploy/
├── server.js          API + serve o frontend
├── package.json
├── Dockerfile         imagem pronta p/ EasyPanel
├── .dockerignore
├── .env.example       copie p/ .env e preencha
└── public/            o app (index.html, app.js, styles.css)
```

---

## Passo 1 — Subir os arquivos no VPS

Opção A (recomendada): suba a pasta `deploy/` para um repositório Git (GitHub/Gitea) e
aponte o EasyPanel para ele.
Opção B: copie a pasta `deploy/` direto para o VPS (scp / upload) e use build local.

## Passo 2 — Criar o serviço no EasyPanel

1. **Create → App.**
2. **Source:** o repositório (ou pasta) onde está o conteúdo de `deploy/`.
   - Build: **Dockerfile** (já incluído). Se preferir Nixpacks, o `start` do package.json também funciona.
3. **Environment variables** (aba Environment):
   ```
   APP_PASSWORD   = <a senha que você vai usar para entrar>
   SESSION_SECRET = <string aleatória longa>
   DB_PATH        = /app/data/controle.db
   PORT           = 3000
   ```
   Gere o SESSION_SECRET com:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
4. **Volume persistente (IMPORTANTE — sem isso você perde os dados a cada deploy):**
   - Mount path: `/app/data`
   - Crie/queue um volume nomeado (ex.: `controle-data`).
5. **Porta / Proxy:** porta interna **3000**.
6. **Domain:** adicione `rafael.hafner.work` e ative HTTPS (Let's Encrypt do EasyPanel ou via Cloudflare — veja Passo 3).
7. **Deploy.**

## Passo 3 — DNS no Cloudflare (zona hafner.work)

Crie um registro apontando o subdomínio para o VPS:

```
Tipo:  A      (ou CNAME para o host do EasyPanel)
Nome:  rafael
Valor: <IP público do seu VPS Hostinger>
```

Sobre o SSL — escolha **uma** abordagem:

- **EasyPanel emite o certificado (Let's Encrypt):** deixe o registro Cloudflare como
  **DNS only (nuvem cinza)** até o certificado ser emitido. Depois pode voltar a proxiar.
- **Cloudflare proxia (nuvem laranja):** mantenha SSL/TLS em **Full** (ou Full strict) no
  painel da Cloudflare; o EasyPanel serve HTTPS internamente.

> O cookie de login é `Secure` — o site **precisa** abrir em `https://`. Com Cloudflare/EasyPanel
> em HTTPS isso já está garantido.

## Passo 4 — Primeiro acesso

Abra `https://rafael.hafner.work`, digite a senha (`APP_PASSWORD`) e comece a lançar.
A lista de exames de US já vem com o catálogo real; novos exames digitados ficam salvos
como sugestão automaticamente. "Exportar" baixa um CSV que abre no Excel.

---

## Rodar localmente para testar (opcional)

```bash
cd deploy
cp .env.example .env      # edite APP_PASSWORD e SESSION_SECRET
npm install
node --env-file=.env server.js   # Node 20+; ou exporte as variáveis manualmente
# abra http://localhost:3000
```

## Backup do banco

O banco é o arquivo em `DB_PATH` (`/app/data/controle.db`). Para backup, baixe esse arquivo
periodicamente (mais o `-wal`/`-shm` se existirem) — ou agende um job que copia o volume.
Restaurar = repor o arquivo no mesmo caminho e reiniciar o serviço.

---

## Mensagem pronta para colar no Claude Code do VPS

> Tenho a pasta `deploy/` (Node + Express + SQLite, Dockerfile incluído) deste app de
> controle de ganhos. Faça o deploy no EasyPanel deste VPS como um App via Dockerfile, com:
> volume persistente em `/app/data`, porta 3000, e as variáveis APP_PASSWORD, SESSION_SECRET
> (gere uma aleatória), DB_PATH=/app/data/controle.db. Configure o domínio
> `rafael.hafner.work` com HTTPS. Me diga o IP/host que devo apontar no Cloudflare e confirme
> quando estiver no ar.

---

## API (referência)

| Método | Rota                  | Descrição                          |
|--------|-----------------------|------------------------------------|
| POST   | `/api/login`          | `{password}` → cookie de sessão    |
| POST   | `/api/logout`         | encerra sessão                     |
| GET    | `/api/entries`        | lista lançamentos                  |
| POST   | `/api/entries`        | cria (objeto **ou** array p/ bilateral) |
| PUT    | `/api/entries/:id`    | edita                              |
| DELETE | `/api/entries/:id`    | exclui                             |
| GET    | `/api/export.csv`     | baixa CSV (Excel)                  |

Campos de um lançamento: `exame`, `proc` (`US`|`MG`), `valor`, `data` (`YYYY-MM-DD`), `medico`.
