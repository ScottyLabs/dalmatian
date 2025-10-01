# Dalmatian

Dalmatian is a Discord bot designed for CMU students, providing easy access to campus resources like CMUCourses and CMUEats right at your fingertips!

## Development

Node.js >= 22.12.0 is required, but the development of Dalmatian uses v24.

```bash
# install dependencies
pnpm install
# prepare environmental variables
cp .env.example .env
# start the bot (remember to edit the fields in .env)
pnpm start
```

Alternatively, you can use Docker:

```bash
# prepare environmental variables
cp .env.example .env
# build docker image and run
docker build -t dalmatian . && docker run --rm --env-file .env --name dalmatian dalmatian
```

## Contributing

Please check [CONTRIBUTING.md](CONTRIBUTING.md) before you contribute to this project!
