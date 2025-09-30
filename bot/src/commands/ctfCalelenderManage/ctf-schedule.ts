import { SlashCommandBuilder } from "@discordjs/builders";
import {
	ChatInputCommandInteraction,
	PermissionFlagsBits,
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
} from "discord.js";
import { ctfQueueManager } from "../../utils/ctfQueueManager.js";

export const data = new SlashCommandBuilder()
	.setName("ctf-schedule")
	.setDescription("List CTF schedules")
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
	.addSubcommand((s) => s.setName("list").setDescription("List schedules"));

export async function execute(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply({ ephemeral: true });
	const sub = interaction.options.getSubcommand();
	ctfQueueManager.loadQueue();
	const queue = ctfQueueManager.getQueue();

	if (sub === "list") {
		const all = [...queue]
			.filter((q: any) => q.startAt)
			.sort(
				(a: any, b: any) =>
					Date.parse(a.startAt) - Date.parse(b.startAt)
			);
		if (all.length === 0) {
			await interaction.editReply("No scheduled CTFs.");
			return;
		}
		const pageSize = 5;
		let page = 0;
		const totalPages = Math.max(1, Math.ceil(all.length / pageSize));

		const buildEmbed = (p: number) => {
			const embed = new EmbedBuilder()
				.setTitle("CTF Schedule")
				.setColor(0xff69b4) // pink accent
				.setTimestamp(new Date())
				.setFooter({ text: `Page ${p + 1}/${totalPages}` });
			const slice = all.slice(p * pageSize, p * pageSize + pageSize);
			for (const q of slice) {
				const start = new Date(q.startAt as string);
				const now = new Date();
				const diffMs = start.getTime() - now.getTime();
				const sign = diffMs >= 0 ? "in" : "ago";
				const abs = Math.abs(diffMs);
				const hrs = Math.floor(abs / 3600000);
				const mins = Math.floor((abs % 3600000) / 60000);
				const rel = `${hrs}h ${mins}m ${sign}`;
				embed.addFields({
					name: `${q.name} ${q.started ? "(started)" : "(pending)"}`,
					value: `Start: ${start.toISOString()}\n${rel}\nURL: ${
						q.url
					}`,
				});
			}
			return embed;
		};

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(`sched-prev:${page}`)
				.setStyle(ButtonStyle.Secondary)
				.setLabel("Prev")
				.setDisabled(page === 0),
			new ButtonBuilder()
				.setCustomId(`sched-next:${page}`)
				.setStyle(ButtonStyle.Primary)
				.setLabel("Next")
				.setDisabled(totalPages <= 1)
		);

		await interaction.editReply({
			embeds: [buildEmbed(page)],
			components: [row],
		});
		return;
	}
}
