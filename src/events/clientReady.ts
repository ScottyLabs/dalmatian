import { Client, Collection, Events, Guild, Role } from "discord.js";
import type { Event } from "../types.d.ts";

const cacheRoles = (guild: Guild) =>
    guild.roles.fetch().then((roles: Collection<string, Role>) => roles.size);

const cacheGuildRoles = (client: Client) =>
    client.guilds.fetch().then((guilds) =>
        Promise.all(
            [...guilds.values()].map((g) => g.fetch().then(cacheRoles)),
        ).then((roleCounts) => {
            const totalRoles = roleCounts.reduce(
                (sum, count) => sum + count,
                0,
            );
            console.log(
                `Fetched and cached ${totalRoles} roles across ${guilds.size} guilds.`,
            );
        }),
    );

const event: Event<Events.ClientReady> = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        cacheGuildRoles(client);
        console.log(`Logged in as ${client.user.tag}`);
    },
};

export default event;
