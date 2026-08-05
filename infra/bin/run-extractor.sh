#!/usr/bin/env bash
# Extração diária das faturas do Drive para o Mongo do expense-analyzer.
#
# Roda pelo cron do usuário deploy, depois do backup das 06:00 — assim, se uma
# extração corromper algo, o backup mais recente é sempre anterior a ela.
set -euo pipefail

PROJETO="${HOME}/apps/expense-analyzer"
COMPOSE="docker compose -f ${PROJETO}/docker-compose.prod.yml"

# A extração roda com a MESMA versão que está implantada, e não com `latest`.
# São processos que gravam no mesmo banco: se a API estivesse num sha e o
# extractor noutro, uma divergência de contrato entre eles apareceria como dado
# estranho no Mongo, sem nada no log apontando para versões diferentes.
IMAGE_TAG="$(cat "${HOME}/.deploy-state/expense-analyzer" 2>/dev/null || echo latest)"
export IMAGE_TAG

cd "$PROJETO"

echo "[$(date -Is)] iniciando extração (imagem ${IMAGE_TAG})"

# --rm porque cada execução é descartável: o container não guarda estado, tudo
# que importa vai pro Mongo. Sem isso sobra um container parado por dia.
if timeout 900 $COMPOSE run --rm extractor; then
  echo "[$(date -Is)] extração concluída"
else
  CODIGO=$?
  # 124 é o timeout do coreutils. Vale distinguir: uma extração travada em rede
  # é um problema diferente de uma que falhou na autenticação.
  if [ "$CODIGO" -eq 124 ]; then
    echo "[$(date -Is)] ERRO: extração excedeu 15 min e foi interrompida" >&2
  else
    echo "[$(date -Is)] ERRO: extração falhou (código ${CODIGO})" >&2
  fi
  exit "$CODIGO"
fi
