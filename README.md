# Dalmatian

Dalmatian is a Discord bot designed for CMU students, providing easy access to campus resources like CMU Courses and CMU Eats right at your fingertips!

<!--TODO: ## Features-->

<!--TODO: ## Project Overview-->

## Getting Started

### Prerequisites

- [devenv](https://devenv.sh/getting-started/) - provides Deno and other tooling via Nix

### Setup

For detailed setup instructions including creating a Discord bot, obtaining API credentials, and configuring your development environment, see [docs/SETUP.md](docs/SETUP.md).

**Quick setup:**

1. Install devenv (see link above)
1. Create a Discord bot at <https://discord.com/developers/applications> and invite it to a server you can test in
1. Get your `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` and put them in `.env`:
   ```bash
   cp .env.example .env
   # Edit .env with your Discord bot credentials
   ```

### Running the Bot

Authenticate once per machine with:

```
nix run git+https://git.cmu.dev/ScottyLabs/kennel#login
```

Then start the bot and a local PostgreSQL database:

```bash
devenv up
```

Database migrations and slash command registration happen automatically when the bot starts. The first run may take a while as devenv downloads its tooling.

<!--TODO: ## Project Structure-->

## Deployment

Production runs on [Kennel](https://git.cmu.dev/ScottyLabs/kennel) via devenv and secretspec.

## Contributing

Please read [CONTRIBUTING.md](docs/CONTRIBUTING.md) before you contribute to this project!
