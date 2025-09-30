import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction, EmbedBuilder, Guild } from "discord.js";
import { ctfQueueManager } from "../../utils/ctfQueueManager.js";
import { serverDataStorage, type CTFItem } from "../../utils/storage.js";
import {
	createCTFTopic,
	retireThread,
	getCurrentForumChannel,
	retireForum,
} from "../../utils/ctfThreads.js";

export const data = new SlashCommandBuilder()
	.setName("ctfstart")
	.setDescription("Start a specific pending CTF from the queue")
	.addIntegerOption((opt) =>
		opt
			.setName("index")
			.setDescription("Queue index to start (as shown in /ctfqueue)")
			.setRequired(true)
	);

export async function execute(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply();

	if (!interaction.guild) {
		await interaction.editReply(
			"This command can only be used in a server."
		);
		return;
	}

	ctfQueueManager.loadQueue();
	const index = interaction.options.getInteger("index", true) - 1;
	const queue = ctfQueueManager.getQueue();

	if (index < 0 || index >= queue.length) {
		await interaction.editReply(
			"Invalid index. Use /ctfqueue to check indices."
		);
		return;
	}

	const target = queue[index] as CTFItem;
	if (!target || target.pending !== true) {
		await interaction.editReply(
			"Selected item is not pending or not found."
		);
		return;
	}

	const currentCTF = ctfQueueManager.getCurrent();
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

			// 현재 포럼 전체를 RETIRED로 이동 기록
			try {
				const forum = await getCurrentForumChannel(
					interaction.guild as Guild
				);
				if (forum) await retireForum(interaction.guild as Guild, forum);
			} catch {}
		} catch (error) {
			console.error("Error retiring current CTF threads:", error);
		}
	}

	// 큐에서 대상 제거 후 current로 승격
	const updatedQueue = queue.filter((_, i) => i !== index);
	(ctfQueueManager as any).queue = updatedQueue;
	ctfQueueManager.saveQueue();

	const startedCTF = { ...target, started: true, pending: false } as CTFItem;
	ctfQueueManager.setCurrent(startedCTF);
	ctfQueueManager.appendHistory(startedCTF);

	try {
		await createCTFTopic(interaction.guild as Guild, startedCTF.name);
	} catch (error) {
		console.error("Error creating new CTF forum:", error);
	}

	try {
		const embed = new EmbedBuilder()
			.setTitle("🚀 CTF Started")
			.setColor(0x00ff88)
			.setDescription(
				`Selected pending CTF has been started and is now active!`
			)
			.addFields(
				{ name: "Current CTF", value: startedCTF.name, inline: true },
				{
					name: "URL",
					value: `[${startedCTF.url}](${startedCTF.url})`,
					inline: true,
				}
			)
			.setTimestamp();

		await serverDataStorage.sendNoticeMessage(interaction.client, "", {
			embeds: [embed],
		});
	} catch (error) {
		console.error("Error sending CTF start notice:", error);
	}

	await interaction.editReply(`✅ Started CTF: **${startedCTF.name}**`);
}
