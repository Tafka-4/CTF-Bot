import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { ctfQueueManager } from "../../utils/ctfQueueManager.js";
import type { CTFItem } from "../../utils/storage.js";

export const data = new SlashCommandBuilder()
	.setName("ctfqueue")
	.setDescription("Show queued CTF items");

export async function execute(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply({ ephemeral: true });
	ctfQueueManager.loadQueue();
	const q = ctfQueueManager.getQueue();
	if (q.length === 0) {
		await interaction.editReply("Queue is empty.");
		return;
	}
	const lines = q.map(
		(v: CTFItem, i: number) =>
			`${i + 1}. ${v.name} - ${v.url}${v.pending ? " **[PENDING]**" : ""}`
	);
	await interaction.editReply(lines.join("\n"));
}
