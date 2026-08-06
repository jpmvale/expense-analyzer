# Retomar aqui — handoff de sessão

> **Snapshot de 2026-08-06.** Documento vivo: atualizar quando o estado avançar.
> Serve para retomar em outra máquina ou em outra sessão — o conteúdo viaja pelo git,
> a memória local do Claude em `~/.claude` **não** viaja.
>
> O *quê* e o *porquê* do produto estão no [`README.md`](README.md), que é a fonte de
> verdade sobre regras, endpoints e limitações conhecidas. Este arquivo registra **onde
> o trabalho parou** e o que morde quem retoma.

---

## Estado atual

CI verde, árvore limpa.

| | |
| --- | --- |
| **Base de referência** | 95 faturas · 5.744 lançamentos · `2018-11` a `2026-09` · R$ 217.774,05 |
| **Testes** | 353 — api 224 (207 serviço + 17 HTTP/DI/isolamento), ingestion 51, categorization 35, web 43 |
| **Workspaces** | `apps/{api,web,extractor}` + `packages/{categorization,ingestion}` |
| **Telas** | Aterrissagem · Login/Cadastro · Conta · Visão geral · Compras · Faturas · Assinaturas · Sem categoria · Regras · Importar |
| **Fila de classificação** | 101 títulos em `outros` |
| **Assinaturas detectadas** | 17, 11 com nome formal, 6 ativas |
| **Regras** | 180 — 143 `exact`, 37 `contains` |
| **Autenticação** | sessão em cookie httpOnly, guardada no Mongo · contas na coleção `users` · cadastro por `INVITE_CODE` |
| **Isolamento** | `userId` em todas as seis coleções de dados, primeiro em todo índice; parâmetro obrigatório em todo método de serviço |
| **Sincronização** | botão no cabeçalho (`POST /sync`, só o dono) + `pnpm extract` + cron + `POST /import` — mesmo código, mesmo registro em `syncRuns` |

Subir o ambiente:

```bash
docker compose up -d   # MongoDB
pnpm dev               # API + front
```

---

## ✅ FEITO (2026-08-06) — aterrissagem pública na raiz

Quem recebia o link caía numa caixa de usuário e senha, sem uma palavra sobre o que o app é — e sem
saber que ele ia pedir os **CSVs das faturas**, que é a parte nada óbvia.

`/` saiu de dentro do `<RequireAuth>` e passou a decidir pelo visitante: apresentação para quem não
tem sessão, `/dashboard` para quem tem. Ninguém que já usa percebe diferença.

Duas coisas que o código explica e não são óbvias: a rota **não é `lazy()`** (é a primeira tela de
quem clica no link, e um spinner de bundle bem aí é o pior primeiro contato), e ela respeita o
`checking` do `useAuth` — sem isso a landing pisca na cara de quem só queria abrir o próprio painel.

O mock do painel é **SVG desenhado com os tokens do tema**, não uma captura: acompanha claro e
escuro sozinho e não puxa arquivo de fora. O texto embaixo diz que os números são de exemplo.

Falta fazer o mesmo em **coda** e **kindred**, um PR cada. No coda já ficou decidido: `/` vira
pública e decide pelo visitante (landing para anônimo, Explorar para quem tem sessão), sem mover
rota — hoje tudo lá exige login por `RN-021`, e `/` é a tela Explorar.

---

## ✅ FEITO (2026-08-06) — trocar e recuperar a senha

O multiusuário subiu e deixou um buraco na hora: **não havia como trocar de senha**. Mudar a de
alguém era gerar um hash na mão e editar o documento no Mongo — insustentável assim que a primeira
pessoa escolhe uma senha descartável no cadastro.

Duas portas, porque são dois problemas: `/conta` troca a senha de quem está logado (pedindo a
atual), e `/esqueci` manda um link por e-mail. As duas **derrubam as outras sessões da conta** e
poupam a de quem está trocando — sem isso, trocar a senha depois de ela vazar não expulsa ninguém.

**As decisões que o código explica por extenso:**

- O e-mail virou obrigatório no cadastro, mas é **opcional no schema**: as contas anteriores não têm
  nenhum, e exigi-lo quebraria toda gravação nelas — inclusive a da própria troca de senha. O índice
  é único **parcial**, senão as duas contas sem e-mail colidiriam entre si na subida.
- O banco guarda o **SHA-256** do token, nunca o token. SHA e não bcrypt: o token já é aleatório de
  alta entropia, não há dicionário para atacar, e o bcrypt trunca em 72 bytes.
- `forgot-password` responde **204 sempre**. Qualquer diferença entre e-mail conhecido e desconhecido
  vira um oráculo de quem tem conta aqui.
- Sem `RESEND_API_KEY`, o `MailerService` **loga o link em vez de mandar**. É o que torna o fluxo
  inteiro exercitável em desenvolvimento — e é assim que o `http.itest.ts` o percorre, interceptando
  o envio para ler o token, que não existe em lugar nenhum do banco.
- A queda das sessões conhece o formato do `connect-mongo` (JSON no campo `session`) e o comentário
  em `session-store.ts` diz isso. A alternativa — `passwordChangedAt` conferido pelo guard — cobraria
  uma consulta por requisição em todas as rotas para algo que acontece uma vez por ano.

**Armadilha que custou um teste vermelho:** com `timestamps` no schema, o Mongoose **descarta
`createdAt` de um `$set`** em silêncio. O update responde "ok", o campo não muda, e o teste falha
adiante por um motivo sem relação. Envelhecer um documento em teste pede o driver cru
(`Model.collection.updateMany`).

**Em produção:** o `docker-compose.prod.yml` monta `/home/deploy/.config/alerta.env` no serviço
`api` — a mesma chave do Resend que os alertas de cron já usam, num lugar só. As contas que existem
hoje precisam de `set-email` para poderem recuperar a senha.

---

## ✅ FEITO (2026-08-06) — multiusuário, cadastro por convite e importação de CSV

O app era de um usuário só, e isso estava no **código**, não na configuração: as credenciais moravam
em `AUTH_USERNAME`/`AUTH_PASSWORD_HASH`, a sessão guardava o nome, e **nenhum documento tinha dono**.
Uma segunda conta veria — e reclassificaria — as compras da primeira.

**Como o isolamento foi feito, e por que assim.** Uma coleção `users` nova, e `userId` (o `_id` dela)
em todas as seis coleções de dados. O dono é **parâmetro obrigatório** de todo método de serviço, em
vez de estado ambiente que o serviço consultasse sozinho: com ele na assinatura, o compilador cobra
quem esquecer — e "esquecer o dono" aqui não é um bug discreto, é devolver as compras de outra
pessoa com status 200. Nos pacotes `categorization` e `ingestion` nada mudou: o corte fica nos
stores, que já nascem presos a um `userId`.

**O que fica de armadilha para quem retomar:**

1. **Sem rodar a migração, a app abre vazia.** `pnpm --filter @expense/api migrate:multiuser` cria a
   conta dona a partir do `AUTH_USERNAME`/`AUTH_PASSWORD_HASH` que já estão no `.env` (o login não
   muda) e carimba `userId` no que existe. Um documento sem dono não aparece para ninguém, e o
   sintoma é uma base vazia com os oito anos intactos no banco. **Rodar na VPS junto do deploy.**
2. **`INVITE_CODE` é obrigatório** — a API não sobe sem ele. `.env.prod` da VPS precisa dele e de
   `OWNER_USERNAME`.
3. **Os índices únicos globais precisam morrer.** `categories.name_1`, `subscriptions.key_1`,
   `categoryRules.kind_1_value_1` e `consolidationDismissals.category_1_value_1` recusariam do
   segundo usuário a categoria que o primeiro já tem. O Mongoose cria os compostos sozinho mas
   **nunca remove** um índice que deixou de ser declarado — quem derruba é a migração.
4. **`findById` virou `findOne({ _id, userId })`** em `category.service.ts`. Com o id na URL, buscar
   só pelo `_id` deixaria um usuário editar e apagar a regra de outro, respondendo 200.

**O teste que sustenta tudo isso** está em `http.itest.ts`: duas contas escrevendo na mesma base, e
cada rota conferida contra o que a vizinha gravou. Vazamento entre contas não tem sintoma — formato
certo, status certo, números plausíveis de outra pessoa —, então revisão não pega e teste de serviço
não pega (cada um roda com um usuário só).

**A importação de CSV (`POST /import`)** é a entrada de faturas de quem não é o dono. Não é um
segundo pipeline: os arquivos viram `Bill[]` pelo mesmo `billsFromCsvFiles` que a fonte `local` usa
e vão para o mesmo `ingestBills` do Drive — daí vêm de graça a idempotência por mês e a reaplicação
das regras. É síncrono (o 202 do `/sync` existia por causa do minuto de viagem ao Drive) e grava um
`syncRun` com `trigger: 'upload'`. O mês sai do nome do arquivo e, quando ele não traz `AAAA-MM`, das
**datas de dentro** — o mês majoritário, porque toda fatura tem compras do fim do mês anterior. Essa
inferência é só do upload: no disco e no Drive, um CSV que não é fatura viraria mês inventado por
cima de um mês bom.

---

## ✅ FEITO (2026-08-04) — pedir o resync pela tela

A pergunta que abriu a sessão: *"baixei mais duas faturas e coloquei no Drive — em que momento a
aplicação vai lê-las?"*. A resposta era **nunca**: a ingestão era um comando de terminal, e a app
não tinha como pedir nem como dizer que estava desatualizada — uma base parada e uma base em dia
eram visualmente idênticas.

**O que mudou de arquitetura.** O container da API não tinha o código do extractor nem os segredos
do Drive, então "botão" não era fiação de UI. A leitura das faturas e a ordem das operações de uma
ingestão saíram do extractor para `packages/ingestion`, com **config e log injetados** em vez de
lidos de um módulo global — a API lê ambiente pelo `ConfigService` e o extractor por `dotenv`, e um
`config` que lesse o `.env` na carga passaria por cima do `ConfigModule`, que só resolve depois. O
banco fica fora do pacote, atrás de `BillStore`: driver cru no extractor, Mongoose na API. O
extractor virou casca — `.env`, conexão, saída no console, código de saída.

`POST /sync` responde **202** e roda em segundo plano (95 faturas passam de um minuto; segurar a
conexão entregaria a decisão a um timeout do Caddy), **409** se já houver uma rodando. `GET /sync`
devolve o estado e a última execução, e a tela pergunta de 2 em 2 segundos **só enquanto roda**.

**As três armadilhas que custaram atenção.**

1. **O consentimento do Google não pode acontecer na API.** O `@google-cloud/local-auth` sobe um
   servidor local e abre o navegador do host — num container isso não abre nada, e a requisição
   ficaria pendurada até o timeout sem dizer por quê. Daí `allowInteractiveAuth`, falso na API:
   sem `token.json`, erro na hora, com o texto mandando rodar `pnpm extract` numa máquina com
   navegador. Quem cria o token continua sendo o comando de terminal; a API só lê.
2. **O `running` precisa de prazo de validade.** É ele que barra a segunda ingestão, então um
   container derrubado no meio deixaria o botão travado para sempre. Passados 30 min ele é dado
   como interrompido na próxima leitura — carimbado na leitura, não por job de limpeza, porque é o
   único momento em que alguém se importa com aquele estado.
3. **O extractor grava em `syncRuns` também.** Sem isso, a extração do cron das 07:00 não deixaria
   rastro e a tela mostraria "nunca sincronizado" logo depois de a base ter sido atualizada.

**O que ficou de fora, e por quê.** A tela não recarrega sozinha no fim: as telas guardam o próprio
estado, e recarregar no meio de *Sem categoria* jogaria fora a regra que a pessoa estava montando —
o popover oferece "Atualizar a tela" e espera o clique. E nada observa a fonte: sem webhook do Drive
e sem varredura de dentro da API, o agendamento continua no sistema operacional da VPS.

Detalhes em [`README.md`](README.md#quando-as-faturas-novas-entram).

---

## ✅ FEITO (2026-07-29) — testes de controller e injeção de dependência (`c754a9f`)

A última pendência de Técnico. Os testes de serviço instanciam a classe direto pelo construtor —
provam a decisão e a escrita, mas pulam o Nest inteiro: container de injeção, guard de sessão,
`ValidationPipe`. Depois de `98370b2` (autenticação) isso deixou de ser um gap teórico — é
exatamente o tipo de fiação (DI, guard, decorator) que aquela mudança introduziu.

`apps/api/src/http.itest.ts` sobe o `AppModule` de verdade via `Test.createTestingModule`, contra
`mongodb-memory-server`, com credenciais de teste geradas na hora, e bate nas rotas por HTTP com
`supertest`. 11 testes: guard bloqueando sem sessão e liberando `@Public()`; login e logout
abrindo/fechando sessão de verdade; `ValidationPipe` rejeitando corpo incompleto e campo
desconhecido; resolução de cada controller principal pelo container do Nest.

**O obstáculo real.** `tsx` (esbuild) não emite `emitDecoratorMetadata` — o Nest recebe `undefined`
em todo construtor injetado por tipo, silenciosamente, e cada serviço quebra chamando método em
cima disso. Os 193 testes de serviço nunca esbarraram nisso porque pulam exatamente essa reflexão.
Resolvido rodando este arquivo sob `ts-node` (`pnpm test:http`, separado do glob de `.test.ts`) —
o que expôs um segundo problema do mesmo tsconfig (sem `esModuleInterop`): `import x from
'supertest'`/`'node:assert/strict'` compila para `.default`, que nenhum dos dois tem sob `ts-node`.
Resolvido com `import x = require(...)`. Também precisei fechar a conexão própria do
`connect-mongo` no `stop()` do harness (senão o processo nunca saía) e excluir `**/*.itest.ts` de
`tsconfig.build.json` (senão o `dist` de produção arrastava `mongodb-memory-server`, uma
devDependency).

Detalhes em [`README.md`](README.md#os-testes-que-sobem-a-api-inteira).

---

## ✅ FEITO (2026-07-28) — destino de regra editável, e criação manual pelo trecho

Os dois furos da pendência abaixo fecharam sem rota nova: `upsertRule` já fazia upsert por
`(kind, value)` — mandar o mesmo par com categoria diferente edita em vez de duplicar. Faltava só o
front usar isso.

Na lista, o destino da regra virou um `CategoryPicker` clicável, mesmo raciocínio da categoria
clicável na tabela de Compras — a correção fica onde o erro é notado. E um formulário novo no topo da
tela (`NewRuleForm`) deixa digitar um trecho do zero, com o mesmo padrão de `UncategorizedList`:
escolher a categoria já submete, sem botão de salvar separado.

O que continua faltando, e por quê: mudar o **trecho** ou o **tipo** de uma regra que já existe ainda
é apagar e criar de novo. Editar esses dois campos exigiria decidir o que fazer com as compras que a
forma antiga da regra já classificou — não é a mesma operação simples de trocar destino, e não estava
no escopo desta pendência.

Verificado contra a base real, e não contra fixture: criei `TESTE-CLAUDE-VERIFICACAO` (`contains` →
`restaurante`), confirmei por `curl` que gravou com `_id` próprio, editei o destino para `serviços` e
confirmei que o **mesmo `_id`** mudou de categoria — não duplicou —, apaguei pela tela e confirmei que
a base voltou a 244 regras sem sobra. Console sem erro nos três passos; mobile sem overflow horizontal
no formulário novo.

---

## ✅ FEITO (2026-07-29) — parcela futura marcada na tabela de Compras

Última do bloco de Interface. Quatro (hoje, três — o número muda conforme faturas fecham) parcelas
já lançadas em faturas futuras apareciam no topo da tabela, porque a ordenação padrão é por data
decrescente e são as datas mais recentes que existem — mesmo sem terem acontecido. O registro é
legítimo e a ordenação continua certa; o problema era só a linha não dizer por quê.

Decidi **não mexer na ordenação** para resolver isso. O `/purchase` server-side (item de escala de
uma sessão anterior) foi construído e testado com cuidado, e a única forma de demover essas linhas
sem escondê-las seria trocar `.find().sort()` por uma agregação com chave de ordenação computada —
risco desproporcional para um ganho que hoje afeta três linhas. Em vez disso, `isFutureDate` (nova, em
`lib/utils.ts`) marca a linha com um badge "futura" ao lado da data, no desktop e no mobile: resolve o
"parece a compra mais recente, mas não é" sem tocar em nada que já funcionava.

Verificado num harness isolado (mesmo truque de sempre — HTML solto em `apps/web/public/`, removido
depois): o badge não quebra a linha em `whitespace-nowrap`, cabe nas duas visões. 3 testes novos para
`isFutureDate`.

---

## ✅ FEITO (2026-07-28) — cabeçalho da tabela de Compras não some mais ao rolar

Uma tentativa anterior tinha ficado parada porque prendia o `top` do cabeçalho à altura da barra de
filtros — frágil, porque essa altura muda com o que está acima na página (cartões, gráficos que
aparecem e somem conforme o filtro), e cada mudança ali quebraria o cabeçalho de novo.

O desenho que não depende de nada externo: em vez de grudar o cabeçalho no topo da **página**,
limitei a altura da própria tabela (`max-h-[65vh]`) e deixei só o que está **dentro** dela rolar
(`overflow-y-auto`). O `<thead>` fica `sticky top-0` relativo a essa caixa, não ao scroll da página —
então não importa o que muda acima: a tabela nunca soube da barra de filtros, e não precisa saber
agora. A paginação fica fora da caixa, em fluxo normal, e ganhou de brinde o mesmo benefício: nunca
mais some rolando.

Verificado num harness isolado (HTML solto, sem tocar no app autenticado — [por quê](#armadilhas-de-ambiente)),
com a mesma estrutura e as cores reais do tema: o gesto de scroll com o mouse sobre a tabela move só
`wrapper.scrollTop`, `window.scrollY` fica em zero; a página só se move quando o scroll acontece fora
da tabela; a paginação aparece ao rolar a página, sempre alcançável. Não vi a tela real — só o
mecanismo, isolado — pelo mesmo motivo de sempre: sem senha, sem login.

---

## ✅ FEITO (2026-07-28) — sufixo comum na consolidação, e exceção rápida por conflito

As duas últimas pendências de Produto. Medi contra a base real antes de decidir o desenho —
conectando direto no Mongo, sem passar pela API (que agora exige sessão que eu não tenho).

**Sufixo comum.** `candidatePrefixes` virou `candidateSubstrings`: o candidato não precisa mais
começar no início do título, qualquer palavra cortada em fronteira entra na busca. Na base real isso
achou três consolidações **seguras** que o prefixo sozinho nunca veria — `melimais` (`Mp *Melimais`,
`Ec *Melimais`, `Ec*Melimais`, três gateways diferentes para o mesmo serviço), `pizza` e `zoo `.

**Conflito não binário.** Quando a lista de conflitos está expandida, um segundo botão —
"Manter exceções e aplicar" — cria uma regra `exact` para cada título de `conflicts`, na categoria em
que já está, antes do trecho entrar. `exact` ganha de `contains` na escada, e é isso que preserva a
exceção sem abrir mão do resto da consolidação.

**O que a medição ensinou.** As três sugestões bloqueadas hoje têm 2, 6 e 7 conflitos — não perto do
extremo de 22 do exemplo histórico do Shopee. Olhei os títulos, não só a contagem: o caso de 2
conflitos (`transporte` × `park`, contra "Pastel Dupark" e "Casa Jardim Food Park") é um falso
positivo óbvio — ninguém ia querer aqueles dois em transporte. Já os de 6 e 7 (`pizza` contra
pizzarias hoje em `supermercado`; `posto ` contra postos hoje em `transporte`) são ambíguos de
verdade — o dono pode preferir reclassificar em vez de manter. Por isso o botão de exceção não tem
limiar de "poucos o bastante para eu decidir por você": ele fica disponível para qualquer contagem,
sempre atrás do mesmo portão de consentimento informado do "aplicar mesmo assim" — expandir a lista
primeiro —, com um teto de segurança em 15 (circuit breaker contra criar dezenas de regras num clique,
não um julgamento de UX).

Verificado: 13 testes em `rule-consolidation.test.ts` (2 novos, 11 preexistentes confirmando que o
generalizar não quebrou nada — o caso `start=0` reduz matematicamente ao algoritmo antigo) e 4 novos
em `category.service.test.ts` para `exceptions`, todos contra Mongo real em memória. Reconstruí a API
e confirmei a rota nova viva por `curl`: `401` num `id` válido vs `404` numa rota inexistente, prova
de que o guard está ativo e a rota está registrada — não pude ir além disso, porque logar pela tela
pede a senha em texto, que só existe com o dono.

---

## ✅ FEITO (2026-07-28) — destino, trecho e tipo de regra editáveis, pelo `id`

O commit anterior deixou o destino editável, reaproveitando o upsert por `(kind, value)` do
`POST /category-rule`. Mas esse upsert não serve para editar o próprio `value`: mandar um valor novo
não move a regra, cria uma segunda e deixa a antiga órfã. Faltava localizar por algo que não muda
quando o conteúdo muda — o `_id`.

`PATCH /category-rule/:id` faz isso: acha a regra pelo id, recusa se o novo par `(kind, value)`
colidir com outra regra já existente, atualiza os três campos e reaplica uma vez. As compras que a
forma antiga governava não ficam soltas — a reaplicação resolve exatamente como resolve quando a
regra é apagada: quem a nova forma não alcança mais volta para `sourceCategory` ou passa a obedecer
outra regra que já existia.

Na tela, um ícone de lápis abre um modo de edição inline na própria linha — badge de tipo clicável
igual ao `NewRuleForm`, campo de texto para o trecho, Salvar/Cancelar. Fica separado do `CategoryPicker`
do destino de propósito: misturar os dois faria corrigir um erro de digitação exigir escolher
categoria de novo.

Verificado: 7 testes novos em `category.service.test.ts` (mudar trecho, mudar tipo, a compra que sai
da forma antiga volta pra fatura, recusa de colisão, id inexistente, categoria reservada), todos
passando contra Mongo real em memória. Mesma limitação da entrada acima: sem senha para logar, não
cliquei pela tela — confirmei a rota viva por `curl` depois de reconstruir e reiniciar a API.

---

## ✅ FEITO (2026-07-28) — rota de avisos de reajuste, sem canal embutido (`aae3bcf`)

`GET /purchase/price-alerts` devolve os mesmos degraus do cartão "Mudou de preço" da Visão geral, para
quem quer perguntar sem abrir a tela — um cron pessoal, um atalho de celular. A lógica é a mesma de
`apps/web/src/lib/priceChanges.ts`, portada para o backend porque antes só existia no cliente. A API
não manda nada sozinha, só responde "o que mudou" — resolve a metade que dava para resolver da
pendência "aviso de reajuste não sai da tela"; a outra metade (push, e-mail) segue não construída, e
com razão: infraestrutura desproporcional para um app de um usuário só.

*(Entrada escrita agora, retroativa — o commit não veio com uma entrada de HANDOFF na hora.)*

---

## ✅ FEITO (2026-07-28) — autenticação com sessão, guard global na API (`98370b2`)

App pessoal, um usuário só, sem tela de cadastro. Sessão em cookie httpOnly, guardada no Mongo via
`connect-mongo` — não em memória, porque a API sobe com `nest start --watch` e cada save reinicia o
processo, o que derrubaria uma sessão guardada em RAM. Um guard global exige sessão em toda rota,
exceto `/auth/login`, `/auth/session` e `/health`.

Senha nunca em texto puro: só o hash bcrypt vai pro `.env`, gerado por
`pnpm --filter @expense/api hash-password`. Front ganha tela de login, `AuthProvider` que checa a
sessão uma vez ao montar, guarda de rota que lembra de onde veio, botão de sair no header.

**O que isso muda para quem retoma em outra sessão:** a API só responde a quem tem cookie de sessão
válido. `.env` guarda `AUTH_PASSWORD_HASH` — um hash, não a senha —, então não há como logar sem que
o dono digite a senha real. Verificação de UI por clique fica bloqueada até isso acontecer; a saída é
verificar pela camada de serviço (`mongodb-memory-server`, que não passa pelo guard) e, quando for só
leitura, medir direto no Mongo, contornando a API inteira.

*(Entrada escrita agora, retroativa — o commit não veio com uma entrada de HANDOFF na hora.)*

---

## ✅ FEITO (2026-07-28) — descartar/aplicar sugestão de consolidação, e reaplicar pela tela (`fa604c8`)

A bloqueada sempre pôde ser aplicada pela API — só a tela escondia o botão. Ele passou a morar dentro
da lista de conflitos expandida, para só aparecer depois de ver o preço. Descartar guarda a decisão
por `(categoria, trecho)` — sem esconder da API, só marcando `dismissed: true` — e a tela encolhe as
descartadas num rodapé com "restaurar".

`POST /category-rule/reapply` já existia; faltava um jeito de chamá-lo sem `curl`. O botão fica no
cabeçalho da tela de Regras, com o mesmo resumo que o comando de linha já mostra — resolve a
pendência "não há tela para o reapply".

*(Entrada escrita agora, retroativa — o commit não veio com uma entrada de HANDOFF na hora, e o README
também ficou com um bullet velho em "Estado atual" dizendo que a tela não existia; corrigido junto.)*

---

## ✅ FEITO (2026-07-28) — cartão "Mudou de preço" na Visão geral

A pendência logo abaixo dizia que o alerta hoje renderia um cartão de uma linha só — sinal fraco
demais para justificar construir agora. Construído do mesmo jeito: o sinal de hoje não é o sinal de
sempre, o cartão lê `/purchase/recurring`, que já existe, e a regra que o mantém quieto na maioria
dos dias é a mesma que evita alarme falso em qualquer lugar deste projeto — ele some quando não há
nada a dizer, em vez de aparecer todo dia e deixar de ser aviso.

A régua é os **três ciclos fechados mais recentes**, e não um número de meses: a fronteira usa o fim
do ciclo anterior à janela, para os três entrarem inteiros em vez de o mais antigo entrar pela
metade — o mesmo cuidado com `cycleEnd` de `13e2940`. Sem histórico para recuar três ciclos, a janela
vira "tudo o que existe", para uma base nova não começar com o alerta calado por falta de dado. A
ordem é pela mordida anual — `(atual − anterior) × 12` —, não pela data: é o número que decide se
vale olhar, o mesmo raciocínio do `yearlyIncrease` da tela de Assinaturas.

Verificado na tela contra a base real: o cartão mostra exatamente a linha que a pendência media à
mão — Barbearia Sr Jhon, R$ 79,99 → R$ 86,99, +8,8%, +R$ 84,00/ano — e some das outras cinco
assinaturas ativas, que não tiveram degrau na janela. O link "Ver a escada de preços de todas" resolve
para `/recurring`, e o console não acusou erro.

Isto não é um alerta de verdade — não há push nem e-mail, só um cartão a mais na tela que já se abre
primeiro. Fica registrado no README como a distinção que é.

---

## ✅ FEITO (2026-07-28) — tela de Regras, com consolidação

As 255 regras não tinham superfície nenhuma. A tela lista, filtra por categoria e por trecho, mostra
quantas compras cada regra **governa** — não quantas ela casa, que é diferente e maior — e apaga.

O que ela tem de próprio é o painel de consolidação: onde um punhado de regras `exact` viraria uma
`contains`. `POST /category-rule/consolidate` faz a troca com **uma** reaplicação; pela API de regras
seriam um `POST` e cinquenta `DELETE`, cada um varrendo a base.

**A descoberta que mudou o desenho.** Eu tinha proposto a tela dizendo que `contains "shopee"`
substituiria ~52 regras. Contei regras por categoria sem checar o que o trecho mais alcançaria: dos
86 títulos com "shopee", **22 estão deliberadamente em outras categorias** — `vestuário`, `saúde`,
`eletrônicos`, `estorno`, `supermercado` —, porque a Shopee é marketplace e a classificação segue o
que foi comprado. Nenhum dos 22 tem regra própria, então a `contains` os engoliria em silêncio.

Por isso a sugestão bloqueada é devolvida junto da segura, com o que ela levaria junto. O critério e
os três casos em que ele falha estão em [README](README.md#onde-dá-para-juntar-regras).

Verificado na tela contra uma cópia da base: consolidar Amazon trocou 6 regras por 1 com **0 compras
reclassificadas**, e a distribuição por categoria ficou idêntica à do banco real, categoria por
categoria. Apagar uma regra devolveu 1 compra à categoria da fatura.

---

## ✅ FEITO (2026-07-28) — porta ocupada falha em vez de escapar (`495c69a`)

`strictPort: false` deixava o Vite escolher outra porta sozinho, e isso **já produziu um
erro difícil de ver**: um segundo `pnpm dev` subiu na 5174 enquanto a 5173 continuava
servida pela árvore anterior, e as verificações seguintes foram feitas contra um processo
que não era o que se tinha acabado de iniciar. Nada falha nesse cenário — a tela abre, a
API responde, e o que se testa é outro servidor.

Agora falha com `Error: Port 5173 is already in use` e exit 1. Verificado com a porta
ocupada de verdade; o ocupante era o Vite do **kindred**, outro projeto na mesma máquina —
exatamente o cenário em que o fallback silencioso mais engana.

Havia um `autoPort: false` no `.claude/launch.json`, sem commit, tentando resolver o mesmo
problema. **Foi removido:** não é chave suportada (o schema aceita `name`,
`runtimeExecutable`, `runtimeArgs`, `port`, `url`), então seria ignorada — e um arquivo que
parece proteger sem proteger é pior que nada.

Junto, duas correções de documentação: a nota de porta ocupada passou a cobrir a 5173, e o
bullet do reapply no "Estado atual" do README ainda dizia que a rota só podia ser chamada
por `curl`, de antes de o `pnpm reapply` existir.

---

## ✅ FEITO (2026-07-27 → 28) — o salto de produto

Treze commits que transformaram o projeto de "dashboard de faturas" em algo que responde
o que o app do banco não responde. Cada commit tem o raciocínio completo na mensagem;
aqui fica só o mapa.

| Commit | O que entrou |
| --- | --- |
| `9cad64e` | Paginação, ordenação e agregação de `/purchase` **no servidor** |
| `e751c9d` | 50 testes dos serviços que escrevem, contra um MongoDB real em memória |
| `3e9df71` | `pnpm reapply` — corrige encargo sem reextrair |
| `ab643c7` | Nome formal da assinatura + gráfico da evolução do preço |
| `edc2c80` | Reaplicação redecide a camada de encargo, nos dois sentidos |
| `5d5283a` | Corte do "Fora do normal" recalibrado para 2,25; `outros` fora da comparação |
| `13e2940` | Fatura fechada recortada pelo **fim do ciclo**, inferido pela mediana |
| `4293bed` | "Fora do normal": cada categoria contra o próprio histórico |
| `8b00cee` | Detecção de cobrança recorrente + escada de preços |
| `68a20b3` | **Encargo deixa de contar como gasto** — total caiu para R$ 217.774,05 |
| `15f8e7b` | Classificação pelo usuário, preservada no reprocessamento |

Três coisas que valem ser lembradas por quem for mexer:

**`sourceCategory` é o que torna a classificação reversível.** É a categoria que a ingestão
resolveu antes de qualquer regra do usuário; apagar uma regra devolve as compras a ela. Sem
o original guardado ao lado, reaplicar deixaria de ser idempotente.

**A escada de precedência mora em `packages/categorization`**, e não no parser. Ela precisa
acontecer igual na API e no extractor — duas implementações da mesma regra divergiriam com o
sintoma aparecendo meses depois, como uma categoria que muda sozinha ao reprocessar.

**`referenceMonth` é o mês do *vencimento*, não o do consumo.** A fatura de agosto/2026 cobre
26/06 a 26/07. Confundir os dois foi a causa de um bug real (`13e2940`), em que a Visão geral
atrasava um ciclo inteiro.

---

## ✅ FEITO (2026-07-26 → 27) — rename, os 7 bugs, dados reais e a interface

Sessão anterior, do estado inicial até a migração de UI. Resumo, porque o detalhe está nos
commits:

- **`aee2555`** renomeou o projeto de `nubank-credit-card-analysis` para `expense-analyzer`.
  O nome antigo carregava a marca de um banco sem que houvesse uma linha de código específica
  dele — o parser lê CSV genérico e não toca em API nenhuma do emissor.
- **Sete bugs** corrigidos, com testes de regressão: três de fuso horário (filtro da API,
  gráfico, e o rótulo "Fatura" que filtrava por data da compra), vazamento de `payment` no
  filtro de categoria, `frequency` contando o pagamento, estornos discordando entre os dois
  endpoints, e colunas hardcoded na tela de Faturas.
- **Dados reais** do Google Drive: 95 faturas, 2018 a 2026. No caminho, dois bugs de ingestão
  — a Drive API devolve a lixeira por padrão, e **55 lançamentos em formato brasileiro**
  (`"- 2.944,60"`) eram descartados em silêncio pelo `parseFloat`.
- **Categorização recuperada**: o emissor parou de classificar em julho de 2024, e `outros`
  saltou de 4% para 90%. Tratar `outros` como ausência de categoria religou a herança por
  título, que estava desligada por um `||`.
- **Migração de MUI para shadcn/ui** em 7 etapas, com tema escuro e as três telas redesenhadas.

---

## Pendências

Nada em andamento. O que está aberto, em ordem de valor aparente:

**Produto**

- **Não há administração de contas.** Nem tela, nem rota: listar, renomear, apagar usuário ou trocar
  de senha se faz no banco. O `INVITE_CODE` é único e não expira — revogá-lo é trocar a variável e
  reiniciar a API, o que não derruba quem já entrou. Suficiente para um punhado de pessoas
  conhecidas, e é esse o recorte de hoje.
- **O aviso de reajuste tem rota, mas nenhum canal chega sozinho.** `GET /purchase/price-alerts`
  responde sob pedido; não há push, e-mail nem nada que avise sem alguém perguntar. Deliberado —
  construir isso agora seria infraestrutura desproporcional para um app de um usuário só.
- **101 títulos ainda em `outros`.** A fila encolhe classificando pela tela de Sem categoria;
  a cauda é de títulos de ocorrência única, onde regra não pega.
- **A sincronização não avisa quando termina.** Quem clica e troca de aba não recebe nada; o
  resultado espera no popover. Mesma decisão do aviso de reajuste, e pelo mesmo motivo.

**Técnico**

- **A infra compartilhada da VPS continua fora do repositório.** Os dois jobs deste projeto — o
  backup do Mongo às 06:00 e a extração às 07:00 — foram versionados em [`infra/`](infra/README.md),
  com um instalador que gerencia só um bloco marcado do crontab. Mas eles dependem de
  `~/bin/com-alerta.sh` (log + e-mail via Resend), `~/bin/enviar-r2.sh` (backup para o R2) e
  `~/bin/deploy.sh` (alvo do forced command), que servem também `coda` e `kindred` e vivem **só** na
  VPS. Versioná-los aqui poria a infra de outros projetos num repositório público onde ninguém que
  mexe neles iria procurar; o lugar certo é um repo de infra próprio. Enquanto ele não existe,
  recriar a máquina do zero ainda depende de reescrever esses três de memória.

O aviso de **chunk acima de 500 kB** que estava anotado aqui não reproduz
mais — build limpo, sem cache, conferido em 2026-07-29: o maior chunk (`index`) está em 423 kB e o
do Recharts (`BarChart`, já separado por causa do `lazy()` por rota em `pages/lazy.tsx`) em 365 kB,
os dois abaixo do limite padrão do Vite. Não houve mudança de código para isso — ou o bundle já
tinha encolhido o bastante desde que a nota foi escrita, ou o `lazy()` por rota (que já existia)
sempre tivesse sido suficiente e a entrada ficou desatualizada.

---

## Armadilhas de ambiente

Coisas que já custaram tempo nesta base.

**O Drive aceita dois arquivos com o mesmo nome, e o mês perdedor some sem deixar buraco.**
Aconteceu de verdade: em 2026-08-05 havia quatro arquivos em dois pares de nome idêntico —
`Nubank_2026-08-03.csv` e `Nubank_2026-09-03.csv`, cada um em duas versões (27/07 e 03/08). Como
cada fatura apaga o mês de referência antes de gravar, só o último lido sobrevive, e em setembro
**o antigo ganhou**: a extração das 07:00 gravou `2026-09: 27 compras` e logo depois
`2026-09: 4 compras`, deixando a produção com 4 lançamentos e R$ 512,10 num mês que tinha 27.

O que torna isso traiçoeiro é não parecer defeito: o mês existe, a soma fecha com o que está lá, e
nenhuma tela mostra "faltam 23 compras". O `warnDuplicateMonths` avisa desde antes — o aviso estava
no log —, mas ninguém lê `~/backups/extractor.log` num dia em que o job termina com sucesso. Depois
de `6f05e11` esses avisos aparecem no popover do botão Sincronizar, que é onde alguém olha.

Ao investigar um mês com número estranho, o primeiro lugar é o log da extração, não o banco:

```bash
ssh vps 'grep -n "Atenção\|Ignorando" ~/backups/extractor.log'
```

A correção é sempre no Drive (apagar a versão velha), nunca no banco: a próxima extração regrava o
mês inteiro e desfaria qualquer conserto feito à mão em `purchases`.

**E não escolha a versão pelo tamanho: uma fatura baixada logo depois do fechamento vem inchada.**
Este é o detalhe que quase fez a limpeza parecer um estrago. Feitas as contas depois de apagar as
versões de 27/07, agosto **encolheu** de 106 para 96 lançamentos — o arquivo mais velho era o maior,
e à primeira vista parecia que apagar o errado tinha custado dez compras. Não tinha:

```
2026-08:  26/06 → 26/07   ciclo fechado, completo
2026-09:  27/07 → 03/08   ciclo em aberto, até o dia do download
```

O arquivo de agosto de 27/07 foi baixado **um dia depois de o ciclo fechar** (a borda é 26→26) e
ainda trazia dez lançamentos posteriores a 26/07, que o emissor mostrava na fatura corrente e que
pertencem a setembro. O de 03/08 já os tinha movido para o lugar certo. A conta fecha: −10 em
agosto, +23 em setembro, +13 no total da base.

A regra prática, então: **a versão mais recente sempre ganha**, mesmo quando é a menor. E um mês que
encolhe depois de apagar uma duplicata não é perda — antes de concluir isso, confira as bordas do
ciclo com uma consulta no `referenceMonth`, que é onde a resposta aparece em duas linhas.

**A API exige login desde `98370b2`, e você não vai ter a senha.** `.env` guarda
`AUTH_PASSWORD_HASH` — um hash bcrypt, não reversível — não a senha em texto. Verificar uma feature
clicando pela tela, ou por `curl` contra uma rota protegida, fica bloqueado até o dono digitar a
senha. Três saídas que não dependem disso: testes de serviço contra `mongodb-memory-server` (não
passam pelo guard, porque instanciam o serviço direto, sem o Nest); `apps/api/src/http.itest.ts`,
que sobe a API inteira contra Mongo em memória com credenciais de teste geradas na hora — esse
exercita o guard de verdade; e, para leitura, conectar direto no Mongo real com
`mongoose.connect(MONGO_URI)` — contorna a API inteira, então só serve para medir, nunca para
escrever.

Há uma quarta, e é a única que permite **clicar pela tela**: subir um ambiente descartável ao lado do
real, com credenciais próprias. Um `AUTH_PASSWORD_HASH` gerado na hora com
`pnpm --filter @expense/api hash-password`, `MONGO_URI` apontando para um banco de rascunho —
`.../sync-verify`, nunca `credit-card` — e uma entrada temporária em `.claude/launch.json` com
`runtimeExecutable: "env"` para injetar tudo isso antes do `pnpm --filter @expense/api dev`. Foi
assim que o botão de sincronizar foi verificado ponta a ponta em 2026-08-04, incluindo o 409 e a
sobrevivência das regras à regravação, sem encostar na base real. Ao terminar: derrubar os servidores,
apagar a entrada do `launch.json` e `db.getSiblingDB("sync-verify").dropDatabase()`.

**`.test.ts` roda em `tsx`, `.itest.ts` roda em `ts-node` — e não é intercambiável.** `tsx`
transpila com esbuild, que não emite `emitDecoratorMetadata`: qualquer teste que suba o Nest de
verdade (`Test.createTestingModule`) recebe `undefined` em todo construtor injetado por tipo, sem
aviso — cada serviço quebra tentando chamar método de `undefined`. Os 193 testes de serviço nunca
esbarraram nisso porque instanciam a classe direto. Um teste novo que precise do container do Nest
(DI, guard, `ValidationPipe`) vai para `src/*.itest.ts` e roda via `pnpm test:http`
(`ts-node/register/transpile-only`), não via `pnpm test`'s glob de `.test.ts`. Efeito colateral do
mesmo tsconfig sem `esModuleInterop`: `import x from 'supertest'` (ou de `node:assert/strict`)
compila para `.default`, que nenhum dos dois tem — use `import x = require('...')`.

**Use `pnpm` direto, nunca `corepack pnpm`.** O `packageManager` está fixado em 10.15.0;
chamado por corepack, um pnpm 11 instalado na máquina se recusa a trocar de versão e os
scripts com `--filter` quebram com `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`. O guia do projeto
`coda`, no mesmo workspace, manda o oposto — a expectativa que se traz de lá falha aqui.

**`TaskStop` não derruba a árvore do `pnpm dev`.** Ele mata o processo criado, mas turbo,
vite e nest seguem vivos. Já produziu duas árvores simultâneas disputando porta, com 18
horas de diferença entre elas. Para derrubar de verdade, mate o grupo de processos:

```bash
for raiz in $(pgrep -f "pnpm dev"); do
  kill -TERM -$(ps -o pgid= -p $raiz | tr -d ' ')
done
```

**Rode a suíte sem `.env` antes de commitar.** O CI não tem `.env` e o job de build não define
`MONGO_URI`; um teste que importe um módulo tocando `config.ts` passa aqui e quebra lá — já
aconteceu, e deixou a `main` vermelha.

```bash
mv .env .env.bak && pnpm test; mv .env.bak .env
```

**Confira a saída inteira do lint, não as duas últimas linhas.** `pnpm lint | tail -2` mostra
só o tempo de execução e esconde warnings. Um aviso de fast-refresh passou batido assim.

**Teste de data precisa fixar fuso.** A suíte roda com `TZ=America/Sao_Paulo` de propósito: em
UTC, `new Date(2025, 2, 1)` e `Date.UTC(2025, 2, 1)` coincidem, e os testes de regressão de
fuso passariam com o bug de volta.

**A automação de browser não aciona componentes Radix.** Eles exigem eventos de ponteiro que o
clique sintético não dispara; a verificação de menus e selects aqui é por DOM, não por clique
real. Tooltip do Recharts também não renderiza sob hover automatizado.
