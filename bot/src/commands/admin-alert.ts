import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { serverDataStorage } from "../utils/storage.js";

export const data = new SlashCommandBuilder()
	.setName("admin-alert")
	.setDescription("Set or show the admin alert channel")
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	.addSubcommand((s) =>
		s
			.setName("set")
			.setDescription("Set this channel as admin alert channel")
	)
	.addSubcommand((s) =>
		s.setName("show").setDescription("Show current setting")
	);

export async function execute(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply({ ephemeral: true });
	const sub = interaction.options.getSubcommand();
	if (sub === "set") {
		if (!interaction.channelId) {
			await interaction.editReply("No channel context.");
			return;
		}
		serverDataStorage.update((cur) => ({
			...cur,
			adminAlertChannelId: interaction.channelId,
		}));
		await interaction.editReply("Admin alert channel set to this channel.");
		return;
	}
	if (sub === "show") {
		const cur = serverDataStorage.read();
		await interaction.editReply(
			cur.adminAlertChannelId
				? `Admin alert channel: <#${cur.adminAlertChannelId}>`
				: "Admin alert channel not set."
		);
	}
}
