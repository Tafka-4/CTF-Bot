import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { serverDataStorage } from "../../utils/storage.js";

export const data = new SlashCommandBuilder()
	.setName("solve")
	.setDescription("Submit a flag for the current challenge")
	.addStringOption((o) =>
		o.setName("flag").setDescription("Flag to submit").setRequired(true)
	);

export async function execute(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply({ ephemeral: true });
	const flag = interaction.options.getString("flag", true);
	const guildId = interaction.guildId as string;
	const user = interaction.user;

	const record = {
		threadId: interaction.channelId,
		solverId: user.id,
		solverName: `${user.username}#${user.discriminator}`,
		flag,
		timestamp: new Date().toISOString(),
	};

	const updated = serverDataStorage.update((cur) => {
		const solves = cur.solves ?? [];
		const firstbloodInfo = cur.firstbloodInfo ?? {};
		const isFirst = !solves.some((s) => s.threadId === record.threadId);
		// Attach contributors from thread
		const contributors = cur.contributorsByThread?.[record.threadId] ?? [];
		// Attach latest problemId if available
		const problems = cur.problems?.[record.threadId] ?? [];
		const latestProblemId =
			(problems[0]?.problemId as string | undefined) ?? undefined;
		if (isFirst) {
			firstbloodInfo[record.threadId] = {
				solverId: record.solverId,
				solverName: record.solverName,
				timestamp: record.timestamp,
			};
		}
		const newRecord: any = {
			...record,
			isFirstBlood: isFirst,
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

	const isFirst =
		updated.firstbloodInfo?.[record.threadId]?.solverId === record.solverId;
	await interaction.editReply(
		`${isFirst ? "[FIRST BLOOD] " : ""}Solve recorded by ${
			record.solverName
		}. Total solves: ${updated.solves?.length ?? 0}`
	);

	// Announce in thread (without exposing flag)
	try {
		if (interaction.channel && interaction.channel.isTextBased()) {
			await (interaction.channel as any).send(
				`${isFirst ? "[FIRST BLOOD] " : ""}Solved by <@${
					record.solverId
				}> at ${new Date(record.timestamp).toLocaleString()}`
			);
		}
	} catch {}
}
