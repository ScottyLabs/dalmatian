# Dalmation

Dalmation is a Discord bot designed for CMU students, providing easy access to campus resources like CMUCourses and CMUEats right at their fingertips!

## Development

Rename `.env.example` to `.env` and edit the fields. Then run

```bash
# install dependencies
pnpm install
# start the bot
pnpm start
```

Alternatively, you can use Docker:

```bash
# prepare environmental variables
cp .env.example .env
# build docker image and run
docker build -t dalmatian . && docker run -p 3213 --env-file .env dalmatian
```
