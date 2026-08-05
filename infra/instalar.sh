#!/usr/bin/env bash
#
# Instala na VPS os scripts e as entradas de cron deste projeto.
#
#   ~/apps/expense-analyzer/infra/instalar.sh              instala ou atualiza
#   ~/apps/expense-analyzer/infra/instalar.sh --conferir   só compara, não escreve
#
# Idempotente: rodar duas vezes seguidas não muda nada na segunda.
#
# O crontab da máquina serve quatro projetos. Este script gerencia SÓ o bloco
# entre as marcas abaixo e preserva o resto byte a byte — é por isso que ele
# reescreve um bloco delimitado em vez de instalar o arquivo inteiro, que é o
# que um `crontab infra/crontab.expense-analyzer` faria, apagando coda e kindred
# junto.
set -euo pipefail

INICIO='# >>> expense-analyzer — gerenciado por infra/instalar.sh, não edite à mão'
FIM='# <<< expense-analyzer'

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESTINO_BIN="${HOME}/bin"
CONFERIR=0
[ "${1:-}" = "--conferir" ] && CONFERIR=1

falhas=0

# --- scripts -----------------------------------------------------------------
#
# Os scripts vão para ~/bin e não são executados de dentro do repositório: o
# deploy deixa o checkout em detached HEAD no sha implantado, e o cron chamando
# um caminho dentro dele passaria a rodar uma versão diferente a cada deploy —
# inclusive uma anterior, num rollback. Em ~/bin, a versão é a que foi instalada
# de propósito.
mkdir -p "$DESTINO_BIN"

for origem in "$RAIZ"/infra/bin/*.sh; do
  nome="$(basename "$origem")"
  destino="${DESTINO_BIN}/${nome}"

  if [ -f "$destino" ] && cmp -s "$origem" "$destino"; then
    echo "  = ${nome} (igual)"
    continue
  fi

  if [ "$CONFERIR" = 1 ]; then
    if [ -f "$destino" ]; then
      echo "  ! ${nome} DIFERE do repositório:"
      diff -u "$destino" "$origem" | sed 's/^/      /' || true
    else
      echo "  ! ${nome} não existe em ${DESTINO_BIN}"
    fi
    falhas=$((falhas + 1))
    continue
  fi

  install -m 755 "$origem" "$destino"
  echo "  + ${nome} instalado"
done

# --- crontab -----------------------------------------------------------------
#
# `|| true` porque `crontab -l` sai com 1 quando não há crontab nenhum, e o
# `set -e` mataria o script justamente na primeira instalação.
atual="$(crontab -l 2>/dev/null || true)"

# As linhas do bloco, sem os comentários do arquivo versionado: o crontab é lido
# por humanos em `crontab -l`, e trinta linhas de comentário por projeto o
# tornariam ilegível. A explicação fica no repositório, que é onde ela é editada.
entradas="$(grep -vE '^\s*(#|$)' "$RAIZ/infra/crontab.expense-analyzer")"
bloco="${INICIO}
${entradas}
${FIM}"

# Remove o bloco antigo preservando todo o resto, inclusive linhas em branco e
# comentários dos outros projetos.
sem_bloco="$(printf '%s\n' "$atual" | sed "\|^${INICIO}\$|,\|^${FIM}\$|d")"

# --- linhas órfãs ------------------------------------------------------------
#
# O caso da primeira instalação numa máquina que já rodava estes jobs à mão: as
# entradas antigas continuam fora do bloco, e acrescentar o bloco as DUPLICA —
# backup e extração rodariam duas vezes por dia. Cron não reclama de entrada
# repetida, e a segunda extração toparia com o lock de `syncRuns` e falharia por
# um motivo que não tem nada a ver com a causa.
orfas="$(printf '%s\n' "$sem_bloco" | grep -nE 'run-extractor\.sh|backup-mongo\.sh' || true)"

if [ -n "$orfas" ]; then
  if [ "$CONFERIR" = 1 ]; then
    echo "  ! entradas deste projeto FORA do bloco gerenciado (rodariam duas vezes):"
    printf '%s\n' "$orfas" | sed 's/^/      /'
    falhas=$((falhas + 1))
  elif [ "${1:-}" = "--adotar" ]; then
    # Só as linhas de comando. Comentários órfãos ficam — apagá-los exigiria
    # adivinhar quais pertenciam a quais entradas, e um comentário sobrando é
    # visível e inofensivo.
    sem_bloco="$(printf '%s\n' "$sem_bloco" | grep -vE 'run-extractor\.sh|backup-mongo\.sh' || true)"
    echo "  - entradas antigas removidas (adotadas pelo bloco)"
  else
    echo "Estas entradas já existem no crontab, fora do bloco gerenciado:" >&2
    printf '%s\n' "$orfas" | sed 's/^/      /' >&2
    echo >&2
    echo "Instalar assim as DUPLICARIA — cada job rodaria duas vezes por dia." >&2
    echo "Se são as mesmas que este repositório versiona, adote-as:" >&2
    echo "      $0 --adotar" >&2
    echo "Se alguma tem horário ou argumento diferente de propósito, resolva no" >&2
    echo "crontab antes (\`crontab -e\`) e rode de novo." >&2
    exit 1
  fi
fi

if [ "$CONFERIR" = 1 ]; then
  if printf '%s\n' "$atual" | grep -qF "$INICIO"; then
    atual_bloco="$(printf '%s\n' "$atual" | sed -n "\|^${INICIO}\$|,\|^${FIM}\$|p")"
    if [ "$atual_bloco" = "$bloco" ]; then
      echo "  = crontab (bloco igual)"
    else
      echo "  ! crontab DIFERE do repositório:"
      diff -u <(printf '%s\n' "$atual_bloco") <(printf '%s\n' "$bloco") | sed 's/^/      /' || true
      falhas=$((falhas + 1))
    fi
  else
    echo "  ! crontab não tem o bloco do expense-analyzer"
    falhas=$((falhas + 1))
  fi

  if [ "$falhas" -gt 0 ]; then
    echo
    echo "${falhas} diferença(s). Rode sem --conferir para alinhar a VPS ao repositório."
    exit 1
  fi
  echo
  echo "VPS e repositório estão iguais."
  exit 0
fi

# `printf` e não `echo`: uma linha que começasse com `-e` viraria flag. E o
# crontab precisa terminar em nova linha, senão o cron ignora a última entrada
# sem reclamar.
#
# Não é preciso aparar linhas em branco do fim de `$sem_bloco`: a substituição de
# comando que o produziu já removeu as quebras finais.
if [ -n "$sem_bloco" ]; then
  printf '%s\n%s\n' "$sem_bloco" "$bloco" | crontab -
else
  printf '%s\n' "$bloco" | crontab -
fi
echo "  + crontab atualizado"

echo
echo "Pronto. Confira com: crontab -l"
