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
| **Categorização** | Uma escada de precedência (detalhada [abaixo](#como-uma-compra-ganha-categoria)) que termina em `outros`. No topo dela ficam as **suas regras**; embaixo, a categoria do CSV, a herança por título e as palavras-chave. Códigos internos do emissor viram rótulos do domínio: `reversal_*` → `estorno`, `tax_*` → `impostos`, `bnpl_*` → `parcelado`. |
| **Classificação** | Você cria suas categorias e diz a que categoria cada estabelecimento pertence. A regra vale para todas as compras dele, passadas e futuras, e **sobrevive ao reprocessamento**. Reclassificar acontece em dois lugares: na tela *Sem categoria*, que lista o que está em `outros` do que mais pesa para o que menos pesa, e direto na coluna Categoria da tabela de Compras. |
| **Compras** | Lista filtrável por **categoria**, **título** (busca parcial) e **mês da fatura**, com total, quantidade e ticket médio. Tabela ordenável e paginada. |
| **Gráficos** | Gasto por mês e por categoria, em barras, acompanhando os filtros aplicados. |
| **Visão geral** | A home: última fatura fechada com a variação contra o mês anterior, média dos doze meses anteriores, total do ano e a composição do mês. Parcelas já lançadas em faturas futuras aparecem à parte, fora dos agregados. |
| **Faturas** | Uma linha por mês de referência: valor pago, total gasto, número de compras e o **percentual de cada categoria** no mês, com o fundo da célula proporcional ao peso. As colunas de categoria saem dos próprios dados — categoria nova ganha coluna sozinha. |
| **API** | REST documentada em OpenAPI/Swagger, com validação dos filtros. |

> **Sobre "outros".** Em julho de 2024 o emissor parou de classificar e passou a carimbar `outros`
> em quase tudo. O projeto trata `outros` como "não sei", e não como categoria, o que religa a
> inferência — mas inferência tem limite, e é para o resto que existem as regras.

---

## Como rodar localmente

**Requisitos:** Node ≥ 22, pnpm 10 (via `corepack enable`), Docker.

> **Use `pnpm` direto, não `corepack pnpm`.** O `packageManager` deste repo está fixado em 10.15.0.
> Chamado via `corepack`, um pnpm 11 instalado na máquina se recusa a trocar de versão e os scripts
> com `--filter` quebram com `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`. O `pnpm` direto respeita o
> `packageManager` e troca de versão sozinho.

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

### O que o reprocessamento preserva

Rodar `pnpm extract` de novo **apaga e regrava o mês inteiro** de cada fatura lida. Isso é de
propósito: uma fatura corrigida sobrescreve a antiga sem deixar resto. O que você classificou não se
perde nisso porque não mora na compra — mora em `categoryRules`, fora do alcance do apagão, e é
reaplicado no fim de cada execução.

```
pnpm extract
  ├─ lê as faturas e regrava mês a mês        ← a categoria volta a ser a da ingestão
  ├─ preenche `sourceCategory` onde faltava   ← uma vez só, nas compras gravadas antes do campo
  └─ reaplica as suas regras                  ← a categoria volta a ser a que você decidiu
```

O último passo é o mesmo código que a API roda quando você cria ou apaga uma regra na tela, então as
duas rotas não têm como divergir.

---

## Como uma compra ganha categoria

Da maior prioridade para a menor. A primeira que responde decide:

| # | Origem | Por quê nessa posição |
| --- | --- | --- |
| 1 | **Código interno do emissor** (`reversal_*`, `tax_*`, `bnpl_*`) | Descreve o **tipo da transação**, não o estabelecimento. Uma regra sua sobre onde gastou não pode transformar um estorno em gasto — isso desmontaria o total do mês. Vale também para `payment`. |
| 2 | **A sua regra** | É o ponto de discordar do emissor. Ganha até da categoria que veio no CSV: se você disse que `Mercadolivre*Mercadol` é mercado livre, não interessa que a fatura diga "eletrônicos". |
| 3 | **Categoria do CSV**, quando diz alguma coisa | `outros` não diz. |
| 4 | **Herança por título** | O mesmo título já categorizado em outra fatura. Vence a categoria mais frequente; no empate, a mais recente. |
| 5 | **Palavra-chave** (`uber` → transporte, `ifood` → restaurante) | O piso para uma base nova não começar inteira em `outros`. Regras `contains` cobrem o mesmo terreno sem mexer no código. |
| 6 | `outros` | Vira item da tela *Sem categoria*. |

### As suas regras

Uma regra é um par (como casar, para qual categoria):

- **`exact`** — o título inteiro. É o que nasce de um clique na tabela de Compras: você apontou uma
  compra, não descreveu um padrão.
- **`contains`** — um trecho do título. É o que resolve o mesmo estabelecimento chegando em várias
  formas. O emissor numera parcelas no próprio título (`Amazon - Parcela 2/3`), então uma compra
  parcelada em cinco chega como cinco estabelecimentos diferentes; e a caixa alterna entre meses
  (`Mercadolivre*Mercadol`, `MERCADOLIVRE*MERCADOL`).

Entre regras, ganha a mais específica: `exact` passa na frente de `contains`, e entre dois `contains`
vence o trecho mais longo. No empate, a mais recente — se você reclassificou algo hoje, é porque a
classificação de antes não servia mais. O casamento ignora caixa e acento, e **nunca** é expressão
regular: título de fatura é cheio de `*` e `+`, e `Mercadolivre*Mercadol` como regex casaria com
coisa que não tem nada a ver.

### Por que a compra guarda duas categorias

`category` é a que vale; `sourceCategory` é a que a ingestão resolveu, antes de qualquer regra sua.
Guardar as duas é o que torna a classificação **reversível**: apagar uma regra devolve as compras à
`sourceCategory`. Sem o original ao lado, a categoria que a regra carimbou ficaria grudada para
sempre. Reaplicar é sempre `sourceCategory` mais as regras de agora — nunca o que estava gravado
antes —, o que também faz a operação ser idempotente e a ordem entre `pnpm extract` e uma mudança de
regra não importar.

---

## Estrutura

Monorepo **pnpm workspaces + Turborepo**, TypeScript em tudo.

```
apps/
  api/         @expense/api             NestJS + Mongoose — endpoints e agregações
  web/         @expense/web             React + Vite + shadcn/ui — tabelas e gráficos
  extractor/   @expense/extractor       CSV (Drive ou disco) → MongoDB
packages/
  categorization/ @expense/categorization  a escada de precedência, pura e testada
bills/                                     seus CSVs quando EXTRACTOR_SOURCE=local
docker-compose.yml                         MongoDB local (+ mongo-express opcional)
```

O pacote existe porque a mesma decisão — qual título vai para qual categoria — precisa acontecer em
dois lugares: na API, quando você mexe numa regra, e no extractor, depois de reprocessar. Duas
implementações da mesma precedência divergiriam, e o sintoma apareceria meses depois como uma
categoria que muda sozinha ao rodar `pnpm extract`. Os dois lados implementam só o acesso ao banco,
por trás da mesma interface.

| Camada | Tecnologia |
| --- | --- |
| **API** | NestJS 11, Mongoose 8, class-validator, Swagger |
| **Front** | React 19, Vite 7, Tailwind CSS 4, shadcn/ui (Radix + lucide), Recharts, React Router 7 |
| **Extractor** | Node + tsx, driver oficial do MongoDB 6, googleapis |
| **Banco** | MongoDB 8 (Docker) ou MongoDB Atlas |
| **Monorepo** | pnpm workspaces, Turborepo, ESLint 9 (flat config), Prettier |

### Modelo de dados

**`purchases`** — uma linha por lançamento:

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `title` | string | Descrição da compra, como veio na fatura |
| `amount` | number | Valor em reais |
| `date` | Date | Data da compra |
| `category` | string | A categoria que vale; `payment` marca o pagamento da fatura |
| `sourceCategory` | string | A que a ingestão resolveu, antes das suas regras. É para onde a compra volta se a regra for apagada |
| `referenceMonth` | Date | Primeiro dia (UTC) do mês da fatura em que a compra apareceu |

`date` e `referenceMonth` são coisas diferentes de propósito: uma compra de 28/02 costuma cair na
fatura de março.

**`categoryRules`** — a sua classificação, guardada fora das compras justamente para sobreviver ao
reprocessamento:

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `kind` | `exact` \| `contains` | Casa o título inteiro ou um trecho dele |
| `value` | string | O título ou o trecho |
| `category` | string | Categoria de destino |
| `updatedAt` | Date | Desempate entre regras igualmente específicas |

**`categories`** — as categorias que você criou. Não é a lista completa: as que vieram das faturas
existem só como string nas compras e continuam valendo. Esta coleção guarda as que precisam existir
**antes** de qualquer compra usá-las — sem ela não daria para criar "mercado livre" e classificar em
seguida. `GET /category` devolve a união das duas.

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

### `GET /purchase/uncategorized`

Os títulos ainda em `outros`, agrupados por estabelecimento, do que mais pesa para o que menos pesa.
É o que a tela *Sem categoria* lista.

Agrupar é o que torna a faxina viável — as parcelas do mesmo lugar viram uma linha só — e a ordem por
dinheiro parado é o que faz o esforço render: classificar o primeiro da lista mexe mais nos gráficos
do que os vinte últimos juntos.

```jsonc
{
  "title": "Amazon",                    // já sem o "- Parcela 2/3"
  "titles": ["Amazon - Parcela 1/3", "Amazon"],  // as formas cruas do grupo
  "frequency": 7,
  "total": 2669.94,
  "lastDate": "2025-02-24T00:00:00.000Z",
  "suggestion": { "kind": "contains", "value": "Amazon" }  // a regra que resolve o grupo inteiro
}
```

### Categorias e regras

Estas são as rotas que **escrevem**. Criar, editar ou apagar uma regra reclassifica na mesma
requisição e devolve quantas compras mudaram.

| Rota | O que faz |
| --- | --- |
| `GET /category` | As categorias em que dá para classificar, com quantas compras cada uma tem. As de tipo de transação (`payment`, `estorno`, `impostos`, `parcelado`) ficam de fora: uma regra apontando para elas seria aceita e ignorada |
| `POST /category` | Cria uma categoria antes de qualquer compra usá-la |
| `PATCH /category/:name` | Renomeia. Apontar para uma categoria que já existe **mescla** as duas |
| `DELETE /category/:name` | Apaga, se não estiver em uso. Para esvaziar uma categoria, mescle-a em outra |
| `GET /category-rule` | As suas regras |
| `POST /category-rule` | Cria ou atualiza a regra. Reclassificar o mesmo título edita a que já existe, nunca empilha uma segunda |
| `DELETE /category-rule/:id` | Apaga a regra e devolve as compras dela à `sourceCategory` |

```jsonc
// POST /category-rule
{ "kind": "contains", "value": "mercadolivre", "category": "mercado livre" }
// → { "rule": { ... }, "classified": 92, "restored": 0 }
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

- **Não há autenticação, e a API agora escreve.** Até então ela era só leitura; as rotas de
  categoria e de regra mudam o banco sem pedir nada a ninguém. Suba num ambiente confiável, não na
  internet pública.
- **Regras se editam criando por cima, ou apagando.** Não há tela para listar e revisar o que já
  foi criado — `GET /category-rule` mostra, mas a interface ainda não. Também não dá para ajustar o
  trecho de uma regra `contains` na tela: ela sai do agrupamento da API ou do título clicado.
- A reaplicação varre a coleção inteira a cada mudança de regra. Numa base pessoal — alguns milhares
  de compras, algumas centenas de títulos — isso some no tempo da requisição. Numa base grande,
  não sumiria.
- Os testes cobrem as funções puras onde moram as regras: o parser de CSV, a montagem do filtro do
  Mongo e o agrupamento dos gráficos. Não há testes de integração — o CI compensa com lint,
  typecheck, build e um smoke test da API contra um MongoDB de verdade.
- A interface é **escura por padrão**, com alternador claro/escuro/sistema. Os tokens vivem em
  `apps/web/src/assets/globals.css`, no padrão CSS-first do Tailwind 4.

## Licença

MIT
