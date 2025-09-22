declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly DISCORD_TOKEN: string;
      readonly DISCORD_CLIENT_ID: string;
    }
  }
}

export {};
