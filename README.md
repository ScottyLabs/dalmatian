# Dalmatian

Dalmatian is a Discord bot designed for CMU students, providing easy access to campus resources like CMU Courses and CMU Eats right at your fingertips!

<!--TODO: ## Features-->

<!--TODO: ## Project Overview-->

## Getting Started

### Prerequisites

- [devenv](https://devenv.sh/getting-started/) - Developer environment
- [direnv](https://direnv.net/docs/installation.html) - shell extension (that we use for devenv)

(You'll need Nix as well, but devenv gives you that command.)

### Setup

For detailed setup instructions including creating a Discord bot, obtaining API credentials, and configuring your development environment, see [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

**Quick setup:**

1. Install devenv and direnv (see links above)
1. Create a Discord bot at [https://discord.com/developers/applications]
1. Get your `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`

### Running the Bot

```bash
# Set up environment variables (see CONTRIBUTING.md for details)
cp .env.example .env
# Edit .env with your Discord bot credentials

# Start the environment
devenv up
```

<!--TODO: ## Project Structure-->

## Deployment

Production runs on [Kennel](https://codeberg.org/ScottyLabs/kennel) via devenv and secretspec.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before you contribute to this project!
