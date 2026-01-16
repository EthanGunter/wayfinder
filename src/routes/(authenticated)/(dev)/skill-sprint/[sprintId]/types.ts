export type ChatMessage = {
	id: string;
	role: 'user' | 'assistant';
	content: string;
};

export type TagExtractionResult = {
	title?: string;
	goal?: string;
	date?: string;
	assessment?: Record<string, string>;
	plan?: string;
};
