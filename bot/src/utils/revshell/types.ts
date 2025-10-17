export type RevshellPairingStatus =
	| "waiting"
	| "operator_connected"
	| "target_connected"
	| "bridged"
	| "closed";

export type RevshellPairingSummary = {
	key: string;
	ownerUserId: string | null;
	label: string | null;
	status: RevshellPairingStatus;
	createdAt: string;
	lastActivityAt: string;
	operatorConnected: boolean;
	targetConnected: boolean;
	closedAt: string | null;
	closeReason: string | null;
	logCount: number;
};

export type RevshellCommandMode = "plain" | "tls";

export type RevshellCommandSet = {
	operator: string;
	target: string;
};

export type RevshellCommandVariants = {
	defaultMode: RevshellCommandMode;
	plain: RevshellCommandSet;
	tls: RevshellCommandSet;
};

export type RevshellConnectionInfo = {
	host: string;
	port: number;
	internalHost?: string;
	internalPort?: number;
	useTls?: boolean;
};

export type RevshellCreateResponse = {
	pairing: RevshellPairingSummary;
	connection: RevshellConnectionInfo;
	commands: RevshellCommandVariants;
};

export type RevshellLogEntry = {
	seq: number;
	at: string;
	source: "operator" | "target";
	size: number;
	preview: string;
};

export type RevshellSendResponse = {
	success: true;
	bytesSent: number;
};

export type RevshellSendInput = {
	key: string;
	role?: "operator" | "target";
	text?: string;
	base64?: string;
};
