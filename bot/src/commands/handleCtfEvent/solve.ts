import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { serverDataStorage } from "../../utils/storage.js";
import { updateChallengeMessageStatus } from "../../utils/challengeFlow.js";
import { ensureForumThreadContext } from "../../utils/interactionGuards.js";

export const data = new SlashCommandBuilder()
	.setName("solve")
	.setDescription("Submit a flag for the current challenge")
	.addStringOption((o) =>
		o.setName("flag").setDescription("Flag to submit").setRequired(true)
	);

export async function execute(interaction: ChatInputCommandInteraction) {
	const thread = await ensureForumThreadContext(interaction);
	if (!thread) return;

	await interaction.deferReply({ ephemeral: true });
	const flag = interaction.options.getString("flag", true);
	const guildId = interaction.guildId as string;
	const user = interaction.user;

	const record = {
		threadId: interaction.channelId,
		solverId: user.id,
		solverName: `${user.username}`,
		flag,
		timestamp: new Date().toISOString(),
	};

	const forumId: string | undefined = (thread.parent as any)?.id;
	const currentData = serverDataStorage.read();
	const problems = currentData.problems?.[record.threadId] ?? [];
	const latestProblemId =
		(problems[0]?.problemId as string | undefined) ?? undefined;

	const updated = serverDataStorage.update((cur) => {
		const solves = cur.solves ?? [];
		const firstbloodInfo = cur.firstbloodInfo ?? {};
		const contributors = cur.contributorsByThread?.[record.threadId] ?? [];

		// 포럼 단위 퍼블 기록: 최초 한 번만, 이미 존재하면 더 이른 타임스탬프 우선
		if (forumId) {
			const fbForum = (cur as any).firstbloodByForum || {};
			const existing = fbForum[forumId];
			const currentTs = Date.parse(record.timestamp) || Date.now();
			const existingTs = existing
				? Date.parse(existing.timestamp)
				: undefined;
			if (
				!existing ||
				(existingTs !== undefined && currentTs < existingTs)
			) {
				(cur as any).firstbloodByForum = fbForum;
				fbForum[forumId] = {
					solverId: record.solverId,
					solverName: record.solverName,
					timestamp: record.timestamp,
					threadId: record.threadId,
					problemId: latestProblemId,
					createdAt: new Date().toISOString(),
				};
			}
		}

		const isFirstInThread = !solves.some(
			(s) => s.threadId === record.threadId
		);
		if (isFirstInThread) {
			firstbloodInfo[record.threadId] = {
				solverId: record.solverId,
				solverName: record.solverName,
				timestamp: record.timestamp,
			};
		}

		const newRecord: any = {
			...record,
			isFirstBlood: forumId
				? (cur as any).firstbloodByForum?.[forumId]?.solverId ===
						record.solverId &&
				  (cur as any).firstbloodByForum?.[forumId]?.threadId ===
						record.threadId
				: false,
			contributors,
		};
		if (latestProblemId) newRecord.problemId = latestProblemId;
		solves.unshift(newRecord);
		return {
			...cur,
			serverId: cur.serverId ?? guildId,
			solves,
			firstbloodInfo,
		};
	});

	const isForumFirst = forumId
		? (updated as any).firstbloodByForum?.[forumId]?.solverId ===
				record.solverId &&
		  (updated as any).firstbloodByForum?.[forumId]?.threadId ===
				record.threadId
		: false;

	if (latestProblemId && interaction.guild) {
		try {
			await updateChallengeMessageStatus(
				record.threadId,
				latestProblemId,
				interaction.guild
			);
		} catch (error) {
			console.error("Error updating challenge message status:", error);
		}
	}

	const threadSolveCount = (updated.solves || []).filter(
		(s: any) => s.threadId === record.threadId
	).length;

	await interaction.editReply(
		`${isForumFirst ? "**[FIRST BLOOD]** " : ""}Solve recorded by <@${
			record.solverId
		}>. Total solves: ${threadSolveCount}\nFlag: \`${flag}\``
	);

	try {
		const summary = `${isForumFirst ? "**[FIRST BLOOD]** " : ""}Solved by <@${
			record.solverId
		}> at ${new Date(record.timestamp).toLocaleString()}`;
		if (thread.isTextBased()) {
			await (thread as any).send(summary);
		}
		const cur = serverDataStorage.read();
		const ctfThreads = cur.ctfThreadsByName || {};
		const noticeMap = cur.ctfNoticeByName || {};
		const entry = Object.entries(ctfThreads).find(
			([, tid]) => tid === record.threadId
		);
		const ctfName = entry?.[0];
		const noticeId = ctfName ? noticeMap[ctfName] : undefined;
		if (noticeId && interaction.guild) {
			const ch = await interaction.guild.channels
				.fetch(noticeId)
				.catch(() => null);
			if (ch && ch.isTextBased()) {
				await (ch as any).send(summary);
			}
		}
	} catch {}
}
