# Dalmatian

Dalmatian is a Discord bot designed for CMU students, providing easy access to campus resources like CMU Courses and CMU Eats right at your fingertips!

<!--TODO: ## Features-->
<!--TODO: ## Requirements-->
<!--TODO: ## Project Overview-->

## Getting Started

### Prerequisites

- [Bun](https://bun.com/docs/installation) - JavaScript runtime and package manager
- [Docker](https://docs.docker.com/get-docker/) - For running PostgreSQL database

### Setup

For detailed setup instructions including creating a Discord bot, obtaining API credentials, and configuring your development environment, see [CONTRIBUTING.md](CONTRIBUTING.md).

**Quick setup:**
1. Install Bun and Docker (see links above)
2. Create a Discord bot at https://discord.com/developers/applications
3. Get your `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`

### Running the Bot

```bash
# 1. Install dependencies
bun install

# 2. Set up environment variables (see CONTRIBUTING.md for details)
cp .env.example .env
# Edit .env with your Discord bot credentials

# 3. Set up database
docker compose up -d postgres
bun run db:migrate

# 4. Start the bot
bun start
```

<!--TODO: ## Project Structure-->

## Contributing

Please check [CONTRIBUTING.md](CONTRIBUTING.md) before you contribute to this project!
