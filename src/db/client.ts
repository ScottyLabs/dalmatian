import postgres, { type Sql } from "postgres";

// Kennel and devenv use unix-socket URLs like postgresql:///dbname?host=/run/postgresql.
// postgres.js does not understand that query-string form, so we parse it out and
// pass the socket directory via the `host` option instead.
const UNIX_SOCKET_URL = /^postgresql:\/\/(?:[^@/]*@)?\/([^?]+)\?host=(.+)$/;

function createSocketClient(database: string, socketPath: string): Sql {
    return postgres({
        host: socketPath,
        database,
    });
}

export function createSqlClient(): Sql {
    const pgHost = Deno.env.get("PGHOST");
    const pgDatabase = Deno.env.get("PGDATABASE");

    if (pgHost && pgDatabase) {
        return createSocketClient(pgDatabase, pgHost);
    }

    const databaseUrl = Deno.env.get("DATABASE_URL");
    if (!databaseUrl) {
        throw new Error("DATABASE_URL or PGHOST/PGDATABASE environment variables must be set");
    }

    const unixMatch = databaseUrl.match(UNIX_SOCKET_URL);
    const [, database, socketPath] = unixMatch ?? [];
    if (database && socketPath) {
        return createSocketClient(database, socketPath);
    }

    return postgres(databaseUrl);
}
