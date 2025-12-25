import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    CommandInteraction,
    ComponentType,
    EmbedBuilder,
} from "discord.js";

export class EmbedPaginator {
    pages: EmbedBuilder[];
    current = 0;

    constructor(pages: EmbedBuilder[]) {
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
                .setLabel("<<")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disableAll || atStart),
            new ButtonBuilder()
                .setCustomId("prev")
                .setLabel("<")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disableAll || atStart),
            new ButtonBuilder()
                .setCustomId("info")
                .setLabel(`${this.current + 1}/${this.pages.length}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId("next")
                .setLabel(">")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disableAll || atEnd),
            new ButtonBuilder()
                .setCustomId("last")
                .setLabel(">>")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disableAll || atEnd),
        );
    }

    public async send(interaction: CommandInteraction) {
        if (this.pages.length == 1) {
            await interaction.reply({
                embeds: [this.pages[0]!],
            });
            return;
        }

        await interaction.reply({
            embeds: [this.pages[this.current]!],
            components: [this.buildButtons()],
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

            if (btnInteraction.customId == "next") {
                this.current++;
                this.current %= this.pages.length;
            } else if (btnInteraction.customId == "prev") {
                this.current--;
                this.current %= this.pages.length;
            } else if (btnInteraction.customId == "first") {
                this.current = 0;
            } else if (btnInteraction.customId == "last") {
                this.current = this.pages.length - 1;
            }

            await btnInteraction.update({
                embeds: [this.pages[this.current]!],
                components: [this.buildButtons()],
            });
        });

        collector.on("end", async () => {
            await message.edit({ components: [this.buildButtons(true)] });
        });
    }
}
