# Dalmatian

Dalmatian is a Discord bot designed for CMU students, providing easy access to campus resources like CMU Courses and CMU Eats right at your fingertips!

## Development

```bash
# install dependencies
bun install
# prepare environmental variables
cp .env.example .env
# start the bot (remember to edit the fields in .env)
bun start
```

Alternatively, you can use Docker:

```bash
# prepare environmental variables
cp .env.example .env
# build docker image and run (you need to stop the container before rebuilding it)
bun docker
# stop the container
bun docker:stop

# docker commands
## build docker image and run
docker build -t dalmatian . && docker run -d --rm --env-file .env --name dalmatian dalmatian
## stop the container (the `--rm` flag will remove the container after it's stopeed)
docker stop dalmatian
```

## Contributing

Please check [CONTRIBUTING.md](CONTRIBUTING.md) before you contribute to this project!
