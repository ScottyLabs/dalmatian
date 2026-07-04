import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { SlashCommand } from "../types.d.ts";
import { PollSetupForm } from "../utils/pollSetupForm.ts";

// Standalone command (not a /poll subcommand) so it can use native default_member_permissions.
const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName("pollsetup")
        .setDescription("Configure the polls channel for this server")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction) {
        const form = new PollSetupForm(interaction);
        await form.start();
    },
};

export default command;
