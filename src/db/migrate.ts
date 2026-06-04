import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { logger, nodeError } from "../utils/log.ts";

export const runMigrations = async () => {
    if (!process.env.DATABASE_URL && !process.env.PGHOST) {
        throw new Error("DATABASE_URL or PGHOST/PGDATABASE environment variables must be set");
    }

    logger.info("Running database migrations...");

    // Create Drizzle instance with Bun SQL client
    const migrationClient = process.env.DATABASE_URL
        ? new SQL(process.env.DATABASE_URL)
        : new SQL({
              database: process.env.PGDATABASE,
              path: process.env.PGHOST,
          });

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
