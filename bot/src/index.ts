import {
	Client,
	GatewayIntentBits,
	Partials,
	Collection,
	Events,
} from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import dotenv from "dotenv";
import { deployCommands, redeployCommands } from "./deploy.js";
import { serverDataStorage, type CTFItem } from "./utils/storage.js";
import { createCTFTopic } from "./utils/ctfThreads.js";
import { ctfQueueManager } from "./utils/ctfQueueManager.js";
dotenv.config();

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMessageReactions,
		GatewayIntentBits.GuildMembers,
	],
	partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = new Collection();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function walk(dir: string): string[] {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const e of entries) {
		if (e.isDirectory()) {
			files.push(...walk(path.join(dir, e.name)));
		} else if (e.name.endsWith(".ts") || e.name.endsWith(".js")) {
			files.push(path.join(dir, e.name));
		}
	}
	return files;
}

const commandsPath = path.join(__dirname, "commands");
const commandFiles = walk(commandsPath);

for (const filePath of commandFiles) {
	const command = await import(pathToFileURL(filePath).href);
	if (command.data?.name) {
		client.commands.set(command.data.name, command);
	}
}

const eventsPath = path.join(__dirname, "events");
const eventFiles = walk(eventsPath);

for (const filePath of eventFiles) {
	const event = await import(pathToFileURL(filePath).href);
	if (event.name && event.execute) {
		if (event.once) {
			client.once(event.name, (...args) =>
				event.execute(...args, client)
			);
		} else {
			client.on(event.name, (...args) => event.execute(...args, client));
		}
	}
}

client.once(Events.ClientReady, async () => {
	console.log("bot is ready: deploy slash commands...");

	const clearFirst = true;

	if (clearFirst) {
		await redeployCommands(true);
	} else {
		await deployCommands();
	}
});

client
	.login(process.env.DISCORD_BOT_TOKEN)
	.then(() => console.log("bot is ready"))
	.catch(console.error);

process.on("SIGTERM", () => {
	console.log("SIGTERM received, shutting down gracefully");
	process.exit(0);
});

process.on("SIGINT", () => {
	console.log("SIGINT received, shutting down gracefully");
	process.exit(0);
});

async function runSchedulerTick() {
	try {
		ctfQueueManager.loadQueue();
		const now = Date.now();
		const oneHour = 60 * 60 * 1000;
		let changed = false;

		const validation = ctfQueueManager.validateQueueConsistency();
		if (!validation.isValid) {
			console.warn("Queue consistency issues found:", validation.issues);
			ctfQueueManager.sortQueueByDate();
			changed = true;
		}

		const nextValidCTF = ctfQueueManager.getNextValidCTF();
		const currentActive = ctfQueueManager.getCurrent();

		if (
			nextValidCTF &&
			(!currentActive || currentActive.name !== nextValidCTF.name)
		) {
			console.log(
				`Next valid CTF to start: ${nextValidCTF.name} at ${nextValidCTF.startAt}`
			);

			if (new Date(nextValidCTF.startAt || 0).getTime() <= now) {
				await startCTFNow(nextValidCTF);
				changed = true;
			}
		}

		for (const item of ctfQueueManager.getQueue() as any[]) {
			if (!item.startAt || item.started) continue;
			const ts = Date.parse(item.startAt);
			if (Number.isNaN(ts)) continue;

			if (
				ts <= now + oneHour + 60000 &&
				ts > now + oneHour &&
				!item.oneHourNoticeSent
			) {
				await sendCTFNotice(client, item, "oneHour");
				item.oneHourNoticeSent = true;
				changed = true;
			}

			if (
				ts <= now + 1000 &&
				ts >= now - 5 * 60 * 1000 &&
				!item.started
			) {
				if (new Date(item.startAt).getTime() <= now) {
					await startCTFNow(item);
					changed = true;
				}
			}
		}
		if (changed) ctfQueueManager.saveQueue();
	} catch (e) {
		console.error("Scheduler tick error", e);
	}
}

async function sendCTFNotice(
	client: any,
	ctfItem: any,
	type: "oneHour" | "start"
) {
	try {
		const { EmbedBuilder } = await import("discord.js");

		const startTime = new Date(ctfItem.startAt);
		const embed = new EmbedBuilder()
			.setTitle(
				`🎯 CTF ${
					type === "oneHour" ? "start 1 hour before" : "start"
				} notice`
			)
			.setColor(type === "oneHour" ? 0xffa500 : 0x00ff00)
			.addFields(
				{ name: "📅 CTF name", value: ctfItem.name, inline: true },
				{
					name: "🔗 URL",
					value: `[Link](${ctfItem.url})`,
					inline: true,
				},
				{
					name: "⏰ Start time",
					value: `<t:${Math.floor(startTime.getTime() / 1000)}:F>`,
					inline: true,
				}
			)
			.setTimestamp();

		if (type === "oneHour") {
			embed.setDescription(
				"CTF starts in 1 hour! React with ✅ to confirm your participation."
			);
		} else {
			embed.setDescription("CTF started right now!");
		}

		const result = await serverDataStorage.sendNoticeMessage(
			client,
			type === "oneHour"
				? "⏰ CTF start before 1 hour!"
				: "🚀 CTF start notice!",
			{
				embeds: [embed],
			}
		);

		if (result.success && result.messageId && type === "oneHour") {
			try {
				const noticeChannelId = serverDataStorage.getNoticeChannelId();
				if (noticeChannelId) {
					const channel = await client.channels.fetch(
						noticeChannelId
					);
					if (channel && channel.isTextBased()) {
						const message = await channel.messages.fetch(
							result.messageId
						);
						await message.react("✅");
						console.log(
							`✅ Emoji added (auto notice): ${result.messageId}`
						);
					}
				}
			} catch (emojiError) {
				console.error("자동 알림 이모지 추가 실패:", emojiError);
			}
		}

		if (result.success) {
			console.log(`CTF ${type} notice sent for: ${ctfItem.name}`);
		}
	} catch (error) {
		console.error(
			`Failed to send CTF ${type} notice for ${ctfItem.name}:`,
			error
		);
	}
}

async function startCTFNow(ctfItem: any) {
	try {
		if (ctfItem.started) return;

		console.log(`Starting CTF immediately: ${ctfItem.name}`);

		const currentActive = ctfQueueManager.getCurrent();
		if (currentActive && currentActive.started) {
			console.log(`Ending current CTF: ${currentActive.name}`);
		}

		const guildId: string | undefined = ctfItem.guildId || undefined;
		if (guildId) {
			const guild = await client.guilds.fetch(guildId);
			if (guild) {
				await createCTFTopic(guild as any, ctfItem.name);
			}
		}

		ctfItem.started = true;
		ctfQueueManager.setCurrent(ctfItem);

		await sendCTFNotice(client, ctfItem, "start");

		console.log(`CTF started successfully: ${ctfItem.name}`);
	} catch (e) {
		console.error("Error starting CTF immediately:", e);
	}
}

runSchedulerTick();
setInterval(runSchedulerTick, 60 * 1000);

async function cleanupRetiredForums() {
	try {
		const data = serverDataStorage.read();
		const retired = data.retiredForums ?? [];
		if (retired.length === 0) return;

		const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
		const now = Date.now();

		const keep: typeof retired = [];
		for (const item of retired) {
			const retiredAtMs = Date.parse(item.retiredAt);
			if (!Number.isFinite(retiredAtMs)) {
				keep.push(item);
				continue;
			}
			if (now - retiredAtMs < THIRTY_DAYS) {
				keep.push(item);
				continue;
			}
			try {
				const forum = await client.channels
					.fetch(item.forumId)
					.catch(() => null);
				if (forum && forum.type === 15 /* GuildForum */) {
					await (forum as any).delete(
						"Auto cleanup after 30 days in RETIRED"
					);
					console.log(
						`Deleted retired forum after 30 days: ${item.name}`
					);
				}
			} catch (e) {
				console.error("Failed to delete retired forum:", e);
				keep.push(item);
			}
		}

		serverDataStorage.update((cur) => ({ ...cur, retiredForums: keep }));
	} catch (e) {
		console.error("cleanupRetiredForums error", e);
	}
}

setInterval(cleanupRetiredForums, 6 * 60 * 60 * 1000);
