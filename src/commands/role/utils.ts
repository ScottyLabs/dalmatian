import { ChatInputCommandInteraction, GuildMember } from "discord.js";

export function lookup(
    interaction: ChatInputCommandInteraction,
    roleName: string,
): GuildMember[] {
    const role = interaction.guild!.roles.cache.find(
        (r) => r.name === roleName,
    );

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
