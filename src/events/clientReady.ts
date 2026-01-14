import {
    Client,
    Collection,
    Events,
    Guild,
    GuildMember,
    Role,
} from "discord.js";
import type { Event } from "../types.d.ts";

const cacheRoles = (guild: Guild) =>
    guild.roles.fetch().then((roles: Collection<string, Role>) => roles.size);

const cacheMembers = (guild: Guild) =>
    guild.members
        .fetch()
        .then((members: Collection<string, GuildMember>) => members.size);

const cacheGuildItems = (guild: Guild) =>
    Promise.all([cacheRoles(guild), cacheMembers(guild)]).then(
        ([roleCount, memberCount]) => {
            console.log(
                `Cached ${roleCount} roles and ${memberCount} members for guild: ${guild.name}`,
            );
        },
    );

const cacheGuilds = (client: Client) =>
    client.guilds
        .fetch()
        .then((guilds) =>
            Promise.all(
                [...guilds.values()].map((g) =>
                    g.fetch().then(cacheGuildItems),
                ),
            ),
        );

const event: Event<Events.ClientReady> = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        cacheGuilds(client);
        console.log(`Logged in as ${client.user.tag}`);
    },
};

export default event;
