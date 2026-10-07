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

- **Lançar** (`N`, de qualquer tela) — folha do atendimento: data, um ou mais exames (`Alt` `+`
  adiciona), médico e pagamento. O valor do exame vem do último valor cobrado. `Enter` avança de
  campo, `Ctrl+Enter` salva. Inclusão, edição e exclusão têm **Desfazer**.
  Na worklist: `J`/`K` navegam, `Enter` edita o atendimento, `Del` exclui o atendimento, `/` busca.
- **Mês** — navegação ‹ › (ou setas do teclado) por qualquer mês; bruto, líquido, exames,
  atendimentos e ticket médio com comparação ao mês anterior (no mês corrente, até o mesmo dia);
  gráfico por dia, formas de pagamento, US × MG, rankings de exames e médicos (clique filtra a lista),
  lista com busca, filtros e ordenação; exportar CSV do mês.
- **Ano** — gráfico mês a mês comparando com o ano anterior, tabela mês a mês, média mensal,
  melhor mês, totais por ano; exportar CSV do ano.
- **Ajustes** — tabela de taxas por maquininha (débito, crédito à vista e 2x a 12x), backup,
  exportação de exames e de pagamentos, lixeira (exclusões ficam 90 dias), "sair de todos os dispositivos".

## Pagamentos

O pagamento pertence ao **atendimento** (o paciente), não ao exame, e pode ser **dividido** em até
4 formas: por exemplo R$ 200 em dinheiro + o restante em crédito 3x. Na folha, "Dividir pagamento"
(`Alt` `D`) cria outra forma; a última recebe o restante automaticamente.

- **Formas:** Dinheiro, PIX, Débito, Crédito (`1`–`4` ou setas).
- **Cartão:** escolhe a **maquininha** (ECOS I ou ECOS II — cada unidade tem a sua, com taxas próprias)
  e, no crédito, as **parcelas**: à vista, 2x … 12x (setas ou números; `1` e `2` em seguida = 12x).
  O site lembra a última maquininha usada.
- **Taxas:** dinheiro e PIX = 100% líquido. Cartão desconta a taxa da tabela da maquininha para
  aquela forma/parcela. Cada pagamento guarda a taxa do dia; mudar a tabela vale só para os próximos.
- **Líquido:** cada exame guarda a taxa efetiva do atendimento, então a soma dos líquidos dos exames
  é exatamente o líquido recebido.
- **Mês:** "Formas de pagamento" (dinheiro, PIX, débito, crédito à vista, crédito parcelado) e
  "Maquininhas" (quanto passou em cada uma e quanto foi de taxa). O botão "Pagamentos" baixa uma
  planilha com uma linha por pagamento, para conferir com o extrato de cada maquininha.
- **Lançamentos antigos:** os da versão anterior foram convertidos sozinhos (sem maquininha
  informada); os mais antigos ainda aparecem como "Não informado" e contam como 100% líquido.

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

## Meta conjunta (e-mail de comemoração)

Quando a soma do bruto dos dois sites passa de `MARCO_VALOR` (padrão R$ 100.000), o site
configurado para isso envia **um único** e-mail comemorativo. Em **Ajustes → Meta conjunta**
aparecem o progresso e o botão "Enviar e-mail de teste".

| Variável | Onde | Valor |
|----------|------|-------|
| `MARCO_TOKEN` | nos dois sites | a mesma chave longa e aleatória nos dois |
| `MARCO_PARCEIRO_URL` | nos dois sites | o endereço do **outro** site (`https://fernanda.hafner.work` / `https://rafael.hafner.work`) |
| `MARCO_EMAIL_PARA` | só no site que envia | e-mail de destino |
| `SMTP_USER` | só no site que envia | o Gmail que envia |
| `SMTP_PASS` | só no site que envia | **senha de app** do Gmail (myaccount.google.com/apppasswords; exige verificação em duas etapas) |
| `MARCO_VALOR` | opcional | padrão `100000` |

O site verifica a cada lançamento e de hora em hora (para pegar lançamentos feitos no outro site).
Se o outro site não responder, ele espera e tenta de novo; nunca envia com a soma incompleta.
Para uma nova meta depois (ex.: 200 mil), basta mudar `MARCO_VALOR`.

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
| GET | `/api/entries` · `/api/pagamentos` | exames e pagamentos (sem os da lixeira) |
| POST | `/api/atendimentos` | cria um atendimento `{data, medico, exames:[{exame, valor}], pagamentos:[{forma, maquina, parcelas, valor}]}` |
| PUT | `/api/atendimentos/:chave` | edita o atendimento inteiro (exames com `id` são alterados, sem `id` são incluídos, ausentes são removidos) |
| POST | `/api/atendimentos/delete` · `/api/atendimentos/restore` | `{keys:[...]}` lixeira / restaurar |
| GET | `/api/trash` | lixeira |
| GET/PUT | `/api/settings` | maquininhas: `{maquinas:[{id, nome, debito, credito:[1x..12x]}]}` |
| GET | `/api/export.csv` · `/api/export-pagamentos.csv` `?de=AAAA-MM-DD&ate=AAAA-MM-DD` | CSV para Excel |
| GET | `/api/backup` · `/api/backup/status` | cópia do banco |

A soma dos pagamentos precisa ser igual à soma dos exames. Formas: `dinheiro`, `pix`, `debito`,
`credito` (`credito_parc` só em lançamentos antigos). `maquina`: `ecos1` / `ecos2`. `parcelas`: 1–12.
A taxa é a da tabela, salvo quando informada. `proc` (`US`|`MG`) é deduzido do nome do exame.
As rotas antigas por exame (`/api/entries` POST/PUT/delete/restore) continuam aceitas.
