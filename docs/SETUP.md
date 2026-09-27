# Setting up Dalmatian

## Code Editor Setup

We recommend using VSCode, and the following setup guide will assume you are using VSCode. You will also need git installed.

## Creating your .env file

Rename or copy `.env.example` into `.env`.

Create [a new Discord bot](https://discord.com/developers/applications) or use one of your current ones.

In your application, under the Bot tab, reset your token and copy the token for `DISCORD_TOKEN`

Under the OAuth2 tab, grab the client ID for `DISCORD_CLIENT_ID`

To add the bot to a server for testing, go to the OAuth2 tab's URL Generator, select the `bot` and `applications.commands` scopes, pick the bot permissions you need, and open the generated URL. Use a personal test server rather than a real community server.

The bot will work fine with only the `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` keys.

Optionally, add `GOOGLE_MAPS_API_KEY` to `.env` to debug `formatLocation` in `dining.ts` (falls back from Vault to `.env`).

1. Head to [Google Cloud Console](https://console.cloud.google.com/) and create a new project.
1. In `APIs & Services`, enable the `Maps Javascript API` and `Maps Static API` products.
1. Get a key from `Keys & Credentials` to input into `GOOGLE_MAPS_API_KEY`.

## Running the bot

From the repository root, run:

```bash
devenv up
```

This starts a local PostgreSQL database and the bot, and loads your `.env` values through secretspec. Migrations and slash command registration run automatically on startup. The bot is ready once `/api/health` at <http://localhost:8080/api/health> returns `OK`. Stop everything with `Ctrl+C`.
