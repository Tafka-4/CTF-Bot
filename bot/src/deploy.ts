import { REST, Routes } from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import dotenv from "dotenv";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getBotToken(): string {
	const token = process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN;
	if (!token || token.trim().length === 0) {
		throw new Error(
			"Missing Discord token. Set DISCORD_BOT_TOKEN (or DISCORD_TOKEN) in the environment."
		);
	}
	return token;
}

function getConfiguredApplicationId(): string | undefined {
	return (
		process.env.DISCORD_APPLICATION_ID ??
		process.env.DISCORD_BOT_CLIENT_ID ??
		process.env.DISCORD_CLIENT_ID ??
		undefined
	);
}

function getConfiguredGuildId(): string | undefined {
	return (
		process.env.DISCORD_GUILD_ID ??
		process.env.DISCORD_TARGET_GUILD_ID ??
		process.env.DISCORD_DEV_GUILD_ID ??
		undefined
	);
}

async function resolveApplicationId(rest: REST): Promise<string> {
	const configuredId = getConfiguredApplicationId();
	try {
		const application = (await rest.get(
			Routes.oauth2CurrentApplication()
		)) as { id: string; name?: string };
		if (configuredId && configuredId !== application.id) {
			console.warn(
				`Configured Discord application ID (${configuredId}) does not match the token's application ID (${application.id}). Using ${application.id}.`
			);
		}
		return configuredId ?? application.id;
	} catch (error) {
		if (configuredId) {
			console.warn(
				"Could not confirm Discord application ID via API; falling back to configured ID.",
				error
			);
			return configuredId;
		}
		throw error;
	}
}

export async function clearAllCommands() {
	let applicationId: string;
	let rest: REST;
	const guildId = getConfiguredGuildId();

	try {
		rest = new REST({ version: "10" }).setToken(getBotToken());
		applicationId = await resolveApplicationId(rest);
	} catch (error) {
		console.error("Unable to initialise Discord REST client:", error);
		return false;
	}

	console.log("clearing all slash commands...");

	let success = true;

	try {
		await rest.put(Routes.applicationCommands(applicationId), { body: [] });
		console.log("Global slash commands cleared.");
	} catch (error) {
		console.error("Failed to clear global commands:", error);
	}

	if (guildId) {
		try {
			await rest.put(
				Routes.applicationGuildCommands(applicationId, guildId),
				{
					body: [],
				}
			);
			console.log("Guild slash commands cleared.");
		} catch (error: any) {
			if (error && (error.code === 50001 || error.status === 403)) {
				console.warn(
					"Skip clearing guild commands: Missing Access. Is the bot invited to the guild with applications.commands?"
				);
			} else {
				console.error("Failed to clear guild commands:", error);
				success = false;
			}
		}
	}

	if (success) {
		console.log("All applicable slash commands cleared.");
	}
	return success;
}

function walk(dir: string): string[] {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const e of entries) {
		if (e.isDirectory()) files.push(...walk(path.join(dir, e.name)));
		else if (e.name.endsWith(".ts") || e.name.endsWith(".js"))
			files.push(path.join(dir, e.name));
	}
	return files;
}

export async function deployCommands() {
	try {
		const commands: any[] = [];
		const commandsPath = path.join(__dirname, "commands");
		const commandFiles = walk(commandsPath);

		for (const filePath of commandFiles) {
			const command = await import(pathToFileURL(filePath).href);
			if (command.data && typeof command.data.toJSON === "function") {
				commands.push(command.data.toJSON());
			}
		}

		const rest = new REST({ version: "10" }).setToken(getBotToken());
		const applicationId = await resolveApplicationId(rest);
		const guildId = getConfiguredGuildId();

		if (!guildId) {
			console.warn(
				"No Discord guild ID configured; skipping slash command deployment."
			);
			return false;
		}

		console.log(`deploy slash commands... (${commands.length} commands)`);

		// Global deploy can be re-enabled when required.
		/*
		await rest.put(Routes.applicationCommands(applicationId), {
			body: commands,
		});
		*/

		await rest.put(
			Routes.applicationGuildCommands(applicationId, guildId),
			{
				body: commands,
			}
		);

		console.log("Slash commands are deployed successfully!");
		return true;
	} catch (error) {
		console.error("Deploy slash commands failed:", error);
		return false;
	}
}

export async function redeployCommands(clearFirst = false) {
	if (clearFirst) {
		const cleared = await clearAllCommands();
		if (!cleared) {
			console.warn(
				"Skipping slash command redeploy because clearing existing commands failed."
			);
			return false;
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	return await deployCommands();
}

if (import.meta.url === pathToFileURL(process.argv[1] as string).href) {
	const args = process.argv.slice(2);
	if (args.includes("--clear")) {
		clearAllCommands();
	} else if (args.includes("--redeploy")) {
		redeployCommands(true);
	} else {
		deployCommands();
	}
}
