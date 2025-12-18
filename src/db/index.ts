import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";

if (!process.env.DATABASE_URL && !process.env.PGHOST) {
    throw new Error(
        "DATABASE_URL or PGHOST/PGDATABASE environment variables must be set",
    );
}

// dev uses DATABASE_URL from .env
// prod uses PGHOST/PGDATABASE env vars set by NixOS module
const client = process.env.DATABASE_URL
    ? new SQL(process.env.DATABASE_URL)
    : new SQL({
          database: process.env.PGDATABASE,
          path: process.env.PGHOST,
      });

export const db = drizzle({ client });

export * from "./schema.ts";

// Shutdown handlers
process.on("SIGINT", async () => {
    await client.close();
    process.exit(0);
});

process.on("SIGTERM", async () => {
    await client.close();
    process.exit(0);
});
