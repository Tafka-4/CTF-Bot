import { REST, Routes } from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import dotenv from "dotenv";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function clearAllCommands() {
	const rest = new REST({ version: "10" }).setToken(
		process.env.DISCORD_BOT_TOKEN as string
	);

	const clientId = process.env.DISCORD_BOT_CLIENT_ID as string;
	const guildId = process.env.DISCORD_GUILD_ID as string | undefined;

	console.log("clearing all slash commands...");

	let success = true;

	try {
		await rest.put(Routes.applicationCommands(clientId), { body: [] });
		console.log("Global slash commands cleared.");
	} catch (error) {
		console.error("Failed to clear global commands:", error);
		success = false;
	}

	if (guildId) {
		try {
			await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
				body: [],
			});
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

		const rest = new REST({ version: "10" }).setToken(
			process.env.DISCORD_BOT_TOKEN as string
		);

		console.log(`deploy slash commands... (${commands.length} commands)`);

		// Global deploy
		/*
		await rest.put(
			Routes.applicationCommands(
				process.env.DISCORD_BOT_CLIENT_ID as string
			),
			{
				body: commands,
			}
		);
		*/

		// Debug deploy
		await rest.put(
			Routes.applicationGuildCommands(
				process.env.DISCORD_BOT_CLIENT_ID as string,
				process.env.DISCORD_GUILD_ID as string
			),
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
		await clearAllCommands();
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
