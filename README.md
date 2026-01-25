# Dalmatian

Dalmatian is a Discord bot designed for CMU students, providing easy access to campus resources like CMU Courses and CMU Eats right at your fingertips!

<!--TODO: ## Features-->
<!--TODO: ## Requirements-->
<!--TODO: ## Project Overview-->
<!--TODO: ## Quick Start-->

## Getting Started

### Installing Docker
You can install Docker by following the instructions at:
- Windows: https://docs.docker.com/desktop/setup/install/windows-install/
- Linux: https://docs.docker.com/engine/install/
- Mac: https://docs.docker.com/desktop/setup/install/mac-install/

### Creating a Personal Discord Bot
Go to https://discord.com/developers/applications, and click the `New Application` button.

Create [a new Discord bot](https://discord.com/developers/applications) or use one of your current ones.

In your application, under the Bot tab, reset your token and copy the token for `DISCORD_TOKEN`.

Under the OAuth2 tab, grab the client ID for `DISCORD_CLIENT_ID`

The bot will work fine with only the `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` keys. Optionally, you can set up `GOOGLE_MAPS_API_KEY` to debug `formatLocation` in `dining.ts`.

1. Head to [Google Cloud Console](https://console.cloud.google.com/) and create a new project.
2. In `APIs & Services`, enable the `Maps Javascript API` and `Maps Static API` products.
3. Get a key from `Keys & Credentials` to input into `GOOGLE_MAPS_API_KEY`.

## Development

```bash
# install dependencies
bun install

# prepare environmental variables
cp .env.example .env
# remember to edit the fields in .env with your Discord bot credentials (without the hard brackets! [])

# start PostgreSQL database
docker compose up -d postgres

# run database migrations
bun run db:migrate

# start the bot
bun start
```

<!--TODO: ## Project Structure-->

## Contributing

Please check [CONTRIBUTING.md](CONTRIBUTING.md) before you contribute to this project!
