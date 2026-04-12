import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    CommandInteraction,
    EmbedBuilder,
    MessageActionRowComponentBuilder,
    MessageComponentInteraction,
    MessageFlags,
} from "discord.js";

// Return true if the embed should render and false otherwise
type CollectHandler = (
    interaction: MessageComponentInteraction,
) => Promise<boolean>;

type EndHandler = () => Promise<void>;

export class EmbedPaginator {
    private pages: EmbedBuilder[][] = [];
    private current;
    private verbose;
    private components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
    private onCollect;
    private onEnd;

    constructor({
        pages,
        components = [],
        verbose = false,
        onCollect = async (_) => false,
        onEnd = async () => {},
    }: {
        pages: EmbedBuilder[];
        components?: ActionRowBuilder<MessageActionRowComponentBuilder>[];
        verbose?: boolean;
        onCollect?: (
            interaction: MessageComponentInteraction,
        ) => Promise<boolean>;
        onEnd?: () => Promise<void>;
    }) {
        this.current = 0;
        this.verbose = verbose;
        this.components = components;
        this.onCollect = onCollect;
        this.onEnd = onEnd;
        this.setPages(pages);
    }

    public setPages(pages: EmbedBuilder[]) {
        this.current = 0;
        if (pages.length == 0) {
            throw new Error("No embed pages provided");
        }
        if (this.verbose) {
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

    private buildButtons(
        disableAll = false,
    ): ActionRowBuilder<MessageActionRowComponentBuilder> {
        const atStart = this.current == 0;
        const atEnd = this.current == this.pages.length - 1;

        return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
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

    private buildComponents(
        disableAll = false,
    ): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
        if (this.pages.length == 1) {
            return this.components;
        }
        return [...this.components, this.buildButtons(disableAll)];
    }

    private getRenderPayload(disableAll = false) {
        return {
            embeds: this.pages[this.current]!,
            components: this.buildComponents(disableAll),
        };
    }

    private handleNavigation(
        compInteraction: MessageComponentInteraction,
    ): boolean {
        if (!compInteraction.isButton()) {
            return false;
        }
        if (compInteraction.customId == "next") {
            this.current++;
            this.current %= this.pages.length;
            return true;
        }
        if (compInteraction.customId == "prev") {
            this.current--;
            this.current %= this.pages.length;
            return true;
        }
        if (compInteraction.customId == "first") {
            this.current = 0;
            return true;
        }
        if (compInteraction.customId == "last") {
            this.current = this.pages.length - 1;
            return true;
        }
        return false;
    }

    public async send(interaction: CommandInteraction) {
        const response = await interaction.reply({
            ...this.getRenderPayload(),
            withResponse: true,
        });

        const collector =
            response.resource!.message!.createMessageComponentCollector({
                time: 840_000, // 14 minutes
            });

        collector.on("collect", async (compInteraction) => {
            if (compInteraction.user.id !== interaction.user.id) {
                await compInteraction.reply({
                    content: "These options are not for you!",
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            let shouldRender = this.handleNavigation(compInteraction);

            if (this.onCollect) {
                shouldRender ||= await this.onCollect(compInteraction);
            }

            if (shouldRender) {
                await compInteraction.update(this.getRenderPayload());
                return;
            }

            await compInteraction.deferUpdate();
        });

        collector.on("end", async (_collected, reason) => {
            if (reason.includes("Delete")) return;
            if (this.onEnd) {
                await this.onEnd();
            }
            await interaction.editReply({
                components: this.buildComponents(true),
            });
        });
    }
}
