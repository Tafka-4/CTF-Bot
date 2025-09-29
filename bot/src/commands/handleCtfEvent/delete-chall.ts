import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { serverDataStorage } from "../../utils/storage.js";

export const data = new SlashCommandBuilder()
	.setName("delete-chall")
	.setDescription("Delete the current challenge post from this thread");

export async function execute(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply({ ephemeral: true });
	const channelId = interaction.channelId;
	const server = serverDataStorage.read();
	const list = (server.problems?.[channelId] as any[]) ?? [];
	if (list.length === 0) {
		await interaction.editReply("No challenge found in this thread.");
		return;
	}
	const latest = list[0];

	// Permission: only post creator or admins can delete
	const isAdmin = Boolean(
		interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
			interaction.memberPermissions?.has(
				PermissionFlagsBits.ManageMessages
			) ||
			interaction.memberPermissions?.has(
				PermissionFlagsBits.ManageChannels
			)
	);
	if (latest.authorId !== interaction.user.id && !isAdmin) {
		await interaction.editReply(
			"Only the creator of this challenge or an admin can delete it."
		);
		return;
	}
	// Try to delete the posted message if exists
	if (
		latest.messageId &&
		interaction.channel &&
		interaction.channel.isTextBased()
	) {
		try {
			const msg = await interaction.channel.messages.fetch(
				latest.messageId
			);
			if (msg) await msg.delete();
		} catch {}
	}
	serverDataStorage.update((cur) => {
		const problems = cur.problems ?? {};
		const arr = (problems[channelId] as any[]) ?? [];
		arr.shift();
		if (arr.length === 0) delete problems[channelId];
		else problems[channelId] = arr;
		return { ...cur, problems };
	});
	await interaction.editReply("Challenge post deleted.");
}
