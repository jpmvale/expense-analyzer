# infra — o que este projeto tem na VPS

Os dois jobs de cron do expense-analyzer e os scripts que eles chamam. Existe porque, até
2026-08-05, isso vivia **só** na VPS: recriar a máquina significava reescrever esses arquivos de
memória, e ninguém tinha como saber, olhando o repositório, que uma extração rodava às 07:00.

Não é a infra inteira da máquina — veja [O que NÃO está aqui](#o-que-não-está-aqui).

```
infra/
  bin/run-extractor.sh            extração das faturas, 07:00 UTC
  bin/backup-mongo.sh             dump do credit-card, 06:00 UTC
  crontab.expense-analyzer        as duas entradas, comentadas
  instalar.sh                     instala/atualiza, ou confere (--conferir)
```

## Instalar

Na VPS, depois de um deploy que carregue o commit desejado:

```bash
~/apps/expense-analyzer/infra/instalar.sh
```

Idempotente: copia os scripts para `~/bin` e reescreve **apenas** o bloco entre as marcas
`# >>> expense-analyzer` e `# <<< expense-analyzer` no crontab, preservando o resto byte a byte.

Para saber se a VPS derivou do repositório, sem escrever nada:

```bash
~/apps/expense-analyzer/infra/instalar.sh --conferir
```

Sai com código 1 e mostra o diff quando algo difere — serve para rodar de dentro de outro script se
um dia isso virar verificação automática.

## Duas decisões que o código não explica sozinho

**Os scripts vão para `~/bin`, não são executados de dentro do checkout.** O deploy deixa o
repositório em detached HEAD no sha implantado. Se o cron chamasse
`~/apps/expense-analyzer/infra/bin/run-extractor.sh`, a versão executada mudaria a cada deploy —
inclusive para uma anterior, num rollback — e o job das 07:00 passaria a depender de qual foi o
último deploy. Em `~/bin`, a versão é a que alguém instalou de propósito.

**O crontab é reescrito por bloco, nunca por arquivo inteiro.** `crontab infra/crontab.expense-analyzer`
seria mais simples e apagaria as entradas de coda, kindred e do backup de segredos junto. O
delimitador é o que permite este repositório ser dono de duas linhas de um arquivo que ele não
controla.

## O que NÃO está aqui

Os dois scripts dependem de infraestrutura compartilhada, que serve também `coda` e `kindred` e
continua vivendo apenas na VPS:

| Script | Papel |
| --- | --- |
| `~/bin/com-alerta.sh` | Envolve todo job: registra em log e manda e-mail (Resend) se falhar |
| `~/bin/enviar-r2.sh` | Sobe o backup para o bucket R2 privado |
| `~/bin/deploy.sh` | Alvo do forced command da chave de deploy; serve os quatro projetos |
| `~/bin/backup-segredos.sh` | Backup cifrado dos segredos da máquina |

Versioná-los aqui poria a infra de outros projetos num repositório público onde ninguém que mexe
neles iria procurar — divergência silenciosa é questão de tempo. O lugar certo é um repositório de
infra próprio; enquanto ele não existe, **o crontab da VPS continua sendo a única fonte de verdade
das outras quatro entradas**.

Nenhum dos scripts guarda segredo: `RESEND_API_KEY`, `EMAIL_FROM`, `ALERTA_PARA` e as credenciais do
R2 vêm do ambiente, de `~/.secrets-vps`.
