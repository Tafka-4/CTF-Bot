import { SlashCommandBuilder } from "@discordjs/builders";
import {
	ChatInputCommandInteraction,
	ChannelType,
	TextChannel,
	PermissionFlagsBits,
	EmbedBuilder,
} from "discord.js";
import { serverDataStorage } from "../utils/storage.js";

export const data = new SlashCommandBuilder()
	.setName("setnotice")
	.setDescription("CTF Notice Channel Setting")
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
	.addSubcommand((subcommand) =>
		subcommand
			.setName("set")
			.setDescription("Notice Channel Setting")
			.addChannelOption((option) =>
				option
					.setName("channel")
					.setDescription("Notice Channel Setting")
					.setRequired(true)
					.addChannelTypes(ChannelType.GuildText)
			)
	)
	.addSubcommand((subcommand) =>
		subcommand
			.setName("check")
			.setDescription("Current Notice Channel Setting")
	)
	.addSubcommand((subcommand) =>
		subcommand
			.setName("reset")
			.setDescription("Notice Channel Setting Reset")
	);

export async function execute(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply({ ephemeral: true });

	const subcommand = interaction.options.getSubcommand();

	if (subcommand === "set") {
		const channel = interaction.options.getChannel(
			"channel",
			true
		) as TextChannel;

		if (!channel) {
			await interaction.editReply("❌ Please specify a valid channel.");
			return;
		}

		const botMember = interaction.guild?.members.me;
		if (!botMember) {
			await interaction.editReply(
				"❌ Bot information cannot be obtained."
			);
			return;
		}

		if (
			!channel
				.permissionsFor(botMember)
				.has(PermissionFlagsBits.SendMessages)
		) {
			await interaction.editReply(
				`❌ ${channel} channel does not have permission to send messages.`
			);
			return;
		}

		const existingChannelId = serverDataStorage.getNoticeChannelId();

		serverDataStorage.setNoticeChannelId(channel.id);

		let responseMessage = `✅ Notice channel set to ${channel}!`;

		if (existingChannelId && existingChannelId !== channel.id) {
			responseMessage += `\n⚠️ Existing channel <#${existingChannelId}> settings have been changed.`;
		}

		await interaction.editReply(responseMessage);
		return;
	}

	if (subcommand === "check") {
		const noticeChannelId = serverDataStorage.getNoticeChannelId();

		if (noticeChannelId) {
			try {
				const channel = await interaction.guild?.channels.fetch(
					noticeChannelId
				);
				if (channel) {
					const embed = new EmbedBuilder()
						.setTitle("📋 Current Notice Channel Setting")
						.setDescription(
							`🔔 Notice Channel: <#${noticeChannelId}>`
						)
						.setColor(0x0099ff)
						.setTimestamp();

					await interaction.editReply({ embeds: [embed] });
					return;
				}
			} catch (error) {}
			return;
		}

		const embed = new EmbedBuilder()
			.setTitle("📋 Current Notice Channel Setting")
			.setDescription(
				"❌ Notice channel is not set.\n`/setnotice set <channel>` command to set."
			)
			.setColor(0xff6b6b)
			.setTimestamp();

		await interaction.editReply({ embeds: [embed] });
		return;
	}

	if (subcommand === "reset") {
		serverDataStorage.clearNoticeChannel();
		await interaction.editReply("✅ Notice channel setting reset.");
		return;
	}
}
