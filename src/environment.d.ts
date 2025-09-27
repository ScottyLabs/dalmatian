declare global {
    namespace NodeJS {
        interface ProcessEnv {
            readonly DISCORD_TOKEN: string;
            readonly DISCORD_CLIENT_ID: string;
            readonly GOOGLE_MAPS_API_KEY: string;
        }
    }
}

export {};
