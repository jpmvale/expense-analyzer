# Expense Analyzer

Dashboard pessoal pra analisar o histórico de gastos do cartão de crédito. As faturas em **CSV**
viram um banco de compras no **MongoDB**, uma **API NestJS** agrega isso por mês e por categoria, e
um **front em React** mostra tabelas e gráficos: quanto você gastou, com o quê, e como isso evolui
mês a mês.

O parser não é acoplado a nenhum emissor — lê qualquer CSV com as colunas `date,title,amount`.
Foi desenvolvido e testado com as faturas exportadas do **Nubank**.

> Para retomar de onde a última sessão parou — estado, pendências e as armadilhas de ambiente que
> já custaram tempo aqui —, leia [`HANDOFF.md`](HANDOFF.md).

```
  faturas .csv                  MongoDB                  API (Nest)              Front (React)
 ┌──────────────┐            ┌───────────┐            ┌─────────────┐         ┌───────────────┐
 │ Google Drive │──extractor─▶│ purchases │◀───────────│  /purchase  │◀────────│ tabela +      │
 │  ou ./bills  │      ▲     │  (por     │            │/purchase/bill│         │ gráficos      │
 └──────────────┘      │     │   dono)   │            └─────────────┘         └───────────────┘
        │              │     └───────────┘                   ▲
        │              ├───────────────────────── POST /sync ┤◀──────── botão "Sincronizar"
        └──────────────┘                          POST /import◀──────── tela "Importar"
                                                                        (CSVs do navegador)
```

A ingestão tem **três** gatilhos e um caminho só: `pnpm extract` na linha de comando, o botão
**Sincronizar** e o upload de CSVs pela tela rodam o mesmo código — veja
[Quando as faturas novas entram](#quando-as-faturas-novas-entram) e
[Importando faturas pela tela](#importando-faturas-pela-tela).

Cada conta vê só os próprios dados; o Drive é do dono da instância, e as demais importam CSV pela
tela — [Contas](#contas).

---

## Funcionalidades

| Área | O que faz |
| --- | --- |
| **Contas** | Cada conta vê **só os próprios dados** — compras, regras, categorias, assinaturas. O cadastro é **por convite**, porque a instância fica exposta na internet — [detalhes](#contas). |
| **Ingestão** | Lê as faturas em CSV do **Google Drive**, de uma **pasta local** ou do **upload pela tela**, categoriza as compras e grava no MongoDB. Regravar uma fatura sobrescreve o mês inteiro — rodar de novo é idempotente. |
| **Importar** | Sobe vários CSVs de uma vez e passa pelo mesmo pipeline do Drive, com as mesmas garantias. O mês vem do nome do arquivo e, quando ele não diz, das datas de dentro — [detalhes](#importando-faturas-pela-tela). É o caminho de quem não tem Drive configurado, que é todo mundo menos o dono da instância. |
| **Sincronização** | Um botão no cabeçalho pede a ingestão sem sair da tela, e diz **quando foi a última** e o que ela mexeu. Vale para as duas pontas: uma extração pela linha de comando ou pelo cron aparece ali igual, porque as duas gravam o mesmo registro — [detalhes](#quando-as-faturas-novas-entram). |
| **Categorização** | Uma escada de precedência (detalhada [abaixo](#como-uma-compra-ganha-categoria)) que termina em `outros`. No topo dela ficam as **suas regras**; embaixo, a categoria do CSV, a herança por título e as palavras-chave. Códigos internos do emissor viram rótulos do domínio: `reversal_*` → `estorno`, `tax_*` → `impostos`, `bnpl_*` → `parcelado`. |
| **Classificação** | Você cria suas categorias e diz a que categoria cada estabelecimento pertence. A regra vale para todas as compras dele, passadas e futuras, e **sobrevive ao reprocessamento**. Reclassificar acontece em dois lugares: na tela *Sem categoria*, que lista o que está em `outros` do que mais pesa para o que menos pesa, e direto na coluna Categoria da tabela de Compras. |
| **Compras** | Lista filtrável por **categoria**, **título** (busca parcial) e **mês da fatura**, com total, quantidade e ticket médio. Filtro, ordenação, paginação e os agregados dos painéis acontecem **no servidor** — os painéis descrevem o filtro inteiro, e a tabela mostra uma página dele. No desktop, a própria tabela rola dentro de uma caixa com altura limitada, e o cabeçalho de colunas fica preso no topo dela — não da página —, então nunca some por trás do que vem antes na tela. Uma parcela já lançada numa fatura futura ganha o rótulo **futura** ao lado da data: a ordenação por data continua correta, mas o topo da lista deixa de parecer "a compra mais recente" por engano. |
| **Gráficos** | Gasto por mês e por categoria, em barras, acompanhando os filtros aplicados. |
| **Visão geral** | A home: última fatura fechada com a variação contra o mês anterior, média dos doze meses anteriores, total do ano e a composição do mês. O recorte de "fechada" é o fim do ciclo de compras, não o mês do vencimento: o que ainda não fechou — o ciclo em aberto e as parcelas lançadas à frente — aparece à parte, fora dos agregados. O cartão **Fora do normal** compara cada categoria contra o próprio histórico — [como](#o-que-conta-como-fora-do-normal). O cartão **Mudou de preço** traz os reajustes recentes de assinatura, quando existem — [como](#quando-um-degrau-vira-aviso). |
| **Faturas** | Uma linha por mês de referência: valor pago, total gasto, número de compras e o **percentual de cada categoria** no mês, com o fundo da célula proporcional ao peso. As colunas de categoria saem dos próprios dados — categoria nova ganha coluna sozinha. Meses com juros ou multa vêm marcados, e o valor aparece à parte do gasto. |
| **Encargo ≠ gasto** | Juros, multa e saldo rolado saem do total gasto e ganham linha própria. Somá-los respondia "quanto você gastou" com dinheiro que ninguém gastou — [detalhes abaixo](#gasto-e-encargo-não-são-a-mesma-coisa). |
| **Assinaturas** | Detecta as cobranças que se repetem todo mês com preço estável e mostra a **escada de preços** de cada uma: quando mudou, de quanto para quanto. É o que o app do banco não faz, porque depende de anos de série contínua — [como funciona](#como-uma-assinatura-é-detectada). Cada uma abre num painel com o **gráfico da evolução do preço**, e você pode dar a ela um **nome formal** — `Mp *Melimais` vira `Meli+` — que sobrevive à troca de gateway. |
| **Regras** | Lista todas as decisões de classificação que você tomou, com quantas compras cada uma **governa** de fato. O destino de uma regra se muda direto na lista, e dá para criar uma nova digitando o trecho à mão — as duas coisas reaproveitam o mesmo `POST` que já existia. A tela também aponta onde um punhado de regras de título exato viraria uma só por trecho, dizendo o que essa troca levaria junto — [critério](#onde-dá-para-juntar-regras). |
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

> **Porta ocupada?** Os dois servidores falham em vez de escolher outra porta sozinhos. Se a 3000
> estiver tomada, mude `PORT` no `.env` e ajuste `VITE_API_URL` para a mesma porta; se for a 5173,
> quase sempre é um `pnpm dev` que ficou de pé — `lsof -nP -iTCP:5173 -sTCP:LISTEN` mostra qual.
> Falhar aqui é deliberado: com o fallback ligado, um segundo `pnpm dev` subia na 5174 enquanto a
> 5173 continuava servida pelo processo antigo, e você acabava testando contra o servidor errado.

---

## Variáveis de ambiente

Tudo mora num **`.env` único na raiz** — os três apps leem dele (a API e o extractor por caminho
explícito, o front pelo `envDir` do Vite). Copie de [`.env.example`](.env.example).

| Variável | Usada por | Padrão | Para que serve |
| --- | --- | --- | --- |
| `MONGO_URI` | api, extractor | `mongodb://localhost:27017/credit-card` | Conexão com o Mongo. **O nome do banco vai na URI** — é dele que os dois apps leem. Troque por uma connection string do Atlas se preferir a nuvem. |
| `PORT` | api | `3000` | Porta HTTP da API. |
| `CORS_ORIGIN` | api | `http://localhost:5173` | Origens liberadas no CORS, separadas por vírgula. **Vazio libera todas** (só em dev). |
| `INVITE_CODE` | api | — | O código que libera o cadastro. Sem ele a API não sobe. Veja [Contas](#contas). **Segredo.** |
| `OWNER_USERNAME` | api, extractor | `AUTH_USERNAME` | A conta dona da instância: a única para quem `/sync` e o cron do Drive existem. |
| `AUTH_USERNAME` | migração | — | Só para `migrate:multiuser`, que cria a conta dona a partir dele. Veja [Contas](#contas). |
| `AUTH_PASSWORD_HASH` | migração | — | Idem: o hash bcrypt que a conta dona herda, para o login não mudar. Gerado por `pnpm --filter @expense/api hash-password`. **Segredo.** |
| `SESSION_SECRET` | api | — | Assina o cookie de sessão. String aleatória longa; trocar derruba toda sessão aberta. **Segredo.** |
| `VITE_API_URL` | web | `http://localhost:3000` | Base da API usada pelo front. Precisa do prefixo `VITE_` pra chegar no bundle. |
| `APP_URL` | api | `http://localhost:5173` | Endereço em que a **pessoa** abre o app — é a base do link de redefinição de senha, e não a URL da API. |
| `MAIL_ENV_FILE` | api | — | Arquivo com `RESEND_API_KEY` e `EMAIL_FROM`, lido na subida. Sem ele o link de redefinição vai para o **log** em vez do e-mail — veja [Contas](#contas). |
| `EXTRACTOR_SOURCE` | extractor, api | `drive` | De onde vêm as faturas: `drive` (Google Drive) ou `local` (pasta). |
| `BILLS_DIR` | extractor, api | `./bills` | Fonte `local`: diretório com os CSVs. |
| `DRIVE_FILE_QUERY` | extractor, api | `name contains 'nubank'` | Fonte `drive`: filtro de busca (sintaxe da Drive API v3). |
| `GOOGLE_CREDENTIALS_PATH` | extractor, api | `./apps/extractor/drive-credentials.json` | Fonte `drive`: OAuth client baixado do Google Cloud Console. **Segredo.** |
| `GOOGLE_TOKEN_PATH` | extractor, api | `./apps/extractor/token.json` | Fonte `drive`: refresh token gerado no primeiro login. **Segredo.** |

As cinco de baixo valem para os dois porque o botão **Sincronizar** faz a API rodar a mesma ingestão
que o `pnpm extract` — [detalhes](#quando-as-faturas-novas-entram). Elas precisam ter o mesmo valor
nos dois lados, ou o botão sincronizaria de uma fonte e o cron de outra; em produção isso é garantido
por um `.env.prod` único, lido pelos dois serviços. A API só **lê** o `token.json`; quem o cria é o
`pnpm extract`.

`.env`, `drive-credentials.json` e `token.json` estão no `.gitignore` — nenhum deles vai pro
repositório.

---

## Contas

Cada conta vê **só os próprios dados**: compras, regras, categorias, apelidos de assinatura e
histórico de sincronização. O recorte não é uma convenção de código — todo documento carrega o `_id`
do dono, todo índice começa por ele, e todo método de serviço recebe o dono como primeiro parâmetro,
de forma que uma consulta nova não tenha como esquecê-lo. Um [teste de integração](#os-testes-que-sobem-a-api-inteira)
com duas contas percorre todas as rotas conferindo que nenhuma enxerga a outra.

**O cadastro é por convite.** A tela de login tem um "Criar conta" que pede usuário, senha e um
código, e esse código é `INVITE_CODE` no `.env` do servidor — sem ele a API se recusa a subir. A
razão é o endereço: uma instância exposta na internet sem barreira nenhuma vira cadastro aberto para
qualquer robô que ache a URL.

```bash
# O convite: qualquer string longa serve. Combine com quem você quer que entre.
openssl rand -hex 16
```

Além dele, gere um `SESSION_SECRET` (`openssl rand -hex 32`). A sessão é um cookie `httpOnly`,
guardado no próprio Mongo (`connect-mongo`, coleção `sessions`) — e não em memória, porque a API sobe
com `nest start --watch`: cada salvamento reiniciaria o processo, e uma sessão em memória cairia
junto. Toda rota exige sessão, exceto `/auth/register`, `/auth/login`, `/auth/session` e `/health`.

### Senha: trocar e recuperar

Duas portas, porque são dois problemas diferentes:

- **Trocar** (`/conta`, logado): pede a senha atual antes da nova. Não é burocracia — sem isso, um
  notebook desbloqueado por dois minutos basta para trocar a senha e expulsar o dono da própria
  conta, já que a sessão sozinha seria autorização suficiente.
- **Recuperar** (`/esqueci`): manda um link por e-mail, válido por uma hora e de uso único.

As duas **derrubam as outras sessões da conta** — a de quem está trocando continua. É a metade que
faz a troca significar alguma coisa: sem ela, quem já estava dentro com a senha antiga continua
dentro, e trocar a senha depois de ela vazar é teatro.

O que o servidor guarda de um pedido de redefinição é o **SHA-256 do token**, nunca o token: o que
vai no link são 32 bytes aleatórios, e um dump do banco — ou um backup no R2 — não abre a conta de
ninguém. `POST /auth/forgot-password` responde **204 sempre**, exista ou não a conta; uma resposta
diferente para endereço conhecido e desconhecido transformaria a rota num oráculo de quem tem conta
aqui. É por isso que a tela diz "se houver uma conta com esse e-mail" em vez de confirmar.

O envio é pelo Resend, com as credenciais em `MAIL_ENV_FILE` — em produção, o mesmo arquivo que os
alertas de cron da VPS já usam, montado no container em vez de copiado para o `.env.prod`. **Sem
credencial configurada nada quebra:** o link é escrito no log da API. É o que mantém o fluxo inteiro
exercitável em desenvolvimento, e é assim que os testes o percorrem.

Contas criadas antes do campo de e-mail não têm endereço e não podem ser recuperadas — a tela de
conta avisa. Para dar um endereço a elas:

```bash
pnpm --filter @expense/api set-email <usuario> <email>
```

`GET /auth/session` responde quem está logado e se essa conta é a **dona da instância**
(`OWNER_USERNAME`). Só ela vê o botão **Sincronizar**, e só para ela `/sync` responde: a
sincronização lê as faturas de um Google Drive cujas credenciais OAuth estão no servidor e são de uma
conta Google só. As demais sobem as faturas em [CSV pela tela de Importar](#importando-faturas-pela-tela).

### Vindo da versão de um usuário só

Antes as credenciais moravam em `AUTH_USERNAME` e `AUTH_PASSWORD_HASH`, e nenhum documento tinha
dono. Como agora toda consulta filtra por dono, um documento sem dono **não aparece para ninguém** —
sem migrar, a app abriria vazia com os anos de fatura intactos no banco.

```bash
pnpm --filter @expense/api migrate:multiuser
```

O script cria a conta dona a partir de `AUTH_USERNAME` + `AUTH_PASSWORD_HASH` (reaproveitando o hash,
então **seu login não muda**), carimba `userId` em todos os documentos das seis coleções e derruba os
índices únicos globais, que na versão multiusuário recusariam do segundo usuário a categoria que o
primeiro já tem. É idempotente e não apaga documento nenhum. Suba a API depois — o Mongoose cria os
índices compostos sozinho.

---

## Importando faturas pela tela

`POST /import` recebe vários CSVs de uma vez, e a tela **Importar** é a interface dele. É o caminho de
quem não tem o Google Drive configurado — na prática, qualquer conta que não seja a dona da
instância.

O que ele faz é o que a extração já fazia, pelo mesmo código: os arquivos viram faturas pelo mesmo
parser da fonte `local` e vão para o mesmo `ingestBills` que o Drive dispara. De onde saem, de graça,
as duas garantias que importam — **reenviar um mês sobrescreve** em vez de duplicar, e as suas regras
são reaplicadas depois da gravação, então importar de novo nunca desfaz o que você classificou.

O mês de referência sai do **nome do arquivo** (`nubank-2026-03.csv`), como sempre. Quando o nome não
traz `AAAA-MM` — e quase nenhum arquivo baixado do app do banco traz —, ele é deduzido pelas **datas
de dentro do arquivo**: o mês em que caiu a maior parte das compras, e não a mais antiga, porque toda
fatura tem lançamentos do fim do mês anterior. A resposta diz, arquivo por arquivo, qual mês valeu e
como foi decidido, justamente para você poder discordar e reenviar com o nome certo.

Mande o histórico inteiro numa leva só quando puder: a memória de categorização é compartilhada entre
as faturas **de uma mesma chamada**, então um mês sem categoria herda do mês que tem — e isso não
atravessa importações separadas.

Cada importação vira um registro em `syncRuns` com `trigger: 'upload'`, ao lado dos do botão e do
cron. É o que faz a pergunta "quando isto foi atualizado?" ter resposta também para quem nunca vai
usar o Drive.

---

## Carregando suas faturas

As faturas precisam estar em CSV com o cabeçalho `date,category,title,amount` (a coluna `category`
é opcional) e o nome do arquivo precisa conter o **mês de referência**: `nubank-2024-03.csv`.
Detalhes e exemplo em [`bills/README.md`](bills/README.md).

> As duas opções abaixo são do **dono da instância**, que roda o extractor na máquina onde as
> credenciais do Drive e a pasta de faturas existem. As demais contas sobem os arquivos pela tela —
> [Importando faturas pela tela](#importando-faturas-pela-tela) —, e por ali o nome do arquivo é uma
> preferência, não uma exigência.

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

### Quando as faturas novas entram

Nunca sozinhas: **a app não fica de olho na fonte**. Baixar uma fatura no Drive não muda nada até
alguém pedir a ingestão, e há três formas de pedir.

| Gatilho | Como | Quando usar |
| --- | --- | --- |
| **Botão Sincronizar** | No cabeçalho da app, em qualquer tela | Você acabou de colocar uma fatura na fonte e quer vê-la agora |
| **`pnpm extract`** | Linha de comando | Desenvolvimento, ou a primeira execução — é ela que gera o `token.json` do Drive |
| **Cron da VPS** | `docker compose -f docker-compose.prod.yml run --rm extractor` num timer | Deixar a base em dia sem depender de lembrar |

Os três rodam **o mesmo código** — `@expense/ingestion` — e gravam o mesmo registro de execução, na
coleção `syncRuns`. É por isso que a tela mostra "sincronizado há 3 h" mesmo quando quem sincronizou
foi o cron às 07:00: se cada gatilho tivesse o seu próprio rastro, uma extração automática apareceria
como "nunca sincronizado" e o botão viraria um convite a refazer trabalho já feito.

O que o botão faz por dentro:

```
POST /sync                    ← responde 202 na hora, sem esperar a extração
  └─ em segundo plano: lê as faturas, regrava mês a mês, reaplica as regras
       └─ grava o desfecho em `syncRuns`   ← status, contagens, e o relato linha a linha
GET /sync                     ← a tela pergunta de 2 em 2 segundos enquanto roda
```

A resposta sai antes de a extração terminar de propósito: ler 95 faturas do Drive passa de um minuto,
e segurar a conexão por esse tempo entregaria a decisão a um timeout de proxy — a extração continuaria
rodando e o navegador mostraria erro. Um segundo pedido enquanto o primeiro roda recebe **409**.

Três detalhes que valem saber:

- **A tela não recarrega sozinha no fim.** O popover oferece "Atualizar a tela" e espera você clicar:
  as telas guardam o próprio estado, e um recarregamento automático no meio da tela *Sem categoria*
  jogaria fora a regra que você estava montando.
- **O consentimento do Google não acontece pela API.** Ela lê o `token.json`, nunca o cria — não há
  navegador para abrir num container. Sem o token, a sincronização falha na hora com o texto dizendo
  para rodar `pnpm extract` uma vez numa máquina com navegador e copiar o arquivo. Antes disso ser
  explícito, a requisição ficava pendurada até o timeout sem dizer por quê.
- **Uma execução que morreu no meio destrava sozinha.** O registro em `running` é o que barra a
  segunda ingestão; passados 30 minutos ele é dado como interrompido na próxima leitura, senão um
  container derrubado deixaria o botão travado até alguém editar o banco na mão.

---

## Como uma compra ganha categoria

Da maior prioridade para a menor. A primeira que responde decide:

| # | Origem | Por quê nessa posição |
| --- | --- | --- |
| 1 | **`payment`** | Não é categoria: é o pagamento da fatura. É a única coisa que nenhuma regra alcança, nos dois sentidos — uma regra que trouxesse um pagamento para "casa" somaria a fatura inteira como se fosse consumo. |
| 2 | **A sua regra** | É o ponto de discordar do emissor. Ganha até da categoria que veio no CSV: se você disse que `Mercadolivre*Mercadol` é mercado livre, não interessa que a fatura diga "eletrônicos". |
| 3 | **Código interno do emissor** (`reversal_*`, `tax_*`, `bnpl_*`) | Traduzido para `estorno`, `impostos` e `parcelado`. São rótulos comuns: entram no total como qualquer categoria e você pode reclassificá-los. |
| 4 | **Categoria do CSV**, quando diz alguma coisa | `outros` não diz. |
| 5 | **Herança por título** | O mesmo título já categorizado em outra fatura. Vence a categoria mais frequente; no empate, a mais recente. |
| 6 | **Palavra-chave** (`uber` → transporte, `ifood` → restaurante, `saldo em atraso` → encargos) | O piso para uma base nova não começar inteira em `outros`. Regras `contains` cobrem o mesmo terreno sem mexer no código. |
| 7 | `outros` | Vira item da tela *Sem categoria*. |

> **`estorno`, `impostos` e `parcelado` já foram intocáveis, e não deviam ser.** O argumento era que
> uma regra apontando para eles quebraria o total do mês — não quebra: os três somam como qualquer
> categoria, e relabelar muda a composição, não o total. Quem quebra o total é `payment`, que fica de
> fora dele. O preço da proteção a mais era concreto: as compras vindas de `bnpl_*` ficavam presas em
> `parcelado` — que diz **como** se pagou, não **onde** se gastou — e não havia como mandar um
> "IOF de compra internacional" para `impostos`.

### Gasto e encargo não são a mesma coisa

Duas categorias ficam **fora do total gasto**:

- **`payment`** — o pagamento da fatura. Nunca foi gasto.
- **`encargos`** — juros, multa, saldo rolado e o IOF que o atraso gera. É o custo de financiar, não
  consumo. Somá-los respondia "quanto você gastou" com dinheiro que ninguém gastou: no histórico de
  referência, um único `Saldo em atraso` de R$ 10.023 em três linhas pesava mais que qualquer compra
  do ano, escondido dentro de `outros`. Em um dos meses, o encargo era **maior que o gasto**.

Ficar fora do total não é sumir: `/purchase/bill` devolve `charges` por mês, a tela de Faturas marca
os meses que tiveram encargo, e `GET /purchase?category=encargos` lista os lançamentos. Só `payment`
é invisível de verdade.

O IOF de uma compra internacional **não** é encargo — é imposto sobre um gasto que aconteceu, e
continua em `impostos`, dentro do total.

Encargo é detectado pelo título, o que erra às vezes: uma "anuidade" pode ser mensalidade de academia,
que é gasto de verdade. Por isso `encargos` é categoria comum, e uma regra sua tira a compra de lá.
O outro lado dessa moeda: uma regra larga demais pode arrastar encargos de volta para o total sem
querer — `contains "IOF de"` pega também o "IOF de atraso".

**A lista de palavras-chave de encargo é a única que a reaplicação redecide**, em vez de herdar da
ingestão. É a única inferência por título que muda *quanto* se gastou, e não só como o gasto se
reparte — mantê-la congelada significava que corrigir a lista só valia a partir do próximo
`pnpm extract`, inalcançável para quem não tem mais os CSVs. Agora `POST /category-rule/reapply`
aplica a lista de agora ao que já está no banco, nos dois sentidos: o título que a lista passou a
reconhecer entra em `encargos`, e o que ela deixou de reconhecer sai de lá e volta para a inferência
normal. A resposta traz `financing` com quantas compras mudaram por esse caminho, separado de
`classified`, justamente porque o total do mês muda.

Isso funciona porque nada além da palavra-chave produz `encargos`: o emissor não emite essa
categoria e nenhum alias aponta para ela. Então, para um lançamento que a ingestão pôs ali, refazer a
inferência pelo título é exatamente o que a ingestão faria hoje. As outras palavras-chave continuam
congeladas em `sourceCategory` de propósito — lá também moram a categoria que o emissor mandou e a
memória por título, que uma palavra-chave genérica não deve atropelar.

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

## O que conta como "fora do normal"

"Restaurante: R$ 359" não diz se é muito. O sistema descrevia sem comparar, e três telas de leitura
não davam uma decisão. O cartão da Visão geral compara cada categoria da última fatura contra o
próprio histórico — e o normal de cada uma é diferente: na base de referência a `Academia` varia 7%
ao mês e `lazer` varia 94%, então os mesmos "+40%" significam coisas opostas nas duas.

**A régua não é percentual.** Um corte de "40% acima da média" acusava quatro categorias num mês da
base, e duas eram oscilação normal: `serviços` a −49% estava a 0,7 desvio do seu padrão, e `Bebidas`
a −51% estava a 0,4. A Amazon, no mesmo mês, estava a **13,6 desvios**. O que decide é o desvio
relativo à variação da própria categoria; o percentual só aparece na tela, para ser lido.

| Regra | Por quê |
| --- | --- |
| Referência é a **mediana** dos 12 meses anteriores | Uma viagem de R$ 2.600 num mês levantaria a média de transporte pelo ano inteiro e esconderia justamente o mês em que o gasto fugiu. |
| Dispersão medida pelo **desvio absoluto mediano** | Pelo mesmo motivo: o desvio-padrão é inflado pelo próprio pico que se quer detectar. |
| ≥ 2,25 desvios | Calibrado sobre 24 meses. Era 2,5, medido sobre doze meses de uma série que atrasava um ciclo — [ver abaixo](#por-que-o-corte-desceu-de-25-para-225). |
| ≥ R$ 150 de diferença | Percentual mente na escala pequena — uma categoria de R$ 12 que vai a R$ 30 subiu 150% e não mudou nada. |
| ≥ 6 dos 12 meses com gasto | Quem aparece em quatro meses não tem "normal", tem esporadicidade, e compará-la geraria alarme a cada compra. Corta `viagem` (1/12), `eletrônicos` (1/12), `Shein` (2/12), `Carro` e `casa` (4/12). |
| `outros` fica fora | A categoria de fallback não descreve consumo: oscila entre 0,7% e 18,1% do mês na base de referência, e o que move isso é quanto você classificou. Os quatro alertas que ela gerava em 24 meses diziam "R$ 540 em não-classificado contra R$ 12 de normal" — notícia sobre a fila de *Sem categoria*, e inacionável: não dá para cortar `outros`. |

O mês em que a categoria não aparece conta como **zero**, e isso é o ponto: deixar de gastar é tão
informativo quanto gastar demais. Na base de referência, `Combustível` acendeu dois meses seguidos
por ter ido a zero.

O desvio em si **não vai para a tela**. Uma categoria muito previsível tem dispersão minúscula, e aí
um mês fora da curva dá z=47 — matematicamente certo e ilegível. Quem lê quer reais e percentual.

### Por que o corte desceu de 2,5 para 2,25

O 2,5 foi calibrado sobre doze meses de uma série errada: o recorte de "fatura fechada" atrasava um
ciclo, então o mês avaliado e a calibração vinham ambos do ciclo anterior. Refeita a conta sobre 24
meses da série corrigida:

| corte | alertas/mês | meses calados | `outros` em 24 meses |
| --- | --- | --- | --- |
| 3,00 | 1,1 | 9 de 24 | 3 |
| 2,50 | 1,3 | 8 de 24 | 4 |
| **2,25** | **1,6** | **6 de 24** | **4** |
| 2,00 | 1,8 | 5 de 24 | 6 |

A 2,5 o cartão ficava mais quieto do que se pretendia — a mira era ~1,7 alerta por mês — e a um custo
concreto: silenciava `Mercado Livre` a R$ 1.392 acima do normal (z=2,44), `supermercado` a +R$ 584
(z=2,43) e `restaurante` a +R$ 357 (z=2,35). Os seis alertas que 2,25 acrescenta em 24 meses são todos
gasto real, e nenhum é `outros`. Descer para 2,0 acrescenta seis e dobra a presença de `outros` — que
agora está fora de todo jeito.

Seis meses calados em 24 é a propriedade que se queria preservar: "nada fugiu do normal" continua
sendo uma resposta, não uma falha.

**O que 2,25 continua silenciando, e certo:** `Mercado Livre` a +R$ 573 num mês em que isso é 0,73
desvio — grande em reais e dentro do normal dele. Esse número está na *Composição do mês*, ao lado,
que é onde se lê tamanho. Este cartão responde outra pergunta.

### Onde a comparação falha

- **Mudança de patamar acende por meses seguidos.** Na base de referência, `lazer` saiu de ~R$ 100
  para ~R$ 400 e ficou: apareceu cinco meses consecutivos, porque em cada um deles ele *estava* acima
  da mediana dos doze anteriores. É verdade, mas deixa de ser notícia — a mediana só absorve o novo
  nível depois de alguns meses.
- **Categoria nova nunca aparece.** Sem histórico não há expectativa, então uma categoria que surge
  do nada fica de fora por definição, por maior que seja. Ela está na composição do mês, ao lado.
- **O ciclo em aberto não é comparado.** A comparação só olha fatura fechada, então o consumo das
  últimas semanas fica de fora até o ciclo virar — é a escolha certa (metade de um mês contra doze
  meses inteiros acusaria queda em tudo), mas significa que a notícia chega uma vez por ciclo, não
  quando a compra acontece.
- **O corte é uma linha, e perto dela ainda sobra dinheiro.** Depois de descer para 2,25, o maior
  gasto silenciado que ainda tem algum sinal é `restaurante` a +R$ 490 num mês (z=1,94) e `Amazon` a
  +R$ 450 (z=2,07). Qualquer limiar tem essa borda — descer até pegá-los traria `outros` e oscilação
  de restaurante todo mês.
- **Categoria que fica errática deixa de acender.** `Mercado Livre` acendeu a z=25,3 em out/25 e a
  z=8,9 em nov/25; em jun/26, com +R$ 1.392, chegou só a z=2,44. Os próprios picos alargaram o
  "normal" dela — a mediana e o desvio absoluto se adaptam, e essa é a intenção, mas o efeito é que
  quem gasta de forma cada vez mais irregular vira difícil de alertar.

---

## Como uma assinatura é detectada

O que define recorrência aqui é o **patamar de preço**, não a cadência. Cadência sozinha não
distingue nada: `Uber *Uber *Trip` aparece 43 meses seguidos com 43 valores diferentes, e a Netflix
aparece 52 meses com três. Uma assinatura é uma série feita de **poucos preços longos**, e um degrau
é a passagem de um patamar para o outro.

Antes de agrupar, o **prefixo do intermediário** sai do título. O mesmo Spotify chegou como
`Ebanx *Spotify`, `Ebw*Spotify`, `Ebn *Spotify` e `Dm *Spotify` conforme o gateway mudou de nome ao
longo dos anos — oito formas para uma assinatura só. Sem juntá-las, a série se parte em oito pedaços
curtos e a escada de 2019 a 2026 (R$ 8,50 → R$ 23,90, com uma promoção de R$ 9,90 que durou dez meses
e voltou) simplesmente não existe.

Passa por assinatura quem cumpre tudo isto:

| Regra | Por quê |
| --- | --- |
| ≥ 6 cobranças em ≥ 6 meses distintos | Abaixo disso qualquer coisa parece padrão. |
| ≥ 3 cobranças por patamar, na média | É a regra que decide. `Comercial Ovolar` tem 45 compras quase mensais, mas oscilando entre R$ 21 e R$ 28: 21 patamares, média 2,1. A Netflix tem 52 cobranças em 3 patamares, média 17,3. |
| ≤ 1,5 cobrança por mês | Assinatura cobra uma vez. Tira o `Ifood *Ifd*Dominos P`, que alterna entre dois preços de promoção 24 vezes em 9 meses. Não é 1,0 exato porque a data desliza entre o fim de um mês e o começo do outro. |
| Valor positivo, sem sufixo de parcela | Estorno não é preço. E uma compra dividida em dez é dez cobranças mensais idênticas — a assinatura mais convincente que existe, e não é uma. |

O preço vigente é **o último patamar que se repetiu**, e o anterior também precisa ter se repetido.
Um lançamento solitário não é preço: sem essa regra, uma taxa avulsa de R$ 9,90 antes da mensalidade
de R$ 149,90 fazia a tela anunciar um reajuste de **+1414%**, que seria o maior número da página e não
quer dizer nada.

### Onde a detecção falha

- **Parcelamento sem o sufixo.** `Casasbahia.C*287604502` são nove parcelas de R$ 183,84 que o emissor
  não numerou no título. É indistinguível de uma assinatura cancelada, e aparece como tal. Fica entre
  as encerradas, longe do topo da lista.
- **Assinatura de valor irregular escapa.** `Google One` (mensal de R$ 12,50 misturado com anual de
  R$ 149,90, mais um estorno no meio) e o `iFood Club` (escada 4,95 → 6,99 → 9,98 → 12,90, com só uma
  cobrança em cada degrau) não passam na média de 3. Afrouxar o corte para pegá-las traz junto todo
  fornecedor de preço oscilante, e o custo de um falso positivo — anunciar reajuste onde não houve —
  é maior que o de perder uma linha.
- **Troca de plano vira percentual sem sentido.** `Google Storage` saiu de R$ 6,99 por mês para
  R$ 69,99 por ano: os dois valores são reais, e o `+901%` entre eles não significa nada.
- **O mesmo lugar sob nomes diferentes conta duas vezes.** `Google Youtube` e `Dl*Google Youtub`
  aparecem separados. Fundir por prefixo resolveria esse caso e quebraria outros — `Casa de Paes
  Faria` e `Casa de Paes Faria Lj2` são filiais distintas —, e na base de referência havia só nove
  pares desses. Não compensou.

### Quando um degrau vira aviso

A tela de Assinaturas mostra a escada inteira de cada uma, mas exige ir olhar. O cartão **Mudou de
preço** da Visão geral traz só o que é notícia agora: os degraus que caíram dentro dos **três ciclos
fechados mais recentes**. Um reajuste de seis meses atrás já foi visto, não é mais aviso — está na
escada, não no cartão.

O corte usa o fim do ciclo, pelo mesmo motivo do resto da Visão geral: `month` nomeia o vencimento, e
o consumo vem do mês anterior. A fronteira é o fim do ciclo **anterior** à janela de três, para os
três ciclos entrarem inteiros em vez de o mais antigo entrar pela metade. Sem histórico suficiente
para recuar três ciclos — uma base nova — a janela vira "tudo o que existe": é o caso em que todo
degrau ainda é notícia, e o contrário silenciaria a tela justamente para quem acabou de chegar.

Assinatura encerrada fica fora mesmo com reajuste no meio do caminho: um degrau em algo que não se
paga mais não é decisão a tomar. E a ordem é pela **mordida anual** — `(atual − anterior) × 12` —, não
pela data: um reajuste de R$ 2 por mês é R$ 24 no ano, e não compete com um de R$ 60. Percentual
sozinho não diz isso; +8,8% pode ser R$ 7 ou R$ 700, dependendo do que ele é 8,8% de.

O cartão some quando não há nada a dizer — um aviso que aparece todo dia deixa de ser aviso. Medido
sobre a base de referência em 2026-07-28: das 6 assinaturas ativas, uma teve degrau nos três ciclos
(Barbearia Sr Jhon, +8,8%, +R$ 84/ano).

O cartão exige abrir a tela — mas a mesma lista existe como rota própria,
[`GET /purchase/price-alerts`](#get-purchaseprice-alerts), para quem quer perguntar sem abrir nada:
um cron pessoal, um atalho de celular. A API não manda notificação sozinha, só responde "o que
mudou" de um jeito que dá para plugar em qualquer canal depois.

---

## Estrutura

Monorepo **pnpm workspaces + Turborepo**, TypeScript em tudo.

```
apps/
  api/         @expense/api             NestJS + Mongoose — endpoints, agregações e POST /sync
  web/         @expense/web             React + Vite + shadcn/ui — tabelas e gráficos
  extractor/   @expense/extractor       o comando de terminal: .env, conexão e saída no console
packages/
  categorization/ @expense/categorization  a escada de precedência, pura e testada
  ingestion/      @expense/ingestion       ler as faturas (Drive ou disco) e gravá-las
bills/                                     seus CSVs quando EXTRACTOR_SOURCE=local
docker-compose.yml                         MongoDB local (+ mongo-express opcional)
```

Os dois pacotes existem pelo mesmo motivo, e é o motivo de o extractor ser tão fino: **a mesma coisa
acontece em dois processos**, e duas implementações dela divergiriam.

- **`categorization`** guarda a decisão de qual título vai para qual categoria. Ela roda na API,
  quando você mexe numa regra, e na ingestão, depois de regravar. Duas cópias da precedência
  divergiriam, e o sintoma apareceria meses depois como uma categoria que muda sozinha ao
  sincronizar.
- **`ingestion`** guarda a leitura das faturas e a ordem das operações de uma ingestão — apaga o mês,
  grava, backfill, reaplica. Ela roda no `pnpm extract`, no `POST /sync` e no `POST /import`. Aqui a
  divergência seria pior que uma categoria errada: uma das três pontas esquecendo a reaplicação no
  fim significaria que ingerir por aquele caminho **desfaz** a classificação manual.

Nos dois casos o acesso ao banco fica de fora do pacote, por trás de uma interface — `PurchaseStore` e
`BillStore`. O extractor as implementa no driver cru do MongoDB; a API, em Mongoose.

**É também onde o multiusuário para.** Nenhum dos dois pacotes sabe que usuário existe: o dono entra
pelos stores, que já nascem presos a um `userId` (`createPurchaseStore(model, userId)`), e para
`reapplyRules` e `ingestBills` isso continua sendo simplesmente "a base". Sem esse corte, aplicar uma
regra recategorizaria as compras de todo mundo.

| Camada | Tecnologia |
| --- | --- |
| **API** | NestJS 11, Mongoose 8, class-validator, Swagger |
| **Front** | React 19, Vite 7, Tailwind CSS 4, shadcn/ui (Radix + lucide), Recharts, React Router 7 |
| **Extractor** | Node + tsx, driver oficial do MongoDB 6 |
| **Ingestão** | googleapis (Drive API v3) + OAuth de aplicativo instalado |
| **Banco** | MongoDB 8 (Docker) ou MongoDB Atlas |
| **Monorepo** | pnpm workspaces, Turborepo, ESLint 9 (flat config), Prettier |

### Modelo de dados

**`purchases`** — uma linha por lançamento:

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `userId` | ObjectId | De quem é a compra — o `_id` em `users`. Está em primeiro em todos os índices desta coleção |
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

**`users`** — uma linha por conta: `username` e `email` (únicos, em minúsculas) e `passwordHash`
(bcrypt, custo 12). A senha em texto puro não é gravada em lugar nenhum. O índice de `email` é
**parcial** (`{ email: { $exists: true } }`), senão as contas anteriores ao campo colidiriam entre si
— para um índice único comum, dois documentos sem o campo valem ambos como `null`.

**`passwordResets`** — um pedido de redefinição em aberto: `userId`, `tokenHash`, `expiresAt` e
`usedAt`. O token não mora aqui; veja [Senha](#senha-trocar-e-recuperar). Um índice TTL apaga os
documentos um dia depois de expirarem — faxina, não segurança: a expiração que vale é conferida na
leitura, porque o TTL do Mongo roda de minuto em minuto.

**Todas as coleções de dados carregam `userId`** — `purchases`, `categoryRules`, `categories`,
`subscriptions`, `consolidationDismissals` e `syncRuns`. Os índices únicos são **compostos com ele**:
duas contas podem ter a categoria "mercado", a regra `ifood → delivery` e um apelido para a mesma
assinatura sem colidir. O `_id` do usuário é o que carimba, e não o nome, para que renomear uma conta
um dia não obrigue a reescrever a base inteira.

---

## API

Documentação interativa em `http://localhost:3000/docs`.

### `GET /purchase`

Lista as compras com os agregados do conjunto filtrado. Pagamentos e encargos ficam de fora — são as
duas coisas que `/purchase/bill` também tira do total, e deixá-los entrar aqui faria as duas telas
discordarem do mesmo mês. Estornos, ao contrário, entram com valor negativo e abatem a soma.

| Query param | Exemplo | Efeito |
| --- | --- | --- |
| `category` | `supermercado,transporte` | Uma ou mais categorias, separadas por vírgula. `encargos` só aparece se for pedido assim; `payment`, nunca |
| `title` | `uber` | Busca parcial, sem diferenciar maiúsculas |
| `date` | `2024-03-15` | Mês da **data da compra**. Qualquer dia serve — o filtro cobre o mês inteiro |
| `month` | `2024-03` | Mês da **fatura** em que a compra apareceu |
| `page` | `2` | Página, começando em 1 |
| `limit` | `50` | Linhas por página. Teto de 250 — sem ele, um limite alto traria a coleção inteira e desfaria a paginação |
| `sort` | `amount` | `title`, `amount`, `category`, `referenceMonth` ou `date`. Lista fechada: o valor vira chave de ordenação do Mongo |
| `order` | `desc` | `asc` ou `desc`. O padrão é `date` decrescente — a tela abre no que aconteceu agora |

`date` e `month` filtram campos diferentes de propósito: uma compra de 28/02 costuma cair na fatura
de março, então `date=2024-02-10` e `month=2024-02` devolvem conjuntos distintos. A tela filtra por
`month` — o seletor se chama "Fatura".

**`purchases` é uma página; todo o resto descreve o filtro inteiro.** É a distinção que sustenta a
tela: os painéis respondem "onde o dinheiro foi neste recorte", e somá-los sobre as cinquenta linhas
visíveis diria outra coisa sem nenhum sintoma. A ordenação sempre desempata por `_id`, senão duas
páginas de uma coluna com empates poderiam repetir e omitir a mesma compra.

```jsonc
{
  "purchases": [ /* a página */ ],
  "total": 742,          // linhas que o filtro alcança
  "sum": 269470.89,
  "average": 363.17,
  "page": 1,
  "limit": 50,
  "pageCount": 15,
  "byMonth": [           // agrupado pela DATA da compra, não pelo mês da fatura
    { "month": "2024-03", "total": 4820.15, "count": 61 }
  ],
  "byCategory": [
    { "categoryByMonth": "supermercado", "totalCategory": 37340.21, "frequency": 214, "percentage": 17.1 }
  ]
}
```

### `GET /purchase/bill`

Uma entrada por mês de referência, em ordem cronológica.

```jsonc
{
  "month": "2025-02",           // mês do VENCIMENTO, não o das compras
  "cycleEnd": "2025-01-26",     // último dia de compra do ciclo, inferido das datas
  "valuePaid": 12150.23,        // a linha de categoria `payment` do mês
  "total": 12150.23,            // gastos menos estornos; sem o pagamento e sem os encargos
  "charges": 141.16,            // juros, multa e saldo rolado — fora do total, mas não escondidos
  "frequency": 37,              // número de compras, sem contar pagamento nem encargo
  "categoriesResult": [
    { "categoryByMonth": "viagem", "totalCategory": 4665.7, "frequency": 4, "percentage": 38.4 }
  ],
  "viagem": 38.4,               // atalho: percentual por categoria, usado nas colunas da tabela
  "supermercado": 4.29
}
```

### `GET /purchase/recurring`

As cobranças recorrentes e o degrau de preço de cada uma, ativas primeiro e depois pelo maior degrau
em módulo — uma queda importa tanto quanto uma alta, e é a que ninguém confere. É o que a tela
*Assinaturas* lista; o critério está em [Como uma assinatura é detectada](#como-uma-assinatura-é-detectada).

A varredura é sobre a base inteira, sem recorte de período: a escada do Spotify começa em 2019, e
qualquer janela mais curta acharia um patamar só e nenhum degrau.

```jsonc
{
  "key": "spotify",                       // identidade do grupo: normalizado e sem gateway
  "title": "Dm *Spotify",                 // a forma mais frequente do título
  "name": "Spotify",                      // o apelido, ou null — ver POST /subscription
  "titles": ["Dm *Spotify", "Ebanx*Spotify", "Ebw*Spotify"],  // as 8 formas agrupadas
  "charges": 84,
  "months": 77,
  "current": 23.9,                        // último patamar que se repetiu
  "previous": 21.9,
  "change": 9.13,                         // %, negativo quando o preço caiu
  "since": "2025-09-14T00:00:00.000Z",    // desde quando `current` vale
  "lastDate": "2026-07-12T00:00:00.000Z",
  "active": true,                         // cobrou nos últimos 2 meses
  "plateaus": [                           // a escada inteira, do mais antigo ao mais novo
    { "amount": 8.5, "charges": 12, "since": "2019-11-08T00:00:00.000Z" }
  ]
}
```

### O nome formal de uma assinatura

| Rota | O que faz |
| --- | --- |
| `POST /subscription` | `{ "key": "melimais", "name": "Meli+" }` — batiza. Rebatizar sobrescreve |
| `DELETE /subscription/:key` | Tira o apelido e devolve a assinatura ao título do cartão |

A chave é o `key` do `GET /purchase/recurring`, e é **por isso** que ela existe: o apelido não pode se
prender ao título cru. `Dm *Spotify` já chegou como `Ebanx*Spotify`, `Ebw*Spotify` e outras cinco
formas, e um nome preso a uma delas se perderia na fatura em que o gateway mudasse. A chave é o
título normalizado e sem o prefixo do gateway, a mesma que agrupa a série.

O preço disso é que a chave é derivada, não fornecida: mudar `stripGateway` ou `normalize` pode
reagrupar a base e deixar um apelido apontando para uma chave que não existe mais. Um apelido órfão é
inofensivo — a tela volta ao título do cartão —, mas é silencioso.

O nome é só rótulo. Não muda categoria, total, agrupamento nem a ordem da lista, e a detecção
continua sendo função pura das compras: o `POST` grava numa coleção à parte e a API junta os dois na
leitura. Por isso batizar não exige que a assinatura esteja na lista hoje — quem cancelou e voltou
mantém o apelido durante o intervalo em que a série ficou curta demais para ser detectada.

### `GET /purchase/price-alerts`

O mesmo cartão **Mudou de preço** da Visão geral — [critério aqui](#quando-um-degrau-vira-aviso) —,
como rota própria. Existe para quem quer perguntar "o que mudou" sem abrir a tela: um cron pessoal,
um atalho de celular. A API não manda nada sozinha, só responde a lista; o canal fica por conta de
quem consome.

```jsonc
[
  {
    "key": "srjhon barbearia",
    "label": "Barbearia Sr Jhon",         // o apelido quando existe; senão, o título do cartão
    "previous": 79.99,
    "current": 86.99,
    "change": 8.75,                       // %
    "since": "2026-04-27T00:00:00.000Z",
    "yearly": 84                          // (atual − anterior) × 12
  }
]
```

Igual à mecânica interna do cartão. Assinatura sem esse degrau nos três ciclos fechados mais
recentes, ou encerrada, não aparece — vazio significa "nada a dizer agora", não "sem assinatura".

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
| `GET /category-rule` | As suas regras, cada uma com quantas compras e títulos ela **governa** hoje |
| `GET /category-rule/consolidation` | Onde um punhado de regras `exact` viraria uma `contains` — [critério abaixo](#onde-dá-para-juntar-regras). Vem com `dismissed` marcado nas que o usuário escondeu |
| `POST /category-rule` | Cria ou atualiza a regra. Reclassificar o mesmo título edita a que já existe, nunca empilha uma segunda |
| `POST /category-rule/consolidate` | Troca as `exact` cobertas pelo trecho por uma `contains`, reaplicando **uma vez**. Aceita `exceptions` — títulos a manter na categoria de agora, como `exact`, antes do trecho entrar |
| `POST /category-rule/consolidation/dismiss` | Esconde uma sugestão da lista, pelo par `(categoria, trecho)` — não some da API, só ganha `dismissed: true` |
| `POST /category-rule/consolidation/restore` | Desfaz o descarte acima |
| `PATCH /category-rule/:id` | Muda o trecho, o tipo ou o destino de uma regra que já existe, pelo `id`. Ao contrário do `POST`, que acha a regra pelo par `(kind, value)`, este localiza por `id` — é a única forma de editar o próprio `value` sem deixar a forma antiga órfã |
| `DELETE /category-rule/:id` | Apaga a regra e devolve as compras dela à `sourceCategory` |
| `POST /category-rule/reapply` | Reclassifica a base com as regras e a lista de encargos de agora, sem reextrair. É o gatilho para uma mudança na lista de palavras-chave de encargo valer no que já está no banco |

```jsonc
// POST /category-rule
{ "kind": "contains", "value": "mercadolivre", "category": "mercado livre" }
// → { "rule": { ... }, "classified": 92, "restored": 0, "financing": 0 }
```

`classified` são as compras que uma regra moveu; `restored`, as que voltaram à `sourceCategory` por
não haver mais regra; `financing`, as que a camada de encargo reescreveu — para dentro ou para fora
de `encargos`. Esta última vem separada porque muda o total gasto do mês, e não só como ele se
reparte. Os três contam **compras**, não títulos, e a operação é idempotente: chamar duas vezes
seguidas devolve zeros na segunda.

### Onde dá para juntar regras

A tela de **Regras** propõe trocar um punhado de regras `exact` por uma `contains`. O gatilho é
concreto: nesta base, `Shopee` acumulou 57 regras apontando para títulos que só diferem no sufixo
(`Shopee *Inpower`, `Shopee *Sieno`). Cada compra nova com sufixo novo volta para a fila de
classificação, e classificá-la cria a 58ª regra — o trabalho é infinito por construção.

O candidato é um **prefixo cortado em fronteira** (`shopee`, `shopee `, `shopee *`, nunca `shope`),
com no mínimo 4 caracteres, e só é proposto se cobrir ao menos 3 regras. Entre dois que cobrem o
mesmo tanto, vence o mais longo — o mais específico é o que menos promete alcançar o que ninguém
previu.

**O que o critério recusa é o mais útil que ele produz.** Um candidato é marcado como *bloqueado* se
tomaria um título que hoje está numa categoria de verdade. Só `outros` pode ser capturado, porque
ali não há classificação a desrespeitar — e capturar dali é o ganho, não o risco. Títulos protegidos
pela própria regra `exact` não contam como conflito: `exact` continua ganhando de `contains` depois
da troca.

Na base de referência isso muda a resposta. `contains "shopee"` cobriria 50 regras **e levaria junto
22 títulos** que estão em `vestuário`, `saúde`, `eletrônicos`, `estorno` e `supermercado` — porque a
Shopee é um marketplace, e ali a classificação segue o que foi comprado, não onde. Nenhum dos 22 tem
regra própria; suas categorias vieram da ingestão. A sugestão aparece assim mesmo, com o preço à
vista, porque silenciá-la esconderia a maior alavanca da base e aplicá-la destruiria classificação
deliberada.

O candidato não precisa começar no início do título. `Ebanx*Spotify` e `Dm *Spotify` não têm prefixo
em comum nenhum — o intermediário que processa a cobrança muda de nome, o serviço não —, mas os dois
têm `spotify` como palavra, e é dali que sai o candidato: qualquer palavra do título, cortada em
fronteira, entra na busca, não só a que começa em zero. Na base de referência isso rendeu três
consolidações seguras novas que o prefixo sozinho não via — `melimais` (`Mp *Melimais`,
`Ec *Melimais`, `Ec*Melimais`), `pizza` e `zoo `.

**Conflito não precisa ser tudo ou nada.** Quando a lista de conflitos está expandida, dois botões
ficam disponíveis: *Consolidar mesmo assim*, que muda a categoria de quem está em conflito também, e
*Manter exceções e aplicar*, que cria uma regra `exact` para cada título de `conflicts` — na
categoria em que já está — antes do trecho entrar. `exact` sempre ganha de `contains` na escada de
precedência, e é isso que preserva a exceção. Medido na base de referência: as três sugestões
bloqueadas hoje têm 2, 6 e 7 conflitos — nenhuma perto do extremo de 22 do exemplo do Shopee acima —,
e o segundo botão fica indisponível acima de 15, porque criar dezenas de regras num clique só deixa
de ser uma exceção rápida e vira algo que merece revisão título a título.

#### Onde este critério falha

- **Bloqueio é aviso, não trava.** `POST /category-rule/consolidate` sempre aplicou o que mandarem —
  a tela é quem decide o que mostrar. O botão de aplicar mesmo assim mora dentro da lista de
  conflitos expandida, e só ali: consolidar uma bloqueada é uma decisão informada, não a mesma coisa
  que consolidar uma seguindo, e o que não se pode é fazê-la sem ver o preço primeiro.
- **Descartar não é decisão final.** Quem julga que uma sugestão não vale a pena pode escondê-la sem
  perder a chance de rever depois — ela continua na resposta da API, marcada, e a tela guarda um
  atalho para desfazer.

### `GET /sync` e `POST /sync`

O estado da ingestão e o pedido de uma nova — [o fluxo inteiro](#quando-as-faturas-novas-entram).
`POST` responde **202** ao aceitar o pedido, ou **409** se já houver uma em andamento. As duas rotas
respondem **403** para quem não é a conta dona da instância: elas falam do Google Drive, que é dela
— veja [Contas](#contas).

```json
{
  "running": false,
  "lastRun": {
    "trigger": "cli",              // "manual" é o botão; "cli", o cron; "upload", o POST /import
    "status": "ok",                // running | ok | error
    "startedAt": "2026-08-04T07:00:00.000Z",
    "finishedAt": "2026-08-04T07:01:12.000Z",
    "bills": 95,
    "purchases": 5744,
    "rules": 180,
    "classified": 1620,
    "restored": 0,
    "financing": 12,
    "log": ["Buscando as faturas no Google Drive...", "  2026-09: 61 compras"]
  }
}
```

O `log` é o mesmo relato que o `pnpm extract` imprime no terminal, guardado porque é a única pista
dos casos que não são erro e não mudam contagem nenhuma: um arquivo ignorado por ter nome fora do
padrão `<ano>-<mês>`, dois arquivos disputando o mesmo mês, linhas descartadas por valor ilegível. A
tela mostra dele só as linhas de aviso.

### `POST /import`

`multipart/form-data` com um ou mais CSVs no campo `files` — a entrada de faturas de quem não usa o
Drive, descrita em [Importando faturas pela tela](#importando-faturas-pela-tela). Máximo de 120
arquivos de 2 MB cada, só `.csv`. Responde **409** se já houver uma ingestão em andamento para
aquela conta.

Síncrono, ao contrário do `POST /sync`: o 202 de lá existe porque ler 95 faturas do Drive leva mais de
um minuto e um proxy cortaria a conexão no meio. Aqui os arquivos já chegaram, e o que falta é
parsear e gravar.

```jsonc
{
  "files": [
    { "name": "nubank-2026-03.csv", "month": "2026-03", "monthFrom": "filename", "purchases": 61, "discarded": 0 },
    // Sem <ano>-<mês> no nome: o mês saiu das datas de dentro do arquivo
    { "name": "fatura (3).csv", "month": "2026-04", "monthFrom": "content", "purchases": 58, "discarded": 2 },
    { "name": "extrato.csv", "month": null, "monthFrom": null, "purchases": 0, "discarded": 0,
      "skipped": "o nome não contém <ano>-<mês> e as datas de dentro do arquivo não foram lidas." }
  ],
  "result": { "bills": 2, "purchases": 119, "rules": 12, "classified": 40, "restored": 0, "financing": 0 },
  "log": ["Gravando 2 faturas no MongoDB:", "  2026-03: 61 compras"]
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
| `pnpm test` | Testes: funções puras, serviços contra um MongoDB em memória — [detalhes](#os-testes-que-precisam-de-banco) — e a API HTTP inteira, guard e `ValidationPipe` incluídos — [detalhes](#os-testes-que-sobem-a-api-inteira) |
| `pnpm db:up` / `pnpm db:down` | Sobe / derruba o MongoDB |
| `pnpm db:seed` | Popula o banco com 18 meses de faturas fictícias (determinístico) |
| `pnpm extract` | Roda o extractor com as suas faturas de verdade |
| `pnpm reapply` | Reaplica regras e encargos sobre a base já gravada, sem reextrair — veja abaixo |
| `pnpm --filter @expense/api migrate:multiuser` | Uma vez só, vindo da versão de usuário único: cria a conta dona e dá dono aos dados que não têm — [detalhes](#vindo-da-versão-de-um-usuário-só) |
| `pnpm --filter @expense/api set-email <usuario> <email>` | Dá endereço a uma conta criada antes de o e-mail existir, para ela poder recuperar a senha |

Para inspecionar o banco pelo navegador: `docker compose --profile tools up -d` → http://localhost:8081.

### Escala: o que foi medido

Antes de mexer em qualquer coisa aqui, valia saber quando o problema chega de verdade. A base cresce
**732 compras por ano** (média de 2019–2025). Replicando-a até 58 mil documentos — o que levaria
cerca de **72 anos** neste ritmo — os números ficavam assim:

| Operação | 5.855 docs | 58.550 docs |
| --- | --- | --- |
| `GET /purchase` devolvendo tudo | 52 ms · 1,1 MB | 107 ms · **11,4 MB** |
| `GET /purchase/bill` | 41 ms | 123 ms → **79 ms** com projeção |
| `updateMany` por `$in` de títulos (reaplicação) | 2 ms | 35 ms → **5 ms** com índice em `title` |
| Uma página de 50 ordenada, no servidor | — | 1 ms |

O **índice em `title`** serve à reaplicação, e não à busca: um `$regex` sem âncora e
case-insensitive não usa índice nenhum e mede 13 ms com ou sem ele, enquanto `distinct` e
`updateMany` consultam por igualdade e ficam sete vezes mais rápidos. A **projeção no `listBills`**
existe porque a agregação lê quatro campos e sem dizê-lo o driver traz também `title`,
`sourceCategory`, `_id` e `__v`.

**Paginação, ordenação e agregação passaram para o servidor.** Sobre a base atual a resposta de
`GET /purchase` caiu de **1,13 MB para 17,7 KB** numa página de 50, e de 52 ms para 12 ms.

O detalhe que torna isso perigoso, e que decidiu o desenho: mover só a paginação teria sido um erro
silencioso. A ordenação era do cliente, então ordenar por valor passaria a ordenar as cinquenta
linhas visíveis — a tela mostraria "a maior compra" que é apenas a maior da página. Os dois painéis
tinham o mesmo problema: eram somados a partir da lista recebida, e passariam a descrever a página
chamando isso de "onde o dinheiro foi". Por isso a resposta separa as duas escalas — `purchases` é a
página, e `total`, `sum`, `average`, `byMonth` e `byCategory` descrevem o filtro inteiro.

Duas ordenações ganharam critério de desempate por causa disso. A das linhas desempata por `_id`:
sem isso, ordenar por uma coluna com milhares de empates deixaria o Mongo livre para devolver a mesma
compra na página 1 e de novo na 2, enquanto outra não apareceria em nenhuma. A das categorias
desempata pelo nome, senão duas que somam o mesmo trocam de lugar entre uma requisição e outra.

### Os testes que precisam de banco

A maior parte das regras mora em função pura e é testada sem banco. Mas o que dá mais medo de
mexer não é isso — é a reaplicação de regras, o upsert, o rename/merge de categoria e a redecisão
da camada de encargo, e as quatro só existem falando Mongo.

Um `Model` dublado mentiria justamente aí. `restoreSourceCategory` grava com pipeline de agregação
(`{ $set: { category: '$sourceCategory' } }`), que copia campo para campo dentro do servidor: com um
mock, o teste passaria gravando a string literal `"$sourceCategory"`. O rename depende de três
`updateMany` acertando coleções diferentes. E a busca por título vira regex, onde `Mercadolivre*Mercadol`
sem escapar casaria com "Mercadoliv" seguido de qualquer coisa.

Então esses testes sobem um **mongod de verdade, em memória**, via `mongodb-memory-server`. O harness
está em `apps/api/src/testing/mongo.ts` e não sobe o Nest: os serviços recebem os `Model` pelo
construtor e são instanciados direto — o que se quer provar é a decisão e a escrita, não a injeção de
dependência, que o smoke test do CI já exercita.

O binário do mongod (~77 MB) é baixado uma vez e fica em cache; a suíte inteira roda em cerca de dois
segundos depois disso. No CI ele é cacheado por `MONGOMS_DOWNLOAD_DIR`.

> Um efeito colateral: os schemas declaram `@Prop({ type: ... })` explicitamente em vez de deixar o
> tipo ser inferido. O `emitDecoratorMetadata` só existe sob o compilador do TypeScript, e os testes
> rodam sob esbuild, que não o emite. O schema produzido é o mesmo.

### Os testes que sobem a API inteira

Os testes de serviço acima instanciam a classe direto pelo construtor — provam a decisão e a
escrita, mas pulam o Nest inteiro: o container de injeção de dependência, o guard de sessão, o
`ValidationPipe`. É exatamente aí que mora o risco que a autenticação (`98370b2`) introduziu — um
módulo esquecido, um decorator de rota errado, um guard que libera o que devia bloquear — e nenhum
desses erros aparece testando o serviço isolado.

`apps/api/src/http.itest.ts` compila o `AppModule` de verdade via `Test.createTestingModule`,
contra o mesmo `mongodb-memory-server`, com um convite e contas de teste criadas na hora — nunca as do
`.env` real — e bate nas rotas por HTTP com `supertest`. Cobre: o guard bloqueando sem sessão e
liberando as rotas `@Public()`; cadastro, login e logout abrindo e fechando a sessão de verdade; o
`ValidationPipe` rejeitando corpo incompleto e campo desconhecido; o `/sync` respondendo só ao dono da
instância; e a resolução de cada controller principal pelo container do Nest.

**E o isolamento entre contas, que é o teste que justifica o multiusuário existir.** Vazamento entre
contas não tem sintoma: a resposta tem o formato certo, o status é 200 e a tela mostra números
plausíveis — de outra pessoa. Nenhum teste de serviço pega isso, porque cada um roda com um usuário
só. Ali duas contas importam faturas na mesma base e cada rota é conferida contra o que a vizinha
gravou, incluindo `PATCH` e `DELETE` de regra com o id da outra, que precisam dar 404 e não 200.

Por que é um comando separado (`pnpm test:http`, dentro do `pnpm test` da API) em vez de entrar no
glob de `*.test.ts`: o efeito colateral do `emitDecoratorMetadata` citado acima, que é inofensivo
para os schemas do Mongoose, é fatal aqui. Sem a metadata de tipo, o Nest não sabe qual classe
injetar em cada parâmetro de construtor e passa `undefined` — silenciosamente, até algum método
tentar chamar em cima disso. `esbuild` (o transpilador do `tsx`, usado pelo resto da suíte) nunca
emite essa metadata; é uma limitação conhecida, não um bug deste projeto. Por isso este arquivo é
`.itest.ts`, não `.test.ts`, e roda sob `ts-node` (`ts-node/register/transpile-only`), que usa o
compilador de verdade do TypeScript.

### Quando rodar `pnpm reapply`

Quase nunca, e é de propósito: os caminhos que você percorre já reaplicam sozinhos. Criar, editar ou
apagar uma regra reaplica na mesma requisição, e `pnpm extract` reaplica no fim.

Sobra um caso, que nenhum deles cobre: **a tabela de palavras-chave de encargo mudou no código**.
Ela é a única inferência por título que a reaplicação *redecide* em vez de herdar de
`sourceCategory` — porque é a única que muda **quanto** você gastou, e não só como o gasto se
reparte. Acrescentar `juros rotativo` à lista sem este comando só valeria a partir da próxima
extração, o que é inalcançável para quem não tem mais os CSVs.

```
$ pnpm reapply
Reaplicadas 255 regras:
  0 compras classificadas por uma regra
  0 devolvidas à categoria que veio da fatura
  3 entraram ou saíram de encargos

Atenção: encargo fica fora do total gasto — os totais por mês mudaram.
```

Os dois primeiros números repartem o gasto; o terceiro o altera. Com a base em dia o comando diz
"nada mudou" e não escreve — é idempotente, e é a mesma operação de `POST /category-rule/reapply`.

> Tirar uma palavra-chave também funciona, e é o caso mais delicado: devolver a compra à ingestão a
> devolveria a `encargos`, então o motor refaz a inferência pelo título. `sourceCategory` fica
> intocada nos dois sentidos — é a opinião congelada da fatura, e reaplicar nunca a reescreve.

---

## Estado atual

- **O multiusuário é de dados, não de administração.** Cada conta é uma ilha: não há papéis, nem
  compartilhamento entre contas, nem tela para listar, renomear ou apagar usuários — isso se faz no
  banco. O único privilégio que existe é `OWNER_USERNAME`, e ele vale para uma coisa só: disparar a
  sincronização com o Drive.
- **A senha se troca e se recupera; o e-mail, não.** `/conta` troca a senha e `/esqueci` recupera a
  conta, mas mudar o **endereço** de uma conta continua sendo `set-email` na linha de comando. Uma
  tela para isso precisaria confirmar o endereço novo por e-mail antes de trocar — senão um erro de
  digitação tranca a recuperação da conta em silêncio —, e esse é um segundo fluxo inteiro.
- **Um convite só, que não expira.** Revogá-lo é trocar `INVITE_CODE` e reiniciar a API, o que não
  derruba quem já entrou. Não há convite por pessoa nem por prazo.
- **O Drive continua sendo de uma conta Google só.** As credenciais OAuth moram no servidor e são do
  dono da instância; as demais contas importam CSV pela tela. Um Drive por usuário exigiria tela de
  consentimento, token por conta e refresh, e não é o que esta versão se propõe a fazer.
- **Nada observa a fonte.** O botão **Sincronizar** tirou o `pnpm extract` por SSH do caminho, mas
  não transformou a app num observador: uma fatura nova no Drive continua invisível até alguém pedir
  a ingestão, no botão ou no cron. Não há webhook do Drive nem varredura periódica de dentro da API —
  o agendamento fica com o sistema operacional da VPS, que é onde ele é fácil de ver e de desligar.
  A tela ao menos passou a **dizer** quando foi a última vez, que era a metade que faltava: antes,
  uma base parada e uma base em dia eram visualmente idênticas.
- **A sincronização não avisa quando termina.** Quem clica e sai da tela não recebe nada — o
  resultado fica no popover, esperando alguém abrir. Mesma decisão do aviso de reajuste, logo abaixo:
  a API responde "o que aconteceu", e nenhum canal de push está embutido.
- **A lista de encargo se corrige sem reextrair; as outras palavras-chave, não.** `POST
  /category-rule/reapply` aplica a lista de encargo de agora ao que já está no banco, nos dois
  sentidos — [como](#gasto-e-encargo-não-são-a-mesma-coisa). Já as palavras-chave que apenas repartem
  o gasto (`uber` → transporte, `ifood` → restaurante) continuam congeladas em `sourceCategory`, e
  corrigi-las ainda depende de um `pnpm extract` — ou de uma regra sua, que resolve caso a caso e
  ganha da tabela. A diferença é deliberada: `sourceCategory` também guarda a categoria que o emissor
  mandou e a memória por título, e uma palavra-chave genérica não deve atropelar as duas.
- **A reaplicação de regras varre a coleção inteira a cada mudança**, e isso é uma escolha — é o que
  a mantém idempotente. Numa base pessoal some no tempo da requisição; veja
  [Escala](#escala-o-que-foi-medido) para os números. `/purchase` já não faz isso: pagina, ordena e
  agrega no servidor.
- **O aviso de reajuste tem rota, mas nada manda sozinho.** `GET /purchase/price-alerts` devolve os
  mesmos degraus do cartão da Visão geral — [como](#quando-um-degrau-vira-aviso) — pronto para um
  cron pessoal ou atalho de celular perguntar sem abrir a tela. Não há push, e-mail nem qualquer
  canal embutido: a API responde "o que mudou", e o resto é de quem consome. O que a detecção em si
  erra de propósito está em [Onde a detecção falha](#onde-a-detecção-falha).
- `GET /purchase/recurring` varre a coleção inteira e agrupa em memória a cada requisição, porque a
  escada de preços depende da série completa. Mesmo custo da reaplicação de regras, e some igual numa
  base pessoal.
- **O dia em que o ciclo fecha é inferido, não informado.** O CSV não diz em que dia a fatura fecha, e
  a diferença importa: `referenceMonth` nomeia o mês do *vencimento*, e o consumo vem do mês anterior
  — a fatura de agosto/2026 cobre 26/06 a 26/07. A API lê a borda das próprias compras, pela mediana
  do dia da última compra das 24 faturas recentes (dia 26 na base de referência: 13× no 26, 9× no 25,
  2× no 23), e o erro nunca é positivo — nenhuma compra passa do dia inferido. Em troca, um ciclo que
  fechou dias antes do usual só é reconhecido como fechado no dia inferido. Com menos de três faturas
  de histórico não há o que inferir e o recorte cai no mês calendário, que é o que a tela fazia antes.
- Os testes cobrem as funções puras onde moram as regras — o parser de CSV, a montagem do filtro do
  Mongo, a detecção de assinatura, a comparação com o histórico, o agrupamento dos gráficos —, os
  serviços que escrevem, contra um **MongoDB de verdade em memória**
  ([como](#os-testes-que-precisam-de-banco)), e a **API HTTP inteira** — guard de sessão,
  `ValidationPipe`, injeção de dependência do Nest — subida contra o mesmo banco em memória
  ([como](#os-testes-que-sobem-a-api-inteira)). Continua havendo um smoke test no CI, de ponta a
  ponta contra uma instância real.
- A interface é **escura por padrão**, com alternador claro/escuro/sistema. Os tokens vivem em
  `apps/web/src/assets/globals.css`, no padrão CSS-first do Tailwind 4.

## Licença

MIT
