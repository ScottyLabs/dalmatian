import { drizzle } from "drizzle-orm/postgres-js";
import { createSqlClient } from "./client.ts";

const client = createSqlClient();

export const db = drizzle({ client });

export * from "./schema.ts";

// Shutdown handlers
process.on("SIGINT", async () => {
    await client.end();
    process.exit(0);
});

process.on("SIGTERM", async () => {
    await client.end();
    process.exit(0);
});
