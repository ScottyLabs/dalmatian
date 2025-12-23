import {
    ActionRowBuilder,
    type APIEmbed,
    ButtonBuilder,
    ButtonStyle,
    CommandInteraction,
    ComponentType,
} from "discord.js";

export class EmbedPaginator {
    pages: APIEmbed[];
    current = 0;

    constructor(pages: APIEmbed[]) {
        if (pages.length == 0) {
            throw new Error("No embed pages provided");
        }
        this.pages = pages;
    }

    private buildButtons(disableAll = false): ActionRowBuilder<ButtonBuilder> {
        const atStart = this.current == 0;
        const atEnd = this.current == this.pages.length - 1;

        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId("first")
                .setLabel("First")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disableAll || atStart),
            new ButtonBuilder()
                .setCustomId("prev")
                .setLabel("Previous")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disableAll || atStart),
            new ButtonBuilder()
                .setCustomId("info")
                .setLabel(`${this.current + 1}/${this.pages.length}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId("next")
                .setLabel("Next")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disableAll || atEnd),
            new ButtonBuilder()
                .setCustomId("last")
                .setLabel("Last")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disableAll || atEnd),
        );
    }

    private async send(interaction: CommandInteraction) {
        const row = this.buildButtons();

        await interaction.reply({
            embeds: [this.pages[this.current]!],
            components: [row],
        });

        const message = await interaction.fetchReply();

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 3_600_000, // 1 hour
        });

        collector.on("collect", async (btnInteraction) => {
            if (btnInteraction.user.id !== interaction.user.id) {
                await btnInteraction.reply({
                    content: "These buttons are not for you!",
                    ephemeral: true,
                });
                return;
            }

            if (btnInteraction.customId === "next") {
                this.current++;
            } else if (btnInteraction.customId === "prev") {
                this.current--;
            }
            this.current %= this.pages.length;

            await btnInteraction.update({
                embeds: [this.pages[this.current]!],
                components: [row],
            });
        });

        collector.on("end", async () => {
            await message.edit({ components: [this.buildButtons(true)] });
        });
    }
}
