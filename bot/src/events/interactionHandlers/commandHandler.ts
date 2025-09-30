export async function handleCommand(interaction: any, client: any) {
	const command = client.commands.get(interaction.commandName);

	if (!command) {
		console.error(
			`No command matching ${interaction.commandName} was found.`
		);
		return;
	}

	try {
		await command.execute(interaction);
	} catch (error: any) {
		console.error("Error executing command:", error);

		if (error.code === 10062) {
			console.error("Attempted to respond to an expired interaction.");
			return;
		}

		const errorMessage = "There was an error while executing this command!";

		try {
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({
					content: errorMessage,
					flags: 64,
				});
			} else {
				await interaction.reply({
					content: errorMessage,
					flags: 64,
				});
			}
		} catch (replyError) {
			console.error("Error sending error reply:", replyError);
		}
	}
}
