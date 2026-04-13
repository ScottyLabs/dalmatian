import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    CommandInteraction,
    ComponentType,
    EmbedBuilder,
    MessageFlags,
} from "discord.js";

export class EmbedPaginator {
    pages: EmbedBuilder[][];
    current = 0;

    constructor(pages: EmbedBuilder[], verbose = false) {
        if (pages.length == 0) {
            throw new Error("No embed pages provided");
        }
        if (verbose) {
            const verbosePages = [];
            let chunk: EmbedBuilder[] = [];
            for (const page of pages) {
                if (chunk.length >= 10) {
                    verbosePages.push(chunk);
                    chunk = [];
                }
                if (chunk.length > 0) {
                    page.setTitle(null);
                }
                chunk.push(page);
            }
            verbosePages.push(chunk);
            this.pages = verbosePages;
        } else {
            this.pages = pages.map((page) => [page]);
        }
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

    //TODO, this seems to be used in a few places, maybe abstract into a MessageUtils class or something
    private async respond(
        interaction: CommandInteraction,
        options: {
            embeds: EmbedBuilder[];
            components?: ActionRowBuilder<ButtonBuilder>[];
        },
    ) {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(options);
            return;
        }

        await interaction.reply({
            ...options,
        });
    }

    public async send(interaction: CommandInteraction) {
        if (this.pages.length == 1) {
            await this.respond(interaction, {
                embeds: this.pages[0]!,
            });
            return;
        }

        await this.respond(interaction, {
            embeds: this.pages[this.current]!,
            components: [this.buildButtons()],
        });

        const reply = await interaction.fetchReply();

        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 840_000, // 14 minutes
        });

        collector.on("collect", async (btnInteraction) => {
            if (btnInteraction.user.id !== interaction.user.id) {
                await btnInteraction.reply({
                    content: "These buttons are not for you!",
                    flags: MessageFlags.Ephemeral,
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
                embeds: this.pages[this.current]!,
                components: [this.buildButtons()],
            });
        });

        collector.on("end", async (_collected, reason) => {
            if (reason.includes("Delete")) return;
            await interaction.editReply({
                components: [this.buildButtons(true)],
            });
        });
    }
}
