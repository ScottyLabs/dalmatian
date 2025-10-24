# Contributing to Dalmatian

This project follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

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

Head to https://discord.com/developers/applications and create a new application or use one of your current ones.

In your application, under the Bot tab, reset your token and copy the token for `DISCORD_TOKEN`

Under the OAuth2 tab, grab the client ID for `DISCORD_CLIENT_ID`

The bot will work fine with only the `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` keys. Additionally, you can set up `GOOGLE_MAPS_API_KEY` to debug `formatLocation` in `dining.ts`.
1. Head to https://console.cloud.google.com/ and create a new project.
2. In `APIs & Services`, enable the `Maps Javascript API` and `Maps Static API` products.
3. Get a key from `Keys & Credentials` to input into `GOOGLE_MAPS_API_KEY`.

## Forking and Branching
You are not able to commit to main. You may either branch off main in the repository or fork the repository for your own usage.

## Committing Your Changes
Please run `bun lint` (and check the warnings/errors!) and `bun format` before commiting your changes.

Remember to follow conventional committing guidelines while committing.
