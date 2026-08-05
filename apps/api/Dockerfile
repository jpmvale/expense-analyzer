# API (NestJS). Build a partir da RAIZ do monorepo, não desta pasta:
#   docker build -f apps/api/Dockerfile .
# O contexto precisa ser a raiz porque a API consome @expense/categorization
# pelo workspace, e o lockfile do pnpm vive lá.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# deps — só os manifestos primeiro, pra essa camada só invalidar quando alguma
# dependência mudar. Copiar o código junto faria todo `pnpm install` rodar de
# novo a cada edição de arquivo .ts.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/categorization/package.json packages/categorization/
COPY packages/ingestion/package.json packages/ingestion/
RUN pnpm install --frozen-lockfile --filter @expense/api... --filter @expense/categorization... --filter @expense/ingestion...

# ---------------------------------------------------------------------------
# build — o turbo resolve o `^build`, então @expense/categorization compila
# antes da API (que a consome pelo `dist`).
# ---------------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json turbo.json ./
COPY packages/categorization packages/categorization
COPY packages/ingestion packages/ingestion
COPY apps/api apps/api
RUN pnpm turbo run build --filter @expense/api

# Poda as devDependencies: o nest-cli e o typescript não têm o que fazer em
# runtime e sozinhos respondem pela maior parte do node_modules.
RUN pnpm prune --prod

# ---------------------------------------------------------------------------
# runtime
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
# `node` já existe na imagem oficial (uid 1000) — rodar como root num container
# exposto à internet é privilégio que não precisamos dar.
USER node

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/packages/categorization/dist ./packages/categorization/dist
COPY --from=build --chown=node:node /app/packages/categorization/package.json ./packages/categorization/package.json
COPY --from=build --chown=node:node /app/packages/categorization/node_modules ./packages/categorization/node_modules
# A ingestão entrou no runtime da API quando o botão "Sincronizar" passou a
# existir: é ela que fala com o Google Drive. Antes só o extractor a carregava.
COPY --from=build --chown=node:node /app/packages/ingestion/dist ./packages/ingestion/dist
COPY --from=build --chown=node:node /app/packages/ingestion/package.json ./packages/ingestion/package.json
COPY --from=build --chown=node:node /app/packages/ingestion/node_modules ./packages/ingestion/node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules

EXPOSE 3000

# Healthcheck bate na raiz porque existe um @Controller() sem prefixo. Se essa
# rota sumir, trocar por /docs — que o Swagger sempre publica.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/main"]
