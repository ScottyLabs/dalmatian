FROM node:24.8.0-alpine3.22 AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml* ./

FROM base AS prod-deps
RUN pnpm install --prod --frozen-lockfile

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm run build

FROM base
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/build /app/build

EXPOSE 3213

CMD ["node", "./build/index.js"]
