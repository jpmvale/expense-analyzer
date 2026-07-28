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

`main` em `495c69a`, CI verde, árvore limpa.

| | |
| --- | --- |
| **Base de referência** | 95 faturas · 5.744 lançamentos · `2018-11` a `2026-09` · R$ 217.774,05 |
| **Testes** | 245 — api 147, extractor 35, categorization 32, web 31 |
| **Workspaces** | `apps/{api,web,extractor}` + `packages/categorization` |
| **Telas** | Visão geral · Compras · Faturas · Assinaturas · Sem categoria |
| **Fila de classificação** | 113 títulos em `outros` |
| **Assinaturas detectadas** | 17 |

Subir o ambiente:

```bash
docker compose up -d   # MongoDB
pnpm dev               # API + front
```

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

- **A detecção de assinatura é uma tela, não um aviso.** O degrau de preço está lá, mas é
  preciso ir olhar — não há alerta quando um reajuste aparece numa fatura nova.
- **Não há tela para listar e revisar regras.** `GET /category-rule` mostra; a interface não.
  Editar uma regra hoje é criar por cima ou apagar.
- **Não há tela para o reapply.** Existe o `pnpm reapply`, mas quem só usa a interface não
  tem como chamá-lo.
- **113 títulos ainda em `outros`.** A fila encolhe classificando pela tela de Sem categoria;
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
- **Sem autenticação, e a API escreve.** As rotas de categoria e regra mudam o banco sem pedir
  nada. Ambiente confiável apenas.
- O aviso de **chunk acima de 500 kB** persiste no build. É Recharts e Radix, ambos em uso:
  resolver é code splitting, não remoção.

---

## Armadilhas de ambiente

Coisas que já custaram tempo nesta base.

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
