FROM oven/bun:latest AS base

WORKDIR /app

COPY package.json pnpm-lock.yaml* bun.lock* ./

RUN bun install --production --no-save

COPY . .

CMD ["bun", "src/index.ts"]
