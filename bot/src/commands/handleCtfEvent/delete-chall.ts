import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { serverDataStorage } from "../../utils/storage.js";
import { ensureForumThreadContext } from "../../utils/interactionGuards.js";

export const data = new SlashCommandBuilder()
	.setName("delete-chall")
	.setDescription("Delete the current challenge post from this thread");

export async function execute(interaction: ChatInputCommandInteraction) {
	const thread = await ensureForumThreadContext(interaction);
	if (!thread) return;

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
		const next = { ...cur };
		const problems = { ...(cur.problems ?? {}) } as Record<string, any[]>;
		const clues = { ...(cur.clues ?? {}) } as Record<string, any[]>;
		const participants = {
			...(cur.participantsByThread ?? {}),
		} as Record<string, string[]>;
		const contributors = {
			...(cur.contributorsByThread ?? {}),
		} as Record<string, { userId: string; userName: string }[]>;
		const firstbloodInfo = { ...(cur.firstbloodInfo ?? {}) } as Record<
			string,
			any
		>;
		const firstbloodByForum = { ...(cur.firstbloodByForum ?? {}) } as Record<
			string,
			any
		>;

		delete problems[channelId];
		delete clues[channelId];
		delete participants[channelId];
		delete contributors[channelId];
		delete firstbloodInfo[channelId];

		for (const [forumId, entry] of Object.entries(firstbloodByForum)) {
			if (entry?.threadId === channelId) {
				delete firstbloodByForum[forumId];
			}
		}

		const solves = (cur.solves ?? []).filter(
			(s) => s.threadId !== channelId
		);

		return {
			...next,
			problems,
			clues,
			participantsByThread: participants,
			contributorsByThread: contributors,
			solves,
			firstbloodInfo,
			firstbloodByForum,
		};
	});

	try {
		await thread.delete("Challenge removed via /delete-chall");
	} catch (error) {
		console.error("Failed to delete thread during delete-chall:", error);
	}

	await interaction.editReply("Challenge thread deleted.");
}
