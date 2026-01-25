# Contributing to Dalmatian

Thank you for your interest in contributing to Dalmatian! This guide will help you get started.

## How to Contribute

1. **Fork the repository** or create a new branch if you have write access
2. **Create a new branch** from `main` with a descriptive name:
   ```bash
   git checkout -b your-feature-name
   # or
   git checkout -b bug-description
   ```
3. **Make your changes** following the code style and conventions
4. **Test your changes** locally by running the bot
5. **Commit using conventional commits** (see below)
6. **Push to your fork** or branch
7. **Open a Pull Request** with a clear description of your changes

## Conventional Commits

This project follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

**Examples:**
- `feat: add course search by instructor`
- `fix: resolve dining hall location formatting issue`
- `docs: update README installation steps`
- `refactor: simplify embed pagination logic`
- `chore: update dependencies to latest versions`
- `style: format code with biome`

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

The bot will work fine with only the `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` keys. Additionally, you can set up `GOOGLE_MAPS_API_KEY` to debug `formatLocation` in `dining.ts`.

1. Head to [Google Cloud Console](https://console.cloud.google.com/) and create a new project.
2. In `APIs & Services`, enable the `Maps Javascript API` and `Maps Static API` products.
3. Get a key from `Keys & Credentials` to input into `GOOGLE_MAPS_API_KEY`.

## Database Setup

The bot uses PostgreSQL for storing polls and reaction redirect configurations. The database runs in Docker for local development.

1. Start the PostgreSQL database using Docker:

   ```bash
   docker-compose up -d postgres
   ```

2. Run database migrations to create the tables:

   ```bash
   bun run db:migrate
   ```

3. (Optional) Open Drizzle Studio to inspect the database:

   ```bash
   bun run db:studio
   ```

The database will persist data in a Docker volume. To completely reset the database, run:

```bash
docker-compose down -v
docker-compose up -d postgres
bun run db:migrate
```

## Before Submitting

Before you commit and open a pull request, make sure to:

- Run `bun lint` and fix any errors/warnings
- Run `bun format` to format your code
- Test the bot locally with your changes
- Ensure your commits follow conventional commit format
- Update documentation if you added/changed features

## Pull Request Guidelines

- **Keep PRs focused** - One feature or fix per pull request
- **Write clear descriptions** - Explain what changed and why
- **Reference related issues** - Use "Fixes #123" or "Closes #456" if applicable
- **Be responsive** - Address review feedback promptly

## Need Help?

If you have questions or need help:
- Open an issue on GitHub
- Check existing issues and pull requests for similar questions

Remember to follow conventional committing guidelines while contributing!
