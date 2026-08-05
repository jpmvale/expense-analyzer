#!/usr/bin/env bash
# Backup diário do Mongo do expense-analyzer.
#
# Roda pelo cron do usuário deploy. Mantém RETENCAO_DIAS arquivos e apaga os
# mais velhos — sem isso o disco enche em silêncio e o backup vira o problema.
#
# `set -o pipefail` importa aqui: o dump é canalizado pro tar, e sem ele um
# mongodump que falhasse ainda produziria um .tar.gz de aparência normal, só
# que vazio. Backup silenciosamente vazio é pior que backup nenhum.
set -euo pipefail

DESTINO="${HOME}/backups/expense-analyzer"
RETENCAO_DIAS=14
CONTAINER="expense-analyzer-mongo-1"
BANCO="credit-card"
CARIMBO="$(date +%Y-%m-%d_%H%M%S)"
ARQUIVO="${DESTINO}/${BANCO}_${CARIMBO}.tar.gz"

mkdir -p "$DESTINO"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "[$(date -Is)] ERRO: container ${CONTAINER} não está rodando" >&2
  exit 1
fi

docker exec "$CONTAINER" sh -c "rm -rf /tmp/bkp && mongodump --db=${BANCO} --out=/tmp/bkp --quiet && cd /tmp/bkp && tar czf - ${BANCO}" > "$ARQUIVO"
docker exec "$CONTAINER" rm -rf /tmp/bkp

# Um dump válido do credit-card não tem como ser menor que uns poucos KB. Se
# veio menor, algo falhou no meio do pipe e é melhor barrar agora do que
# descobrir na hora de restaurar.
TAMANHO=$(stat -c%s "$ARQUIVO")
if [ "$TAMANHO" -lt 2048 ]; then
  echo "[$(date -Is)] ERRO: backup suspeito (${TAMANHO} bytes) — removendo" >&2
  rm -f "$ARQUIVO"
  exit 1
fi

# Confere que o tar abre e traz os .bson esperados, em vez de confiar no
# exit code do pipe.
if ! tar tzf "$ARQUIVO" | grep -q "${BANCO}/purchases.bson"; then
  echo "[$(date -Is)] ERRO: backup sem purchases.bson — removendo" >&2
  rm -f "$ARQUIVO"
  exit 1
fi

find "$DESTINO" -name "${BANCO}_*.tar.gz" -type f -mtime "+${RETENCAO_DIAS}" -delete

# Cópia externa. O backup local protege contra erro de aplicação; não protege
# contra perder a máquina, que é onde ele mora. Roda DEPOIS da validação e da
# retenção: se o envio falhar, o dump do dia já está seguro em disco e o erro
# sai alto, em vez de virar um backup que ninguém sabe que não existe.
if ! "${HOME}/bin/enviar-r2.sh" "$ARQUIVO" "expense-analyzer/$(basename "$ARQUIVO")" "$RETENCAO_DIAS"; then
  echo "[$(date -Is)] ERRO: backup local ok, mas o envio ao R2 falhou" >&2
  exit 1
fi

echo "[$(date -Is)] ok: ${ARQUIVO} ($(numfmt --to=iec "$TAMANHO")) — $(ls -1 "${DESTINO}" | wc -l) backups retidos"
