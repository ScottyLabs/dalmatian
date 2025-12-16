# Dalmatian

Dalmatian is a Discord bot designed for CMU students, providing easy access to campus resources like CMU Courses and CMU Eats right at your fingertips!

## Development

```bash
# install dependencies
bun install

# prepare environmental variables
cp .env.example .env
# remember to edit the fields in .env with your Discord bot credentials

# start PostgreSQL database
docker-compose up -d postgres

# run database migrations
bun run db:migrate

# start the bot
bun start
```

## Contributing

Please check [CONTRIBUTING.md](CONTRIBUTING.md) before you contribute to this project!
