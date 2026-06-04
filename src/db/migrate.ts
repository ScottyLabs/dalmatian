import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { logger, nodeError } from "../utils/log.ts";
import { createSqlClient } from "./client.ts";

export const runMigrations = async () => {
    logger.info("Running database migrations...");

    const migrationClient = createSqlClient();
    const db = drizzle({ client: migrationClient });

    try {
        await migrate(db, { migrationsFolder: "./drizzle" });
        logger.info("Migrations completed successfully!");
    } catch (error) {
        logger.fatal("Migration failed:", nodeError(error));
        throw error;
    } finally {
        await migrationClient.close();
    }
};

// Run directly if this is the main module
if (import.meta.main) {
    runMigrations()
        .then(() => process.exit(0))
        .catch((err) => {
            logger.fatal("Migration error:", nodeError(err));
            process.exit(1);
        });
}
