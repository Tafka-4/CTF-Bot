import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction, EmbedBuilder, Guild } from "discord.js";
import { ctfQueueManager } from "../../utils/ctfQueueManager.js";
import { createCTFTopic, retireThread } from "../../utils/ctfThreads.js";
import { serverDataStorage } from "../../utils/storage.js";

export const data = new SlashCommandBuilder()
	.setName("ctfskip")
	.setDescription("Skip current CTF and set next CTF as current");

export async function execute(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply();

	if (!interaction.guild) {
		await interaction.editReply(
			"This command can only be used in a server."
		);
		return;
	}

	ctfQueueManager.loadQueue();
	const currentCTF = ctfQueueManager.getCurrent();
	const next = ctfQueueManager.popFromQueue();

	if (!next) {
		await interaction.editReply("Queue is empty.");
		return;
	}

	if (currentCTF) {
		try {
			const serverData = serverDataStorage.read();
			const managementThreadId =
				serverData.ctfManagementByName?.[currentCTF.name];
			const generalThreadId =
				serverData.ctfThreadsByName?.[currentCTF.name];
			const noticeThreadId =
				serverData.ctfNoticeByName?.[currentCTF.name];

			if (managementThreadId) {
				await retireThread(
					interaction.guild as Guild,
					managementThreadId
				);
			}
			if (generalThreadId) {
				await retireThread(interaction.guild as Guild, generalThreadId);
			}
			if (noticeThreadId) {
				await retireThread(interaction.guild as Guild, noticeThreadId);
			}

			serverDataStorage.update((cur) => {
				const newData = { ...cur };
				if (newData.ctfManagementByName) {
					delete newData.ctfManagementByName[currentCTF.name];
				}
				if (newData.ctfThreadsByName) {
					delete newData.ctfThreadsByName[currentCTF.name];
				}
				if (newData.ctfNoticeByName) {
					delete newData.ctfNoticeByName[currentCTF.name];
				}
				return newData;
			});
		} catch (error) {
			console.error("Error retiring current CTF threads:", error);
		}
	}

	next.started = true;
	next.pending = false;
	ctfQueueManager.setCurrent(next);
	ctfQueueManager.appendHistory(next);

	try {
		await createCTFTopic(interaction.guild as Guild, next.name);
	} catch (error) {
		console.error("Error creating new CTF forum:", error);
	}

	try {
		const embed = new EmbedBuilder()
			.setTitle("🔄 CTF Changed")
			.setColor(0xffa500)
			.setDescription(
				`Previous CTF has been skipped and a new CTF is now active!`
			)
			.addFields(
				{
					name: "Previous CTF",
					value: currentCTF?.name || "None",
					inline: true,
				},
				{
					name: "New CTF",
					value: `[${next.name}](${next.url})`,
					inline: true,
				}
			)
			.setTimestamp();

		const success = await serverDataStorage.sendNoticeMessage(
			interaction.client,
			"",
			{ embeds: [embed] }
		);

		if (!success) {
			console.log("Failed to send CTF change notice");
		}
	} catch (error) {
		console.error("Error sending CTF change notification:", error);
	}

	await interaction.editReply(
		`✅ Current CTF changed to: **${next.name}**\n📝 Previous CTF threads have been archived.`
	);
}
