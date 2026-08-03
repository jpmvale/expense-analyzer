# Web (Vite + React). Build a partir da RAIZ do monorepo:
#   docker build -f apps/web/Dockerfile --build-arg VITE_API_URL=... .
#
# ATENÇÃO ao VITE_API_URL: o Vite substitui `import.meta.env.*` em tempo de
# BUILD, não de execução. Passar a variável no `environment:` do compose não
# tem efeito nenhum — o valor já está gravado no bundle. Por isso é build-arg,
# e por isso trocar a URL da API exige rebuildar a imagem.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/categorization/package.json packages/categorization/
RUN pnpm install --frozen-lockfile --filter @expense/web... --filter @expense/categorization...

FROM deps AS build
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
COPY tsconfig.base.json turbo.json ./
COPY packages/categorization packages/categorization
COPY apps/web apps/web
RUN pnpm turbo run build --filter @expense/web

# ---------------------------------------------------------------------------
# runtime — Caddy servindo os estáticos. É o Caddy interno do container, que
# fala HTTP puro na 8080; quem termina o TLS é o Caddy compartilhado na frente.
# ---------------------------------------------------------------------------
FROM caddy:2-alpine AS runtime
COPY --from=build /app/apps/web/dist /srv

# `try_files {path} /index.html` é o que faz o React Router funcionar em URL
# digitada direto: sem isso, abrir /purchases devolve 404 porque não existe
# arquivo nenhum com esse nome — só a rota client-side.
RUN printf ':8080 {\n\
    root * /srv\n\
    encode gzip zstd\n\
    try_files {path} /index.html\n\
    file_server\n\
    header /assets/* Cache-Control "public, max-age=31536000, immutable"\n\
    header /index.html Cache-Control "no-cache"\n\
}\n' > /etc/caddy/Caddyfile

EXPOSE 8080
