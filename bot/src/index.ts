import { Client, GatewayIntentBits, Partials, Collection } from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import dotenv from "dotenv";
import { deployCommands, redeployCommands } from "./deploy.js";
import { serverDataStorage, type CTFItem } from "./utils/storage.js";
import { createCTFThread } from "./utils/ctfThreads.js";
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

client.once("ready", async () => {
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
		let changed = false;
		for (const item of ctfQueueManager.getQueue() as any[]) {
			if (!item.startAt || item.started) continue;
			const ts = Date.parse(item.startAt);
			if (Number.isNaN(ts)) continue;
			// Start if due, allow 5m drift tolerance and immediate near-future
			if (ts <= now + 1000 && ts >= now - 5 * 60 * 1000) {
				try {
					const guildId: string | undefined =
						item.guildId || undefined;
					if (guildId) {
						const guild = await client.guilds.fetch(guildId);
						if (guild) {
							await createCTFThread(guild as any, item.name);
						}
					}
				} catch (e) {
					console.error("Scheduler: thread creation failed", e);
					try {
						const alertId =
							serverDataStorage.read().adminAlertChannelId;
						if (alertId) {
							const ch = await client.channels.fetch(alertId);
							if (ch && ch.isTextBased()) {
								await (ch as any).send(
									`Scheduler failed to create CTF thread for '${item.name}'.`
								);
							}
						}
					} catch {}
				}
				item.started = true;
				changed = true;
			}
		}
		if (changed) ctfQueueManager.saveQueue();
	} catch (e) {
		console.error("Scheduler tick error", e);
	}
}

// Initial immediate tick, then interval
runSchedulerTick();
setInterval(runSchedulerTick, 60 * 1000);
