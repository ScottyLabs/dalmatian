# Migrating Dalmatian from Legacy Infra to Kennel

Runbook from the deploy-01 cutover (June 2026). Use as a template for other ScottyLabs apps moving from NixOS `services.*` + `bao-agent` to **devenv + secretspec + Kennel**.

**Official Kennel documentation:** [sites/docs](https://codeberg.org/ScottyLabs/kennel/src/branch/main/sites/docs) — start with [Deploying a Project](https://codeberg.org/ScottyLabs/kennel/src/branch/main/sites/docs/src/guides/deploying.md), [Secrets](https://codeberg.org/ScottyLabs/kennel/src/branch/main/sites/docs/src/guides/secrets.md), and [devenv options](https://codeberg.org/ScottyLabs/kennel/src/branch/main/sites/docs/src/reference/devenv-options.md).

## Target architecture

| Layer | Legacy (deploy-01) | Kennel (per [overview](https://codeberg.org/ScottyLabs/kennel/src/branch/main/sites/docs/src/overview.md)) |
|-------|-------------------|--------|
| Deploy | `infrastructure/hosts/deploy-01/<app>.nix` | Forgejo push → webhook → `devenv build` → `nix build` → systemd + Caddy |
| Secrets | `bao-agent` → `/run/secrets/<app>.env` (`secret/projects/.../prod/env`) | [secretspec](https://codeberg.org/ScottyLabs/kennel/src/branch/main/sites/docs/src/guides/secrets.md) → OpenBao at deploy time |
| Process (prod) | `services.<app>` NixOS module | Transient unit `kennel-<slug>-<branch_slug>-<service>` ([architecture](https://codeberg.org/ScottyLabs/kennel/src/branch/main/sites/docs/src/reference/architecture.md)) |
| Postgres | Shared DB (e.g. `dalmatian`) | Per-deployment DB via `services.kennel.resources.postgres` ([NixOS module](https://codeberg.org/ScottyLabs/kennel/src/branch/main/sites/docs/src/reference/nixos-module.md)) |
| URLs | Static host config | `{project}-{branch}.scottylabs.net` (+ optional `customDomain`) |

**Codeberg** is the deploy remote Kennel watches (Forgejo org repo), not GitHub alone.

### deploy-01 vs upstream docs

The Kennel book describes **SQLite** metadata on the host ([architecture](https://codeberg.org/ScottyLabs/kennel/src/branch/main/sites/docs/src/reference/architecture.md)). **deploy-01 uses PostgreSQL** for Kennel’s `projects` / `deployments` tables. For cutover debugging, use host logs, `/proc/$PID/environ`, and `kennel_%` app databases — do not assume the book’s SQLite schema.

Postgres **app** DB names on deploy-01 use the **project UUID** (`kennel_<uuid_with_underscores>_<branch_slug>`), not the human slug `dalmatian`. **Unit names** still use the slug (`kennel-dalmatian-main-dalmatian`). See [issue §5](#5-restored-data-into-the-wrong-database).

## Repo setup (aligned with Kennel “Deploying a Project”)

Dalmatian follows [guides/deploying.md](https://codeberg.org/ScottyLabs/kennel/src/branch/main/sites/docs/src/guides/deploying.md):

| Step | Kennel doc | Dalmatian |
|------|------------|-----------|
| 1 | Import ScottyLabs devenv | `devenv.yaml` → `inputs.scottylabs` (Codeberg), `devenv.nix` → `scottylabs.devenvModules.default` |
| 2 | direnv + `.gitignore` | `.envrc`, `.gitignore` (`.devenv/`, `.direnv/`, …) |
| 3 | Declare services + **matching** processes | `scottylabs.kennel.services.dalmatian` + `processes.dalmatian` (names must match per [devenv-options](https://codeberg.org/ScottyLabs/kennel/src/branch/main/sites/docs/src/reference/devenv-options.md)) |
| 4 | `scottylabs.postgres.enable` | Enabled; app reads `DATABASE_URL` (see Bun caveats below) |
| 5 | **Governance** kennel flag + webhook | Required before reliable metadata/reconcile — dalmatian was missing from `projects` on deploy-01 during cutover |
| 6 | Push to Forgejo | Push **`main`** on Codeberg; Kennel builds `.#packages.x86_64-linux.dalmatian` |

**Local dev vs prod:** `processes.dalmatian` runs `secretspec run --profile dev -- bun run start` in devenv. **Production** runs the **flake package** binary from `nix build` (Kennel `find_executable` on the store path), not the process `exec` string.

**`secretspec.toml`:** Declares secrets per [guides/secrets.md](https://codeberg.org/ScottyLabs/kennel/src/branch/main/sites/docs/src/guides/secrets.md). Kennel maps branches to profiles:

| Branch | Profile |
|--------|---------|
| `main` | `prod` |
| `staging` | `staging` |
| `dev` | `dev` |
| `pr-*` | `preview` |

Set prod secrets with `secretspec set -P prod DISCORD_TOKEN` (or `secretspec set --profile prod …`). Local: `bao login -method=oidc`, then `devenv shell` with `scottylabs.secrets.enable = true`.

**App-specific:** `src/db/client.ts` — Bun + Kennel unix-socket `DATABASE_URL` (not covered in upstream docs; see issues below).

## Issues, causes, fixes, prevention

### 1. Kennel deploys but bot crash-loops on Postgres (password auth)

**Symptom:** `password authentication failed for user "kennel-dalmatian-main-dalmatian"` during `CREATE SCHEMA "drizzle"`.

**Cause:** Kennel injects `DATABASE_URL=postgresql:///…?host=/run/postgresql` ([postgres resource](https://codeberg.org/ScottyLabs/kennel/src/branch/main/sites/docs/src/reference/nixos-module.md)). Bun treats that string as TCP and uses the systemd **DynamicUser** name as the DB user.

**Fix (app):** Parse unix-socket URLs and connect with `{ database, path }` in `src/db/client.ts`.

**Prevent:** Reuse `createSqlClient()` for Bun + Kennel apps; upstream assumes generic `DATABASE_URL` consumers.

______________________________________________________________________

### 2. Role does not exist / not permitted to log in

**Symptom:** `role "kennel-dalmatian-main-dalmatian" does not exist`, then `not permitted to log in`.

**Cause:** Transient units use `DynamicUser=true` ([architecture](https://codeberg.org/ScottyLabs/kennel/src/branch/main/sites/docs/src/reference/architecture.md)). Postgres had no matching role; `CREATE ROLE` without `LOGIN` blocks peer auth on the socket.

**Fix (host, one-time per unit name):**

```sql
CREATE ROLE "kennel-dalmatian-main-dalmatian" WITH LOGIN;
GRANT ALL PRIVILEGES ON DATABASE "<kennel_db>" TO "kennel-dalmatian-main-dalmatian";
```

**Prevent:** Extend Kennel `postgres` provisioner beyond `createdb` — create role + owner/grants (gap vs [nixos-module](https://codeberg.org/ScottyLabs/kennel/src/branch/main/sites/docs/src/reference/nixos-module.md) “peer authentication” intent).

______________________________________________________________________

### 3. `unrecognized configuration parameter "host"`

**Symptom:** After unix-socket fix, migrations fail with `unrecognized configuration parameter "host"`.

**Cause:** Bun still reads `DATABASE_URL` from the environment when passing explicit options; `?host=` is sent as a Postgres GUC.

**Fix (app):** `Reflect.deleteProperty(process.env, "DATABASE_URL")` before `new SQL({ database, path })`.

**Prevent:** Same as §1; use `Reflect.deleteProperty` if `DATABASE_URL` is `readonly` in `environment.d.ts`.

______________________________________________________________________

### 4. `permission denied for schema public`

**Symptom:** Migrations reach `CREATE TABLE` but fail on `public`.

**Cause:** `createdb` runs as **`kennel`** → DB owner is `kennel`, not the app DynamicUser. Postgres 15+ restricts `CREATE` on `public` to the DB owner (`pg_database_owner`).

**Fix (host):**

```sql
ALTER DATABASE "<kennel_db>" OWNER TO "kennel-dalmatian-main-dalmatian";
ALTER SCHEMA public OWNER TO "kennel-dalmatian-main-dalmatian";
GRANT CREATE, USAGE ON SCHEMA public TO "kennel-dalmatian-main-dalmatian";
```

**Prevent:** `createdb -O "<dynamic-user-role>"` in Kennel provisioner.

______________________________________________________________________

### 5. Restored data into the wrong database

**Symptom:** Restore looked correct but the bot still hit an empty DB.

**Cause:** App DB name is `kennel_<project_uuid>_<branch_slug>`, not `kennel_<slug>_main`. Docs show slug-style examples ([PR deployments](https://codeberg.org/ScottyLabs/kennel/src/branch/main/sites/docs/src/guides/pr-deployments.md)); deploy-01 uses UUID in `project_id`. `LIMIT 1` on `kennel_%_main` picks the wrong DB. Starting Kennel can create a fresh DB for the real UUID.

**Fix (host):**

1. `systemctl stop kennel` (stops [reconciliation](https://codeberg.org/ScottyLabs/kennel/src/branch/main/sites/docs/src/reference/architecture.md)).

1. Resolve DB from running unit (while up) or Kennel logs `"created database","db":"…"`:

   ```bash
   PID=$(systemctl show 'kennel-dalmatian-main-dalmatian' -p MainPID --value)
   sudo tr '\0' '\n' < /proc/$PID/environ | grep DATABASE_URL
   ```

1. Restore legacy DB into **that** name (`createdb -O "kennel-dalmatian-main-dalmatian"` + `pg_restore`).

**Prevent:** Record project UUID ↔ DB name in governance; never guess with `LIMIT 1`.

______________________________________________________________________

### 6. Project missing from Kennel metadata

**Symptom:** No `dalmatian` row in `projects` / `deployments`; orphan `kennel_*` DBs and transient units still exist.

**Cause:** [Deploying §5](https://codeberg.org/ScottyLabs/kennel/src/branch/main/sites/docs/src/guides/deploying.md) (governance kennel flag + webhook) not completed before cutover.

**Fix:** Register in **governance**; confirm webhook and rows in host metadata DB after push.

**Prevent:** Governance before disabling legacy NixOS service.

______________________________________________________________________

### 7. Legacy `dalmatian.service` / `bao-agent` (parallel track)

**Symptom:** `/run/secrets/dalmatian.env` missing; `bao-agent` 403 on `secret/data/projects/dalmatian/prod/env`.

**Cause:** Host AppRole policy moved to `secret/secretspec/...` while `bao-agent` still reads `secret/projects/...`. Kennel uses a **separate** AppRole ([secrets](https://codeberg.org/ScottyLabs/kennel/src/branch/main/sites/docs/src/guides/secrets.md) — `VAULT_TOKEN` on the kennel service).

**Fix (infra):** Align `approle.tf` + `bao-agent.nix`, or migrate legacy secrets off bao-agent before cutover.

______________________________________________________________________

### 8. `systemctl disable` on NixOS

**Symptom:** Read-only `/etc/systemd/system/…`.

**Cause:** NixOS manages enablement declaratively.

**Fix:** `systemctl stop` for cutover; disable via `infrastructure` (`services.dalmatian.enable = false`).

______________________________________________________________________

## Cutover checklist (future apps)

### Repo ([deploying.md](https://codeberg.org/ScottyLabs/kennel/src/branch/main/sites/docs/src/guides/deploying.md))

- [ ] `devenv.yaml` / `devenv.nix` with ScottyLabs module
- [ ] `scottylabs.project.name` matches governance slug
- [ ] `scottylabs.kennel.services.<name>` and `processes.<name>` — **same key**
- [ ] `scottylabs.postgres.enable` + app DB client compatible with Kennel `DATABASE_URL`
- [ ] `secretspec.toml` with `prod` (+ `staging` / `preview` if those branches deploy)
- [ ] `flake.nix`: `packages.x86_64-linux.<name>` matches kennel service key
- [ ] Push to **Forgejo** default branch

### Secrets ([secrets.md](https://codeberg.org/ScottyLabs/kennel/src/branch/main/sites/docs/src/guides/secrets.md))

- [ ] `secretspec set -P prod …` for required keys
- [ ] `secretspec check -P prod`
- [ ] Rotate tokens if exposed in logs / `systemctl show`

### Governance (required)

- [ ] Kennel enabled for project; Forgejo webhook active
- [ ] Confirm `projects` / `deployments` rows on host after first deploy

### deploy-01 data migration

1. [ ] Stop legacy service and `kennel`
1. [ ] Resolve **exact** app DB name (UUID-based; §5)
1. [ ] DynamicUser Postgres role with `LOGIN` + DB/schema ownership
1. [ ] `pg_dump` legacy DB → `pg_restore` into Kennel DB
1. [ ] Start `kennel` only (not transient units manually)
1. [ ] Verify `DATABASE_URL` in `/proc/$PID/environ` matches restored DB
1. [ ] Optional: `GET /deployments/:id/health` on Kennel API ([architecture](https://codeberg.org/ScottyLabs/kennel/src/branch/main/sites/docs/src/reference/architecture.md))

### Do not

- Use `kennel_%_main LIMIT 1` to pick a database
- `systemctl start kennel-<project>-…` manually — Kennel owns transient units
- Run legacy + Kennel with the same Discord token
- Skip governance registration

## Reference: dalmatian on deploy-01 (June 2026)

| Item | Value |
|------|--------|
| Kennel unit | `kennel-dalmatian-main-dalmatian` |
| Kennel app DB (`main`) | `kennel_019e910f_e16e_7110_89e9_9a1ee4f31aac_main` |
| Legacy DB (data source) | `dalmatian` |
| Postgres DynamicUser role | `kennel-dalmatian-main-dalmatian` |
| Prod URL | `dalmatian-main.scottylabs.net` ([deploying.md](https://codeberg.org/ScottyLabs/kennel/src/branch/main/sites/docs/src/guides/deploying.md) URL pattern) |

### 9. Commands missing / `Failed to load handler command.ts` (app bug, not Kennel)

**Symptom:** Bot online, migrations OK, but `Failed to load handler command.ts`, `No command matching "role"` / `"syllabus"`, while `ping` / `course` work. Many `Error handling message reaction:` lines with no detail.

**Cause:** `src/index.ts` loaded handlers with `forEach(async …)` and called `client.login()` immediately — handlers raced startup. `command.ts` used `require()` inside an ESM module; one failing command file aborted the rest. Logtape did not print nested error messages on the second argument.

**Fix (app):** Await handlers sequentially before `client.login()`; load each command file with `import()` and per-file try/catch; log `${error.message}` in reaction handler errors.

**Prevent:** Do not use fire-and-forget `forEach(async)` for startup; register all Discord commands before accepting traffic.

______________________________________________________________________

## Open infra / Kennel work

- Postgres provisioner: role matching DynamicUser, `createdb -O`, `CREATE ON SCHEMA public`
- Governance registration for all migrated apps
- `approle.tf` + `bao-agent.nix` for remaining legacy services
- Remove `hosts/deploy-01/dalmatian.nix` after Kennel is stable
