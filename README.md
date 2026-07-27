# Expense Analyzer

Dashboard pessoal pra analisar o histórico de gastos do cartão de crédito. As faturas em **CSV**
viram um banco de compras no **MongoDB**, uma **API NestJS** agrega isso por mês e por categoria, e
um **front em React** mostra tabelas e gráficos: quanto você gastou, com o quê, e como isso evolui
mês a mês.

O parser não é acoplado a nenhum emissor — lê qualquer CSV com as colunas `date,title,amount`.
Foi desenvolvido e testado com as faturas exportadas do **Nubank**.

```
  faturas .csv                  MongoDB                  API (Nest)              Front (React)
 ┌──────────────┐            ┌───────────┐            ┌─────────────┐         ┌───────────────┐
 │ Google Drive │──extractor─▶│ purchases │◀───────────│  /purchase  │◀────────│ tabela +      │
 │  ou ./bills  │            │           │            │/purchase/bill│         │ gráficos      │
 └──────────────┘            └───────────┘            └─────────────┘         └───────────────┘
```

---

## Funcionalidades

| Área | O que faz |
| --- | --- |
| **Ingestão** | Lê as faturas em CSV do **Google Drive** ou de uma **pasta local**, categoriza as compras e grava no MongoDB. Regravar uma fatura sobrescreve o mês inteiro — rodar de novo é idempotente. |
| **Categorização** | Usa a categoria do CSV quando existe. Quando não, herda de um título já categorizado em outra fatura, tenta palavras-chave (uber/99app → transporte) e cai em `outros`. |
| **Compras** | Lista filtrável por **categoria**, **título** (busca parcial) e **mês da fatura**, com total, quantidade e ticket médio. Tabela ordenável e paginada. |
| **Gráficos** | Gasto por mês (barras) e por categoria (pizza), acompanhando os filtros aplicados. |
| **Faturas** | Uma linha por mês de referência: valor pago, total gasto, número de compras e o **percentual de cada categoria** no mês. As colunas de categoria saem dos próprios dados — categoria nova ganha coluna sozinha. |
| **API** | REST documentada em OpenAPI/Swagger, com validação dos filtros. |

---

## Como rodar localmente

**Requisitos:** Node ≥ 22, pnpm 10 (via `corepack enable`), Docker.

```bash
# 1. Dependências
pnpm install

# 2. Variáveis de ambiente
cp .env.example .env

# 3. Banco (MongoDB no Docker)
docker compose up -d

# 4. Dados de exemplo — 18 meses de faturas fictícias, pra app abrir com gráficos
pnpm db:seed

# 5. API + front, com hot-reload
pnpm dev
```

- **Front:** http://localhost:5173
- **API:** http://localhost:3000 — documentação em http://localhost:3000/docs
- **Health check:** http://localhost:3000/health

Com os dados de exemplo você já tem a app inteira funcionando. Para usar as **suas** faturas, veja
[Carregando suas faturas](#carregando-suas-faturas).

> **Porta 3000 ocupada?** Mude `PORT` no `.env` e ajuste `VITE_API_URL` para a mesma porta.

---

## Variáveis de ambiente

Tudo mora num **`.env` único na raiz** — os três apps leem dele (a API e o extractor por caminho
explícito, o front pelo `envDir` do Vite). Copie de [`.env.example`](.env.example).

| Variável | Usada por | Padrão | Para que serve |
| --- | --- | --- | --- |
| `MONGO_URI` | api, extractor | `mongodb://localhost:27017/credit-card` | Conexão com o Mongo. **O nome do banco vai na URI** — é dele que os dois apps leem. Troque por uma connection string do Atlas se preferir a nuvem. |
| `PORT` | api | `3000` | Porta HTTP da API. |
| `CORS_ORIGIN` | api | `http://localhost:5173` | Origens liberadas no CORS, separadas por vírgula. **Vazio libera todas** (só em dev). |
| `VITE_API_URL` | web | `http://localhost:3000` | Base da API usada pelo front. Precisa do prefixo `VITE_` pra chegar no bundle. |
| `EXTRACTOR_SOURCE` | extractor | `drive` | De onde vêm as faturas: `drive` (Google Drive) ou `local` (pasta). |
| `BILLS_DIR` | extractor | `./bills` | Fonte `local`: diretório com os CSVs. |
| `DRIVE_FILE_QUERY` | extractor | `name contains 'nubank'` | Fonte `drive`: filtro de busca (sintaxe da Drive API v3). |
| `GOOGLE_CREDENTIALS_PATH` | extractor | `./apps/extractor/drive-credentials.json` | Fonte `drive`: OAuth client baixado do Google Cloud Console. **Segredo.** |
| `GOOGLE_TOKEN_PATH` | extractor | `./apps/extractor/token.json` | Fonte `drive`: refresh token gerado no primeiro login. **Segredo.** |

`.env`, `drive-credentials.json` e `token.json` estão no `.gitignore` — nenhum deles vai pro
repositório.

---

## Carregando suas faturas

As faturas precisam estar em CSV com o cabeçalho `date,category,title,amount` (a coluna `category`
é opcional) e o nome do arquivo precisa conter o **mês de referência**: `nubank-2024-03.csv`.
Detalhes e exemplo em [`bills/README.md`](bills/README.md).

### Opção A — pasta local (mais simples)

```bash
# no .env
EXTRACTOR_SOURCE=local
BILLS_DIR=./bills
```

Jogue os CSVs em `bills/` e rode:

```bash
pnpm extract
```

### Opção B — Google Drive

Útil se você já guarda as faturas no Drive e quer sincronizar sem baixar nada.

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e **habilite a
   Google Drive API**.
2. Em *APIs & Services → Credentials*, crie um **OAuth client ID** do tipo **Desktop app** e baixe
   o JSON.
3. Salve como `apps/extractor/drive-credentials.json` (há um
   [exemplo do formato](apps/extractor/drive-credentials.example.json)).
4. No `.env`, deixe `EXTRACTOR_SOURCE=drive` e ajuste `DRIVE_FILE_QUERY` se seus arquivos não têm
   "nubank" no nome.
5. Rode `pnpm extract`. Na primeira vez abre o navegador pra autorizar; o refresh token fica salvo
   em `apps/extractor/token.json`.

> Se der erro de autenticação depois de muito tempo sem rodar, apague `token.json` e autorize de novo.

---

## Estrutura

Monorepo **pnpm workspaces + Turborepo**, TypeScript em tudo.

```
apps/
  api/         @expense/api        NestJS + Mongoose — endpoints e agregações
  web/         @expense/web        React + Vite + MUI — tabelas e gráficos
  extractor/   @expense/extractor  CSV (Drive ou disco) → MongoDB
bills/                                     seus CSVs quando EXTRACTOR_SOURCE=local
docker-compose.yml                         MongoDB local (+ mongo-express opcional)
```

| Camada | Tecnologia |
| --- | --- |
| **API** | NestJS 11, Mongoose 8, class-validator, Swagger |
| **Front** | React 19, Vite 7, MUI 7, MUI X Charts 8, React Router 7 |
| **Extractor** | Node + tsx, driver oficial do MongoDB 6, googleapis |
| **Banco** | MongoDB 8 (Docker) ou MongoDB Atlas |
| **Monorepo** | pnpm workspaces, Turborepo, ESLint 9 (flat config), Prettier |

### Modelo de dados

Uma coleção só, `purchases`:

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `title` | string | Descrição da compra, como veio na fatura |
| `amount` | number | Valor em reais |
| `date` | Date | Data da compra |
| `category` | string | Categoria; `payment` marca o pagamento da fatura |
| `referenceMonth` | Date | Primeiro dia (UTC) do mês da fatura em que a compra apareceu |

`date` e `referenceMonth` são coisas diferentes de propósito: uma compra de 28/02 costuma cair na
fatura de março.

---

## API

Documentação interativa em `http://localhost:3000/docs`.

### `GET /purchase`

Lista as compras (excluindo pagamentos) com os agregados do conjunto filtrado. Estornos entram com
valor negativo e abatem a soma — é o que faz este endpoint bater com o total de `/purchase/bill`.

| Query param | Exemplo | Efeito |
| --- | --- | --- |
| `category` | `supermercado,transporte` | Uma ou mais categorias, separadas por vírgula |
| `title` | `uber` | Busca parcial, sem diferenciar maiúsculas |
| `date` | `2024-03-15` | Mês da **data da compra**. Qualquer dia serve — o filtro cobre o mês inteiro |
| `month` | `2024-03` | Mês da **fatura** em que a compra apareceu |

`date` e `month` filtram campos diferentes de propósito: uma compra de 28/02 costuma cair na fatura
de março, então `date=2024-02-10` e `month=2024-02` devolvem conjuntos distintos. A tela filtra por
`month` — o seletor se chama "Fatura".

```jsonc
{
  "purchases": [ /* ... */ ],
  "total": 742,
  "sum": 269470.89,
  "average": 363.17
}
```

### `GET /purchase/bill`

Uma entrada por mês de referência, em ordem cronológica.

```jsonc
{
  "month": "2025-02",
  "valuePaid": 12150.23,        // a linha de categoria `payment` do mês
  "total": 12150.23,            // gastos menos estornos, sem o pagamento
  "frequency": 37,              // número de compras, sem contar o pagamento
  "categoriesResult": [
    { "categoryByMonth": "viagem", "totalCategory": 4665.7, "frequency": 4, "percentage": 38.4 }
  ],
  "viagem": 38.4,               // atalho: percentual por categoria, usado nas colunas da tabela
  "supermercado": 4.29
}
```

### `GET /health`

```json
{ "status": "ok", "uptime": 12.34 }
```

---

## Comandos

Todos rodam da raiz do repositório.

| Comando | O que faz |
| --- | --- |
| `pnpm dev` | Sobe API e front juntos, com hot-reload |
| `pnpm build` | Compila os três apps (Turborepo) |
| `pnpm lint` | ESLint em todos os workspaces |
| `pnpm typecheck` | Checagem de tipos em todos os workspaces |
| `pnpm test` | Testes unitários (runner nativo do Node, sem banco) |
| `pnpm db:up` / `pnpm db:down` | Sobe / derruba o MongoDB |
| `pnpm db:seed` | Popula o banco com 18 meses de faturas fictícias (determinístico) |
| `pnpm extract` | Roda o extractor com as suas faturas de verdade |

Para inspecionar o banco pelo navegador: `docker compose --profile tools up -d` → http://localhost:8081.

---

## Estado atual

- **Não há autenticação.** A API é aberta; suba num ambiente confiável, não na internet pública.
- Os testes cobrem as funções puras onde moram as regras: o parser de CSV, a montagem do filtro do
  Mongo e o agrupamento dos gráficos. Não há testes de integração — o CI compensa com lint,
  typecheck, build e um smoke test da API contra um MongoDB de verdade.
- A página **/dashboard** é um esqueleto — os gráficos vivem em `/purchases`.

## Licença

MIT
