import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set");
}

// Create Drizzle instance with Bun SQL client
const client = new SQL(process.env.DATABASE_URL);
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
