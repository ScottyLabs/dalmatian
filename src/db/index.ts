import { drizzle } from "drizzle-orm/postgres-js";
import { createSqlClient } from "./client.ts";

const client = createSqlClient();

export const db = drizzle({ client });

export * from "./schema.ts";

// Shutdown handlers
Deno.addSignalListener("SIGINT", async () => {
    await client.end();
    Deno.exit(0);
});

Deno.addSignalListener("SIGTERM", async () => {
    await client.end();
    Deno.exit(0);
});
