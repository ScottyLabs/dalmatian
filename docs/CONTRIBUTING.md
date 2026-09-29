# Contributing to Dalmatian

Thank you for your interest in contributing to Dalmatian! This guide will help you get started.

If this is your first time, follow [SETUP.md](SETUP.md) first to create your Discord bot and run it locally.

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

The bot uses PostgreSQL for storing polls and reaction redirect configurations. You don't need to install or start it yourself. `devenv up` runs a local PostgreSQL server, and the bot applies any pending migrations when it starts.

If you change the schema in `src/db/`, generate a new migration with:

```bash
deno run db:generate
```

To inspect the database, run `deno run db:studio` inside `devenv shell` while `devenv up` is running.

To completely reset the database, stop `devenv up`, delete `.devenv/state/postgres`, and start `devenv up` again.

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

To understand current priorities, roadmap, and ongoing work, please check the [issues board](https://git.cmu.dev/ScottyLabs/dalmatian/issues).

## Need Help?

If you have questions or need help:

- Open an issue
- Check existing issues and pull requests for similar questions

Remember to follow conventional committing guidelines while contributing!
