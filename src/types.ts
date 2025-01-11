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

export type AudioPlayerOptions = {
    volume: number,
    speed: number;
    loop: boolean;
    sticky: boolean;
}