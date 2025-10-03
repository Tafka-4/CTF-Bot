import { EmbedBuilder } from "discord.js";
import type { ModalSubmitInteraction } from "discord.js";

import { ctfQueueManager } from "../../utils/ctfQueueManager.js";
import { ctftimeToQueueItem } from "../../utils/ctftime.js";
import {
	createAndSaveChallengePost,
	saveChallenge,
} from "../../utils/challengeFlow.js";
import { sendCTFParticipationMessage } from "../../utils/ctfNotice.js";
import { createCTFTopic } from "../../utils/ctfThreads.js";

export async function handleCTFAddModal(interaction: any) {
	try {
		await interaction.deferReply();

		const name = interaction.fields.getTextInputValue("name");
		const url = interaction.fields.getTextInputValue("url");
		const description = interaction.fields.getTextInputValue("description");

		if (!name || name.trim().length === 0) {
			await interaction.editReply({
				content: "❌ CTF name is required.",
			});
			return;
		}

		if (!url || url.trim().length === 0) {
			await interaction.editReply({
				content: "❌ CTF URL is required.",
			});
			return;
		}

		if (!description || description.trim().length === 0) {
			await interaction.editReply({
				content: "❌ CTF description is required.",
			});
			return;
		}

		if (name.length > 100) {
			await interaction.editReply({
				content: "❌ CTF name must be 100 characters or less.",
			});
			return;
		}

		if (url.length > 500) {
			await interaction.editReply({
				content: "❌ CTF URL must be 500 characters or less.",
			});
			return;
		}

		if (description.length > 2000) {
			await interaction.editReply({
				content: "❌ CTF description must be 2000 characters or less.",
			});
			return;
		}

		let item: any = {
			name: name.trim(),
			url: url.trim(),
			description: description.trim(),
			createdAt: new Date().toISOString(),
			guildId: interaction.guildId || "",
			started: false,
		};

		if (interaction.customId.includes("|")) {
			const [, hintEnc] = interaction.customId.split("|");
			try {
				const hint = decodeURIComponent(hintEnc || "");
				const mod = await import("../../utils/ctftime.js");
				const ev = await mod.fetchCtftimeEvent(hint);
				if (ev) {
					const fromEv = mod.ctftimeToQueueItem(ev);
					item = {
						...fromEv,
						name: name.trim() || fromEv.name,
						url: url.trim() || fromEv.url,
						description: description.trim() || fromEv.description,
						guildId: interaction.guildId || "",
						ctftimeId: ev.id,
					};
				}
			} catch (error) {
				console.warn("Could not fetch additional CTFTime data:", error);
			}
		}

		try {
			ctfQueueManager.loadQueue();

			ctfQueueManager.cleanStartedCTFs();

			const hasActiveCTF = ctfQueueManager.hasActiveCTF();
			const now = new Date();

			let shouldStartImmediately = false;
			if (item.startAt) {
				const startTime = new Date(item.startAt);
				shouldStartImmediately =
					startTime <= now ||
					startTime.getTime() - now.getTime() <= 60000;
			}

			if (hasActiveCTF && !shouldStartImmediately) {
				item.pending = true;
				await ctfQueueManager.addToQueueSafe(item);

				await interaction.editReply({
					content: `✅ CTF "${name.trim()}" added to queue as **pending**!\n⏳ It will be promoted manually or when current CTF is skipped.\n📋 Please use \`/setnotice set\` to configure the notice channel.`,
				});
			} else if (shouldStartImmediately) {
				item.started = true;
				await ctfQueueManager.addToQueueSafe(item);
				ctfQueueManager.setCurrent(item);
				ctfQueueManager.appendHistory(item);

				try {
					await createCTFTopic(interaction.guild, item.name);
				} catch (createError) {
					console.error("Error creating CTF forum:", createError);
				}

				const noticeResult = await sendCTFParticipationMessage(
					interaction.client,
					item
				);

				await interaction.editReply({
					content: `✅ CTF "${name.trim()}" is now **active** and CTF forum has been created!\n⚠️ This CTF was started immediately because its start time has passed or is very soon.\n📋 Please use \`/setnotice set\` to configure the notice channel.${
						noticeResult.success
							? "\n🎯 Sent participation message to notice channel."
							: ""
					}`,
				});
			} else {
				item.pending = true;
				await ctfQueueManager.addToQueueSafe(item);
				await interaction.editReply({
					content: `✅ CTF "${name.trim()}" added to queue as **pending**!\n⏳ It will be promoted when ready.\n📋 Please use \`/setnotice set\` to configure the notice channel.`,
				});
			}

			const validation = ctfQueueManager.validateQueueConsistency();
			if (!validation.isValid) {
				console.warn(
					"CTF add after queue consistency issue:",
					validation.issues
				);
			}
		} catch (queueError) {
			console.error("Error adding CTF to queue:", queueError);
			try {
				if (interaction.deferred) {
					await interaction.editReply({
						content:
							"❌ Failed to add CTF to queue. Please try again.",
					});
				} else {
					await interaction.reply({
						content:
							"❌ Failed to add CTF to queue. Please try again.",
						flags: 64,
					});
				}
			} catch (replyError) {
				console.error("Failed to send error reply:", replyError);
			}
		}
	} catch (err) {
		console.error("Error in ctfadd modal submit:", err);
		try {
			if (interaction.deferred) {
				await interaction.editReply({
					content: "❌ Failed to add CTF. Please try again.",
				});
			} else if (!interaction.replied) {
				await interaction.reply({
					content: "❌ Failed to add CTF. Please try again.",
					flags: 64,
				});
			} else {
				await interaction.followUp({
					content: "❌ Failed to add CTF. Please try again.",
					flags: 64,
				});
			}
		} catch (followUpError) {
			console.error("Failed to send error message:", followUpError);
		}
	}
}

export async function handleAddChallengeModal(interaction: any) {
	try {
		const title = interaction.fields.getTextInputValue("title");
		const [, category] = interaction.customId.split(":");
		const desc = interaction.fields.getTextInputValue("desc");

		if (!title || title.trim().length === 0) {
			await interaction.reply({
				content: "❌ Challenge title is required.",
				flags: 64,
			});
			return;
		}

		if (!desc || desc.trim().length === 0) {
			await interaction.reply({
				content: "❌ Challenge description is required.",
				flags: 64,
			});
			return;
		}

		if (title.length > 100) {
			await interaction.reply({
				content: "❌ Challenge title must be 100 characters or less.",
				flags: 64,
			});
			return;
		}

		if (desc.length > 2000) {
			await interaction.reply({
				content:
					"❌ Challenge description must be 2000 characters or less.",
				flags: 64,
			});
			return;
		}

		const ch = interaction.channel;
		console.log("Channel info:", {
			id: ch?.id,
			name: ch?.name,
			type: ch?.type,
			isTextBased: ch?.isTextBased(),
			parentId: ch?.parentId,
			parentType: ch?.parent?.type,
		});

		try {
			await createAndSaveChallengePost(
				ch as any,
				interaction.channelId as string,
				{
					title: title.trim(),
					category: category || "Misc",
					desc: desc.trim(),
					authorId: interaction.user.id,
				}
			);

			await interaction.reply({
				content: `✅ Challenge added: **${title}**\n📂 Category: ${
					category || "Misc"
				}`,
				flags: 64,
			});
		} catch (saveError) {
			console.error("Error saving challenge:", saveError);
			await interaction.reply({
				content: `❌ Failed to save challenge: ${
					saveError instanceof Error
						? saveError.message
						: "Unknown error"
				}`,
				flags: 64,
			});
		}
	} catch (err) {
		try {
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({
					content: "Failed to add challenge.",
					flags: 64,
				});
			} else {
				await interaction.reply({
					content: "Failed to add challenge.",
					flags: 64,
				});
			}
		} catch (followUpError) {
			console.error("Failed to send error message:", followUpError);
		}
	}
}

export async function handleClueAddModal(interaction: any) {
	try {
		const title = interaction.fields.getTextInputValue("title");
		const content = interaction.fields.getTextInputValue("content");

		if (!title || title.trim().length === 0) {
			await interaction.reply({
				content: "❌ Title is required.",
				flags: 64,
			});
			return;
		}
		if (!content || content.trim().length === 0) {
			await interaction.reply({
				content: "❌ Content is required.",
				flags: 64,
			});
			return;
		}

		const { serverDataStorage } = await import("../../utils/storage.js");
		const threadId = interaction.channelId as string;
		serverDataStorage.update((cur: any) => {
			const clues = cur.clues ?? {};
			const list = (clues[threadId] ?? []) as any[];
			list.push({
				title: title.trim(),
				content: content.trim(),
				createdAt: new Date().toISOString(),
			});
			const contributors = cur.contributorsByThread ?? {};
			const clist = new Map(
				(contributors[threadId] ?? []).map((c: any) => [c.userId, c])
			);
			clist.set(interaction.user.id, {
				userId: interaction.user.id,
				userName: `${interaction.user.username}#${interaction.user.discriminator}`,
			});
			return {
				...cur,
				clues: { ...clues, [threadId]: list },
				contributorsByThread: {
					...contributors,
					[threadId]: Array.from(clist.values()),
				},
			};
		});

		await interaction.reply({ content: "✅ Clue added.", flags: 64 });
	} catch (e) {
		await interaction.reply({
			content: "❌ Failed to add clue.",
			flags: 64,
		});
	}
}

export async function handleRevshellModal(
	interaction: ModalSubmitInteraction
) {
	await interaction.reply({
		content: "이 리버스 셸 기능은 더 이상 지원되지 않습니다.",
		flags: 64,
	}).catch(() => {});
}

