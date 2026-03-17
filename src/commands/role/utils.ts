import { Guild, GuildMember } from "discord.js";

export function lookup(guild: Guild, roleName: string): GuildMember[] {
    const role = guild.roles.cache.find((r) => r.name === roleName);

    if (!role) {
        throw new Error(`Role not found: ${roleName}`);
    }

    return role.members.map(
        (member) =>
            ({
                id: member.id,
                displayName: member.displayName,
                user: {
                    username: member.user.username,
                },
            }) as GuildMember,
    );
}

export function equals(a: GuildMember, b: GuildMember): boolean {
    return a.id === b.id;
}

// TODO: fuzzy matching
export function getRolesFuzzyMatching(
    guild: Guild,
    roleName: string,
): string[] {
    const roleNames = guild.roles.cache.map((role) => role.name);

    const filtered = roleNames.filter((name) =>
        name.toLowerCase().includes(roleName.toLowerCase()),
    );

    return filtered.slice(0, 25);
}
