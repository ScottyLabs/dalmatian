# Setting up Dalmatian

## Code Editor Setup

We recommend using VSCode, and the following setup guide will assume you are using VSCode.

Recommended VSCode extensions:

- VSCode has builtin TypeScript language support
- [Dependi](https://marketplace.visualstudio.com/items?itemName=fill-labs.dependi)
- [Biome](https://marketplace.visualstudio.com/items?itemName=biomejs.biome)
- [Oxc](https://marketplace.visualstudio.com/items?itemName=oxc.oxc-vscode)
- [Typescript (Native Preview)](https://marketplace.visualstudio.com/items?itemName=typescriptteam.native-preview)

You will also need git installed.

## Creating your .env file

Rename or copy `.env.example` into `.env`.

Create [a new Discord bot](https://discord.com/developers/applications) or use one of your current ones.

In your application, under the Bot tab, reset your token and copy the token for `DISCORD_TOKEN`

Under the OAuth2 tab, grab the client ID for `DISCORD_CLIENT_ID`

The bot will work fine with only the `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` keys.

Optionally, add `GOOGLE_MAPS_API_KEY` to `.env` to debug `formatLocation` in `dining.ts` (falls back from Vault to `.env`).

1. Head to [Google Cloud Console](https://console.cloud.google.com/) and create a new project.
1. In `APIs & Services`, enable the `Maps Javascript API` and `Maps Static API` products.
1. Get a key from `Keys & Credentials` to input into `GOOGLE_MAPS_API_KEY`.
