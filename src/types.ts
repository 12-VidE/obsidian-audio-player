import { MarkdownPostProcessorContext } from "obsidian";

export type AudioTimestamp = {
	content: string;
	time: number;
};

export type AudioPlayerRendererOptions = {
	ctx: MarkdownPostProcessorContext;
	player: HTMLAudioElement;
	filepath: string;
};
