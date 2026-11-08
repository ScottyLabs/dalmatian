# Setting up Dalmatian

## Creating your .env file

Copy `.env.example` into `.env` by running

```bash
cp .env.example .env
```

The `.env` file stores environment-specific config data for your project, including developer secrets. Don't publish it anywhere!

## Creating a Discord bot

Create [a new Discord bot](https://discord.com/developers/applications) or use one of your current ones.

Under the Bot tab, make sure that the Privileged Gateway Intents are enabled.

Then, reset your token and copy the token for `DISCORD_TOKEN`. You won't be able to see it again once you click out. Paste your token after the `DISCORD_TOKEN=` text in your `.env` file. Don't share this with anyone!

Next under the OAuth2 tab, grab the client ID for `DISCORD_CLIENT_ID`. Paste it after the `DISCORD_CLIENT_ID=` text in your `.env` file.

## Inviting your Discord bot

To add the bot to a server for testing, go to the OAuth2 tab's URL Generator, select the `bot` and `applications.commands` scopes, select the Administrator permission, and open the generated URL. Use a personal test server rather than a public server.

## Adding Google Maps API (optional)

Optionally, add `GOOGLE_MAPS_API_KEY` to `.env`. This is useful if you are working on the `/dining` command.

1. Head to [Google Cloud Console](https://console.cloud.google.com/) and create a new project.
1. In `APIs & Services`, enable the `Maps JavaScript API` and `Maps Static API` products.
1. Get a key from `Keys & Credentials` to input into `GOOGLE_MAPS_API_KEY`.

## Running the bot

Log in to OpenBao as described in kennel's [secrets guide](https://docs.kennel.scottylabs.org/guides/secrets/#local-development) if you haven't done so before, then enter the dev shell and start the bot and its database:

```bash
nix develop
pitchfork start --local
```

This starts a local PostgreSQL database and the Discord bot, and loads your `.env` values through secretspec. Migrations and slash command registration run automatically on startup. You should see your bot go online in Discord if everything worked!
