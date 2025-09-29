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

function parseStartAt(input: string): number | null {
	const ts = Date.parse(input);
	if (!Number.isNaN(ts)) return ts;
	const n = Number(input);
	if (Number.isFinite(n)) return n;
	return null;
}

export const data = new SlashCommandBuilder()
	.setName("ctf-schedule")
	.setDescription("Manage CTF schedules (admin)")
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
	.addSubcommand((s) =>
		s
			.setName("add")
			.setDescription("Add a CTF schedule")
			.addStringOption((o) =>
				o.setName("name").setDescription("CTF name").setRequired(true)
			)
			.addStringOption((o) =>
				o.setName("url").setDescription("CTF URL").setRequired(true)
			)
			.addStringOption((o) =>
				o
					.setName("description")
					.setDescription("CTF description")
					.setRequired(true)
			)
			.addStringOption((o) =>
				o
					.setName("startat")
					.setDescription("Start time (ISO or millis)")
					.setRequired(true)
			)
	)
	.addSubcommand((s) =>
		s
			.setName("update")
			.setDescription("Update an existing CTF schedule time")
			.addStringOption((o) =>
				o.setName("name").setDescription("CTF name").setRequired(true)
			)
			.addStringOption((o) =>
				o
					.setName("startat")
					.setDescription("New start time (ISO or millis)")
					.setRequired(true)
			)
	)
	.addSubcommand((s) =>
		s
			.setName("remove")
			.setDescription("Remove a scheduled CTF")
			.addStringOption((o) =>
				o.setName("name").setDescription("CTF name").setRequired(true)
			)
	)
	.addSubcommand((s) => s.setName("list").setDescription("List schedules"));

export async function execute(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply({ ephemeral: true });
	const sub = interaction.options.getSubcommand();
	ctfQueueManager.loadQueue();
	const queue = ctfQueueManager.getQueue();

	if (sub === "add") {
		const name = interaction.options.getString("name", true);
		const url = interaction.options.getString("url", true);
		const description = interaction.options.getString("description", true);
		const startAtStr = interaction.options.getString("startat", true);
		const ts = parseStartAt(startAtStr);
		if (ts === null) {
			await interaction.editReply("Invalid startAt. Use ISO or millis.");
			return;
		}
		const startAt = new Date(ts).toISOString();
		const existing = queue.find((q: any) => q.name === name);
		if (existing) {
			existing.url = url;
			existing.description = description;
			existing.startAt = startAt;
			existing.started = existing.started ?? false;
			existing.guildId = interaction.guildId || existing.guildId || "";
			ctfQueueManager.saveQueue();
			await interaction.editReply(`Updated schedule for ${name}.`);
		} else {
			ctfQueueManager.addToQueue({
				name,
				url,
				description,
				createdAt: new Date().toISOString(),
				startAt,
				started: false,
				guildId: interaction.guildId || "",
			});
			await interaction.editReply(`Added schedule for ${name}.`);
		}
		return;
	}

	if (sub === "update") {
		const name = interaction.options.getString("name", true);
		const startAtStr = interaction.options.getString("startat", true);
		const ts = parseStartAt(startAtStr);
		if (ts === null) {
			await interaction.editReply("Invalid startAt. Use ISO or millis.");
			return;
		}
		const startAt = new Date(ts).toISOString();
		const existing = queue.find((q: any) => q.name === name);
		if (!existing) {
			await interaction.editReply("CTF not found in schedule.");
			return;
		}
		existing.startAt = startAt;
		ctfQueueManager.saveQueue();
		await interaction.editReply(`Updated schedule for ${name}.`);
		return;
	}

	if (sub === "remove") {
		const name = interaction.options.getString("name", true);
		const idx = queue.findIndex((q: any) => q.name === name);
		if (idx === -1) {
			await interaction.editReply("CTF not found in schedule.");
			return;
		}
		queue.splice(idx, 1);
		ctfQueueManager.saveQueue();
		await interaction.editReply(`Removed schedule for ${name}.`);
		return;
	}

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
