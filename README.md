# Dalmatian

Dalmatian is a Discord bot designed for CMU students, providing easy access to campus resources like CMU Courses and CMU Eats right at your fingertips! Made in TypeScript using Discord.js.

Try some of dalmatian's bot commands!

- `/fce` - View and compare [Faculty Course Evaluations (FCEs)](https://www.cmu.edu/hub/fce/) across semesters and professors
- `/dining` - View the statuses of dining locations on campus
- `/course` - Look up information about a specific course

To add Dalmatian to your server, click [here](https://discord.com/oauth2/authorize?client_id=1433596352515932212)!

<!--TODO: ## Features-->

<!--TODO: ## Project Overview-->

## Getting Started

### Prerequisites

- Be a member of [Community-Based Projects](https://git.cmu.dev/ScottyLabs/governance/src/branch/main/data/teams/cbp.yaml), which you can [join through governance](https://git.cmu.dev/ScottyLabs/governance#joining-a-team)
- Lix, installed by following kennel's [local development guide](https://docs.kennel.scottylabs.org/guides/local-development/#installing-nix)

### Setup

For detailed setup instructions including creating a Discord bot, obtaining API credentials, and configuring your development environment, see [docs/SETUP.md](docs/SETUP.md).

**Quick setup:**

1. Install Lix (see above)
1. Create a Discord bot at <https://discord.com/developers/applications> and invite it to a server you can test in
1. Get your `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` and put them in `.env`:
   ```bash
   cp .env.example .env
   # Edit .env with your Discord bot credentials
   ```

### Running the Bot

Log in to OpenBao as described in kennel's [secrets guide](https://docs.kennel.scottylabs.org/guides/secrets/#local-development), then enter the dev shell and start the bot and a local PostgreSQL database:

```bash
nix develop
pitchfork start --local
```

Database migrations and slash command registration happen automatically when the bot starts.

<!--TODO: ## Project Structure-->

## Deployment

Production runs on [Kennel](https://docs.kennel.scottylabs.org/guides/deploying/).

## Contributing

Please read [CONTRIBUTING.md](docs/CONTRIBUTING.md) before you contribute to this project!
