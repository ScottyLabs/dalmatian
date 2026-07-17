# Contributing to Dalmatian

Thank you for your interest in contributing to Dalmatian! This guide will help you get started.

## How to Contribute

1. **Fork the repository** or create a new branch if you have write access
1. **Create a new branch** from `main` with a descriptive name:
   ```bash
   git checkout -b your-feature-name
   # or
   git checkout -b bug-description
   ```
1. **Make your changes** following the code style and conventions
1. **Test your changes** locally by running the bot
1. **Commit using conventional commits** (see below)
1. **Push to your fork** or branch
1. **Open a Pull Request** with a clear description of your changes

## Conventional Commits

This project follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

**Examples:**

- `feat: add course search by instructor`
- `fix: resolve dining hall location formatting issue`
- `docs: update README installation steps`
- `refactor: simplify embed pagination logic`
- `chore: update dependencies to latest versions`
- `style: format code with biome`

## Database Setup

> [!WARNING]
> This section is outdated and in need of attention. Please use this information with caution, and consider sending patches to update it.

The bot uses PostgreSQL for storing polls and reaction redirect configurations. The database runs in Docker for local development.

1. Start the PostgreSQL database using Docker:

   ```bash
   docker-compose up -d postgres
   ```

1. Run database migrations to create the tables:

   ```bash
   deno run db:migrate
   ```

1. (Optional) Open Drizzle Studio to inspect the database:

   ```bash
   deno run db:studio
   ```

The database will persist data in a Docker volume. To completely reset the database, run:

```bash
docker-compose down -v
docker-compose up -d postgres
deno run db:migrate
```

## Before Submitting

Before you commit and open a pull request, make sure to:

- Run `deno run lint` and fix any errors/warnings
- Run `deno run format` to format your code
- Run `deno run test` to ensure all tests pass
- Test your changes on your Discord bot by running `devenv up`
- Ensure your commits follow the conventional commit format
- Update documentation if you added/changed features

## Pull Request Guidelines

- **Keep PRs focused** - One feature or fix per pull request
- **Write clear descriptions** - Explain what changed and why
- **Reference related issues** - Use "Fixes #123" or "Closes #456" if applicable
- **Be responsive** - Address review feedback promptly

## Project Priorities & Planning

To understand current priorities, roadmap, and ongoing work:

- Visit the [Dalmatian Development project](https://github.com/orgs/ScottyLabs/projects/20)
- If you cannot access the board, ask a maintainer to add you to the ScottyLabs organization.

## Need Help?

If you have questions or need help:

- Open an issue on GitHub
- Check existing issues and pull requests for similar questions

Remember to follow conventional committing guidelines while contributing!
