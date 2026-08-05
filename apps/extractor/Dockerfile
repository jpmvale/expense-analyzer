# Extractor. Build a partir da RAIZ do monorepo:
#   docker build -f apps/extractor/Dockerfile .
#
# Não é um serviço: roda, lê as faturas, grava no Mongo e termina. No compose
# ele sobe com `restart: no` e é disparado por timer — deixá-lo como container
# permanente só reiniciaria um processo que já cumpriu o que tinha que fazer.
#
# Os segredos do Drive (drive-credentials.json e token.json) entram por VOLUME,
# nunca por COPY: camada de imagem é legível por qualquer um com acesso ao
# daemon, e o token dá acesso de leitura ao seu Drive.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/extractor/package.json apps/extractor/
COPY packages/categorization/package.json packages/categorization/
COPY packages/ingestion/package.json packages/ingestion/
RUN pnpm install --frozen-lockfile --filter @expense/extractor... --filter @expense/categorization... --filter @expense/ingestion...

FROM deps AS build
COPY tsconfig.base.json turbo.json ./
COPY packages/categorization packages/categorization
COPY packages/ingestion packages/ingestion
COPY apps/extractor apps/extractor
RUN pnpm turbo run build --filter @expense/extractor
RUN pnpm prune --prod

FROM base AS runtime
ENV NODE_ENV=production
USER node

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/packages/categorization/dist ./packages/categorization/dist
COPY --from=build --chown=node:node /app/packages/categorization/package.json ./packages/categorization/package.json
COPY --from=build --chown=node:node /app/packages/categorization/node_modules ./packages/categorization/node_modules
COPY --from=build --chown=node:node /app/packages/ingestion/dist ./packages/ingestion/dist
COPY --from=build --chown=node:node /app/packages/ingestion/package.json ./packages/ingestion/package.json
COPY --from=build --chown=node:node /app/packages/ingestion/node_modules ./packages/ingestion/node_modules
COPY --from=build --chown=node:node /app/apps/extractor/dist ./apps/extractor/dist
COPY --from=build --chown=node:node /app/apps/extractor/package.json ./apps/extractor/package.json
COPY --from=build --chown=node:node /app/apps/extractor/node_modules ./apps/extractor/node_modules

CMD ["node", "apps/extractor/dist/main.js"]
