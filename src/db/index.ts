import { drizzle } from "drizzle-orm/bun-sql";
import { createSqlClient } from "./client.ts";

const client = createSqlClient();

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
