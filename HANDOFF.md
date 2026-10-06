# Controle de Ganhos Particulares

App web com **login por senha** para lançar e analisar os ganhos de exames particulares (US/MG).

Existem **dois sites com o mesmo código**, cada um com seu banco e sua senha:

| Site | Repositório | Domínio |
|------|-------------|---------|
| Rafael | `r4fh4f/controle-particular` | `rafael.hafner.work` |
| Fernanda | `r4fh4f/controle-fernanda` | `fernanda.hafner.work` |

- **Stack:** Node + Express + SQLite (better-sqlite3). Frontend em JS puro servido pelo próprio app.
- **Banco:** arquivo SQLite em `/app/data/controle.db` — precisa de **volume persistente**.

## Mantendo os dois sites iguais

O código é **idêntico** nos dois repositórios. A única diferença é o arquivo
`site.config.json` (dono, cores):

```json
{ "nome": "...", "dono": "Rafael", "inicial": "R", "accent": [0.82, 0.14, 75], "accent2": [0.68, 0.16, 255] }
```

`accent` é a cor de destaque do site (calipers, cursor, mês aberto) e `accent2` a da etiqueta de
mamografia, em OKLCH (luminosidade, croma, matiz). Ao mudar algo, aplique a mesma mudança nos dois repositórios
e **não copie o `site.config.json`** de um para o outro.

## Visual

Tema "Sonda": o painel é desenhado como um console de ultrassom, sempre escuro.
O mês aparece como um **setor de varredura** (cada linha = um dia, profundidade = ganho bruto,
marcador de foco = média por dia trabalhado) e o ano como um **espectro Doppler**
(ano atual acima da linha de base, ano anterior espelhado abaixo).

## Telas

- **Lançar** (`N`, de qualquer tela) — folha com data, um ou mais exames (`Alt` `+` adiciona),
  médico e pagamento (`1`–`5` ou setas). O valor do exame vem do último valor cobrado. `Enter`
  avança de campo, `Ctrl+Enter` salva. Inclusão, edição e exclusão têm **Desfazer**.
  Na worklist: `J`/`K` navegam, `Enter` edita, `Del` exclui, `/` busca.
- **Mês** — navegação ‹ › (ou setas do teclado) por qualquer mês; bruto, líquido, exames,
  atendimentos e ticket médio com comparação ao mês anterior (no mês corrente, até o mesmo dia);
  gráfico por dia, formas de pagamento, US × MG, rankings de exames e médicos (clique filtra a lista),
  lista com busca, filtros e ordenação; exportar CSV do mês.
- **Ano** — gráfico mês a mês comparando com o ano anterior, tabela mês a mês, média mensal,
  melhor mês, totais por ano; exportar CSV do ano.
- **Ajustes** — taxas da maquininha (débito, crédito à vista, parcelado), backup, lixeira
  (exclusões ficam 90 dias), "sair de todos os dispositivos".

**Taxas:** dinheiro e PIX = 100% líquido. Cartão desconta a taxa configurada. Cada lançamento
guarda a taxa do dia; mudar a taxa em Ajustes vale só para os próximos. Lançamentos antigos
(anteriores a esta versão) aparecem como "Não informado" e contam como 100% líquido.

## Segurança

- Servidor **não inicia** sem `APP_PASSWORD` (ou com a senha de exemplo).
- 5 senhas erradas em 15 min bloqueiam o login daquele IP por 15 min (e 30 erros no total bloqueiam todos).
- Sessões guardadas no banco: "Sair" invalida de verdade; duração de 30 dias (renovada com o uso).
- Proteção CSRF, cabeçalhos de segurança (CSP, anti-iframe, HSTS), cookie `Secure`/`HttpOnly`/`SameSite=Strict`.
- Excluir manda para a lixeira; CSV protegido contra fórmulas maliciosas no Excel.

## Deploy no EasyPanel

1. **Source:** o repositório do site. Build: **Dockerfile**.
2. **Environment:**
   ```
   APP_PASSWORD = <senha forte, 12+ caracteres>
   DB_PATH      = /app/data/controle.db
   PORT         = 3000
   ```
   `SESSION_SECRET` **não é mais usado** (pode apagar).
3. **Volume persistente:** mount path `/app/data` (sem isso os dados somem a cada deploy).
4. **Porta:** 3000. **Domínio:** o do site, com HTTPS (o cookie é `Secure`, o site precisa abrir em `https://`).

DNS (Cloudflare, zona `hafner.work`): registro `A` com nome `rafael`/`fernanda` apontando para o IP do VPS.
Se o EasyPanel emite o certificado, deixe "DNS only" até emitir; se a Cloudflare proxia, use SSL **Full**.

**Ao atualizar para esta versão:** o banco antigo é migrado automaticamente (nenhum dado se perde)
e todos precisarão digitar a senha uma vez.

## Backup

- Automático: uma cópia por dia em `/app/data/backups/` (mantém as últimas 30).
- Manual: **Ajustes → Baixar cópia do banco (.db)**. Faça isso uma vez por mês e guarde fora do VPS.
- Restaurar: pare o serviço, substitua `/app/data/controle.db` pela cópia e inicie de novo.

## Rodar localmente

```bash
cp .env.example .env      # edite APP_PASSWORD
npm ci
node --env-file=.env server.js   # abra http://localhost:3000 (Chrome/Firefox)
```

## API (referência)

Todas as rotas que alteram dados exigem o cabeçalho `X-Requested-With: controle`.

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/login` · `/api/logout` · `/api/logout-all` | sessão |
| GET | `/api/entries` | lançamentos (sem os da lixeira) |
| POST | `/api/entries` | cria um atendimento (objeto ou array de exames) |
| PUT | `/api/entries/:id` | edita |
| POST | `/api/entries/delete` · `/api/entries/restore` | `{ids:[...]}` lixeira / restaurar |
| GET | `/api/trash` | lixeira |
| GET/PUT | `/api/settings` | taxas da maquininha |
| GET | `/api/export.csv?de=AAAA-MM-DD&ate=AAAA-MM-DD` | CSV para Excel |
| GET | `/api/backup` · `/api/backup/status` | cópia do banco |

Campos de um lançamento: `exame`, `valor` (bruto), `data` (`AAAA-MM-DD`), `medico`,
`pagamento` (`dinheiro`|`pix`|`debito`|`credito`|`credito_parc`), `taxa` (%).
`proc` (`US`|`MG`) é deduzido do nome do exame.
