import { SQL } from "bun";

// Kennel and devenv use unix-socket URLs like postgresql:///dbname?host=/run/postgresql.
// Bun mishandles that string form and falls back to TCP password auth.
const UNIX_SOCKET_URL = /^postgresql:\/\/(?:[^@/]*@)?\/([^?]+)\?host=(.+)$/;

function createSocketClient(database: string, socketPath: string): SQL {
    // Bun still parses DATABASE_URL from the environment when options are passed,
    // treating ?host= as a Postgres GUC ("unrecognized configuration parameter host").
    delete process.env.DATABASE_URL;

    return new SQL({
        database,
        path: socketPath,
    });
}

export function createSqlClient(): SQL {
    if (process.env.PGHOST) {
        if (!process.env.PGDATABASE) {
            throw new Error("PGDATABASE must be set when PGHOST is set");
        }

        return createSocketClient(process.env.PGDATABASE, process.env.PGHOST);
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        throw new Error("DATABASE_URL or PGHOST/PGDATABASE environment variables must be set");
    }

    const unixMatch = databaseUrl.match(UNIX_SOCKET_URL);
    if (unixMatch) {
        return createSocketClient(unixMatch[1], unixMatch[2]);
    }

    return new SQL(databaseUrl);
}
