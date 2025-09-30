import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import {
	retireThread,
	getCurrentForumChannel,
	retireForum,
} from "../../utils/ctfThreads.js";
import { ctfQueueManager } from "../../utils/ctfQueueManager.js";

export const data = new SlashCommandBuilder()
	.setName("ctf-retire")
	.setDescription("Move this CTF thread to RETIRED category");

export async function execute(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply();
	if (!interaction.guild) {
		await interaction.editReply("This command must be used in a guild.");
		return;
	}
	await retireThread(interaction.guild, interaction.channelId);

	try {
		const forum = await getCurrentForumChannel(interaction.guild);
		if (forum) {
			await retireForum(interaction.guild, forum);
		}
	} catch {}

	try {
		const current = ctfQueueManager.getCurrent();
		if (current) {
			ctfQueueManager.clearCurrent();
		}
	} catch {}

	await interaction.editReply(
		"CTF retired: forum moved to RETIRED and current cleared."
	);
}
