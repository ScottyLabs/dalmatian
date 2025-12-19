declare global {
    namespace NodeJS {
        interface ProcessEnv {
            readonly DATABASE_URL: string;
            readonly PGDATABASE: string;
            readonly PGHOST: string;
            readonly DISCORD_TOKEN: string;
            readonly DISCORD_CLIENT_ID: string;
            readonly GOOGLE_MAPS_API_KEY: string;
        }
    }
}

export {};
