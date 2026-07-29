# Retomar aqui — handoff de sessão

> **Snapshot de 2026-07-28.** Documento vivo: atualizar quando o estado avançar.
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
| **Testes** | 303 — api 193, extractor 35, categorization 35, web 40 |
| **Workspaces** | `apps/{api,web,extractor}` + `packages/categorization` |
| **Telas** | Login · Visão geral · Compras · Faturas · Assinaturas · Sem categoria · Regras |
| **Fila de classificação** | 101 títulos em `outros` |
| **Assinaturas detectadas** | 17, 11 com nome formal, 6 ativas |
| **Regras** | 180 — 143 `exact`, 37 `contains` |
| **Autenticação** | sessão em cookie httpOnly, guarda no Mongo, um usuário só |

Subir o ambiente:

```bash
docker compose up -d   # MongoDB
pnpm dev               # API + front
```

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

- **O aviso de reajuste tem rota, mas nenhum canal chega sozinho.** `GET /purchase/price-alerts`
  responde sob pedido; não há push, e-mail nem nada que avise sem alguém perguntar. Deliberado —
  construir isso agora seria infraestrutura desproporcional para um app de um usuário só.
- **101 títulos ainda em `outros`.** A fila encolhe classificando pela tela de Sem categoria;
  a cauda é de títulos de ocorrência única, onde regra não pega.

**Interface (menores, levantadas e não resolvidas)**

- O **cabeçalho da tabela de Compras** some ao rolar. A correção acopla um deslocamento fixo
  à altura da barra de filtros, que é frágil — por isso ficou parada.
- **Quatro parcelas futuras** aparecem no topo da tabela de Compras, por serem os lançamentos
  de data mais recente. São registros legítimos; incomoda que o topo não seja "o que comprei
  agora".

**Técnico**

- **Controllers e injeção de dependência** seguem fora dos testes — só o smoke test do CI os
  exercita de ponta a ponta.
- O aviso de **chunk acima de 500 kB** persiste no build. É Recharts e Radix, ambos em uso:
  resolver é code splitting, não remoção.

---

## Armadilhas de ambiente

Coisas que já custaram tempo nesta base.

**A API exige login desde `98370b2`, e você não vai ter a senha.** `.env` guarda
`AUTH_PASSWORD_HASH` — um hash bcrypt, não reversível — não a senha em texto. Verificar uma feature
clicando pela tela, ou por `curl` contra uma rota protegida, fica bloqueado até o dono digitar a
senha. Duas saídas que não dependem disso: testes de serviço contra `mongodb-memory-server` (não
passam pelo guard, porque instanciam o serviço direto, sem o Nest) e, para leitura, conectar direto
no Mongo real com `mongoose.connect(MONGO_URI)` — contorna a API inteira, então só serve para medir,
nunca para escrever.

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
