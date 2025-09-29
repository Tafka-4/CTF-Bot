import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { retireThread } from "../../utils/ctfThreads.js";

export const data = new SlashCommandBuilder()
	.setName("ctf-retire")
	.setDescription("Move this CTF thread to RETIRED category");

export async function execute(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply({ ephemeral: true });
	if (!interaction.guild) {
		await interaction.editReply("This command must be used in a guild.");
		return;
	}
	await retireThread(interaction.guild, interaction.channelId);
	await interaction.editReply("Thread moved to RETIRED category.");
}
