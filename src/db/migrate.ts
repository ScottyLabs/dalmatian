import { drizzle } from "drizzle-orm/postgres-js";
import { join } from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { logger, nodeError } from "../utils/log.ts";
import { createSqlClient } from "./client.ts";

export const runMigrations = async () => {
    logger.info("Running database migrations...");

    const migrationClient = createSqlClient();
    const db = drizzle({ client: migrationClient });

    try {
        await migrate(db, { migrationsFolder: join(import.meta.dirname!, "../../drizzle") });
        logger.info("Migrations completed successfully!");
    } catch (error) {
        logger.fatal("Migration failed: {error}", { error: nodeError(error) });
        throw error;
    } finally {
        await migrationClient.end();
    }
};

// Run directly if this is the main module
if (import.meta.main) {
    runMigrations()
        .then(() => Deno.exit(0))
        .catch((err) => {
            logger.fatal("Migration error: {error}", { error: nodeError(err) });
            Deno.exit(1);
        });
}
