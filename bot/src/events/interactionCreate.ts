import { Events, type Interaction } from "discord.js";
import * as buttonHandlers from "./interactionHandlers/buttonHandlers.js";
import * as selectMenuHandlers from "./interactionHandlers/selectMenuHandlers.js";
import * as modalHandlers from "./interactionHandlers/modalHandlers.js";
import * as requestbinHandlers from "./interactionHandlers/requestbinHandlers.js";
import * as commandHandler from "./interactionHandlers/commandHandler.js";

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(interaction: Interaction, client: any) {
	// Handle button interactions
	if (interaction.isButton()) {
		if (interaction.customId.startsWith("reqbin-panel:")) {
			await requestbinHandlers.handleRequestBinPanelButton(interaction);
			return;
		}
		// CTF Schedule pagination
		if (interaction.customId.startsWith("sched-")) {
			await buttonHandlers.handleSchedulePagination(interaction);
			return;
		}

		// Add challenge modal
		if (interaction.customId.startsWith("add-challenge:")) {
			await buttonHandlers.handleAddChallengeModal(interaction);
			return;
		}

		// CTF search pagination
		if (interaction.customId.startsWith("ctfs-")) {
			await buttonHandlers.handleCTFSearchPagination(interaction);
			return;
		}

		// Clue pagination
		if (
			interaction.customId.startsWith("clue-prev:") ||
			interaction.customId.startsWith("clue-next:") ||
			interaction.customId.startsWith("clue-back:")
		) {
			await buttonHandlers.handleCluePagination(interaction);
			return;
		}

		// CTF add button
		if (interaction.customId.startsWith("ctfs-add:")) {
			await buttonHandlers.handleCTFAddButton(interaction);
			return;
		}

		// Quick CTF add
		if (interaction.customId.startsWith("quick-ctfadd:")) {
			await buttonHandlers.handleQuickCTFAdd(interaction);
			return;
		}

		// Role management
		if (
			interaction.customId.startsWith("role-main:") ||
			interaction.customId.startsWith("role-category:")
		) {
			await buttonHandlers.handleRoleManagement(interaction);
			return;
		}
		// Clue add button
		if (interaction.customId === "clue-add") {
			await buttonHandlers.handleClueAddButton(interaction);
			return;
		}
	}

	// Handle select menu interactions
	if (interaction.isStringSelectMenu()) {
		if (interaction.customId.startsWith("reqbin-panel:detail:")) {
			await requestbinHandlers.handleRequestBinDetailSelect(interaction);
			return;
		}
		if (interaction.customId === "clue-select") {
			await selectMenuHandlers.handleClueSelect(interaction);
			return;
		}
		if (interaction.customId.startsWith("ctfs-select:")) {
			await selectMenuHandlers.handleCTFSelection(interaction);
			return;
		}
	}

	// Handle modal submit interactions
	if (interaction.isModalSubmit()) {
		// CTF add modal
		if (
			interaction.customId === "ctfadd" ||
			interaction.customId.startsWith("ctfadd|")
		) {
			await modalHandlers.handleCTFAddModal(interaction);
			return;
		}

		// Add challenge modal
		if (interaction.customId.startsWith("add-challenge-modal:")) {
			await modalHandlers.handleAddChallengeModal(interaction);
			return;
		}

		// Clue add modal
		if (interaction.customId === "add-clue-modal") {
			await modalHandlers.handleClueAddModal(interaction);
			return;
		}

	}

	// Handle chat input commands
	if (!interaction.isChatInputCommand()) return;

	await commandHandler.handleCommand(interaction, client);
}
