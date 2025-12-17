import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";

export const runMigrations = async () => {
    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL environment variable is not set");
    }

    console.log("Running database migrations...");

    // Create Drizzle instance with Bun SQL client
    const migrationClient = new SQL(process.env.DATABASE_URL);
    const db = drizzle({ client: migrationClient });

    try {
        await migrate(db, { migrationsFolder: "./drizzle" });
        console.log("Migrations completed successfully!");
    } catch (error) {
        console.error("Migration failed:", error);
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
            console.error("Migration error:", err);
            process.exit(1);
        });
}
