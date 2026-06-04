import { SQL } from "bun";

// Kennel and devenv use unix-socket URLs like postgresql:///dbname?host=/run/postgresql.
// Bun mishandles that string form and falls back to TCP password auth.
const UNIX_SOCKET_URL = /^postgresql:\/\/(?:[^@/]*@)?\/([^?]+)\?host=(.+)$/;

export function createSqlClient(): SQL {
    if (process.env.PGHOST) {
        if (!process.env.PGDATABASE) {
            throw new Error("PGDATABASE must be set when PGHOST is set");
        }

        return new SQL({
            database: process.env.PGDATABASE,
            path: process.env.PGHOST,
        });
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        throw new Error("DATABASE_URL or PGHOST/PGDATABASE environment variables must be set");
    }

    const unixMatch = databaseUrl.match(UNIX_SOCKET_URL);
    if (unixMatch) {
        return new SQL({
            database: unixMatch[1],
            path: unixMatch[2],
        });
    }

    return new SQL(databaseUrl);
}
