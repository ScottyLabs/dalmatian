FROM oven/bun:latest

WORKDIR /app

COPY package.json bun.lock* ./

RUN bun install --production --no-save

COPY . .

CMD ["bun", "src/index.ts"]
