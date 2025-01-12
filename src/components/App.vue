<template>
    <div class="audio-player-ui" tabindex="0">
        <!-- WaveGraph -->
        <div class="vert wide" :class="['horiz', showInput && 'disabled-block']">
            <div class="waveform wide">
                <div class="wv" v-for="(s, i) in filteredData" :key="srcPath+i"
                    v-bind:class="{'played': i <= currentBar }"
                    :style="{
                        height: s * 100 + 'px'
                }"></div>
            </div>
        </div>
        <div ref="stickyContainer" :class="['sticky-container', isSticky && 'is-sticky']">
            <!-- Timeline -->
            <div class="timeline-container wide vert" :class="['horiz', showInput && 'disabled-block']">
                <input type="range" id="timeline-range" min="0" :max="duration" step="0.1" v-model="currentTime" @input="onTimeBarInput" />
                <div class="timeline">
                    <span class="current-time">{{ displayedCurrentTime }}</span>
                    <span class="duration">{{ displayedDuration }}</span>
                </div>
            </div>
            <!-- Controls -->
            <div :class="['horiz', showInput && 'disabled-block']" style="display: flex; justify-content: center; margin: auto;">
                <div class="playpause seconds" @click="setPlayPosition(currentTime-5)" ref="min5">-5s</div>
                <div class="playpause" @click="togglePlay" ref="playpause"></div>
                <div class="playpause seconds" @click="setPlayPosition(currentTime+5)" ref="add5">+5s</div>
                <div class="showTimestamp" @click="showTimestampInput" ref="showTimestamp"></div>
            </div>
        </div>    
        <!-- Timestamp Input -->
        <div v-if="showInput" class="timestamp-input">
            <input v-model="newTimestamp" type="text" ref="commentInput"
                :class="[isDuplicate && 'disabled-block']"
                @keydown.escape="showInput = false; editMode = false; deleteConfirm = false; newTimestamp = ''" 
                @keydown.enter="addTimestamp">
            <div class="timestamp-buttons">
                <button :class="[isDuplicate && 'disabled-block']" @click="addTimestamp">
                    {{editMode ? "Confirm" : "Add"}}
                </button>
                <button @click="showInput = false; editMode = false; deleteConfirm = false; isDuplicate = false; newTimestamp = ''">Cancel</button>
                <button v-if="editMode" @click="confirmDelete" :style="{ 'background-color': deleteConfirm ? 'var(--interactive-accent)' : '' }">{{ deleteConfirm ? 'Sure?' : 'Delete' }}</button>
            </div>
        </div>
        <!-- Timestamps list -->
        <div :class="['comment-list', showInput && 'disabled-block']">
            <AudioTimestampVue v-for="cmt in commentsSorted" v-bind:class="{'active-comment': cmt.time === activeComment?.time }"
                @move-playhead="setPlayPosition" 
                @edit-timestamp="editTimestamp"
                :cmt="cmt" :key="cmt.time">
            </AudioTimestampVue>
        </div>
    </div>
</template>

<script lang="ts">
import { TFile, setIcon, MarkdownPostProcessorContext } from "obsidian";
import { defineComponent, PropType } from "vue";
import { AudioTimestamp, AudioPlayerOptions } from "../types";
import { secondsToString } from "../utils";

import AudioTimestampVue from "./AudioTimestamp.vue";


const regexTimestamp = new RegExp('^(.+) --- (.+)$');
const regexSpeed = new RegExp('speed: *([0-9\.]*)');
const regexLoop = new RegExp('loop: *(?:((?:T|t)rue)|((?:F|f)alse))');
const regexSticky = new RegExp('sticky: *(?:((?:T|t)rue)|((?:F|f)alse))');
const regexVolume = new RegExp('volume: *([0-9\.]*)');
const defaultOption : AudioPlayerOptions = {
    volume: 0.5,
    speed: 1,
    loop: false,
    sticky: false,
};

export default defineComponent({
    name: "App",
    components: {
        AudioTimestampVue
    },
    props: {
        filepath: String,
        ctx: Object as PropType<MarkdownPostProcessorContext>,
        mdElement: Object as PropType<HTMLElement>,
        audio: Object as PropType<HTMLAudioElement>,
    },
    data() {
        return {
            srcPath: '',

            filteredData: [] as number[],
            nSamples: 150,
            duration: 0,
            
            currentTime: 0,
            playing: false,
                
            editMode: false,
            editTime: -1,
            showInput: false,
            newTimestamp: '',
            deleteConfirm: false,

            activeComment: null as AudioTimestamp | null,

            // States
            isSticky: false,    // IF we enable the player to be sticky 
            isDuplicate: false, // WHEN we want to create a timestamp WHERE it already exists
        }
    },
    computed: {
        displayedCurrentTime() { return secondsToString(this.currentTime); },
        displayedDuration() { return secondsToString(this.duration); },

        currentBar() { return Math.floor(this.currentTime / this.duration * this.nSamples); },
        commentsSorted() { return this.getTimestamps().sort((x: AudioTimestamp, y:AudioTimestamp) => x.time - y.time); },
    },
    methods: {
    /* --- Backend --- */
        async loadFile() {
            // read file from vault 
            const file = window.app.vault.getAbstractFileByPath(this.filepath) as TFile;

            // process audio file & set audio el source
            if (file && file instanceof TFile) {
                //check cached values
                if (!this.loadCache()) 
                    this.processAudio(file.path);
                this.srcPath = window.app.vault.getResourcePath(file);
            }
        },
        saveCache() {
            localStorage[`${this.filepath}`] = JSON.stringify(this.filteredData);
            localStorage[`${this.filepath}_duration`] = this.duration;
        },
        loadCache(): boolean {
            let cachedData = localStorage[`${this.filepath}`];
            let cachedDuration = localStorage[`${this.filepath}_duration`];

            if (!cachedData) return false;
            
            this.filteredData = JSON.parse(cachedData);
            this.duration = Number.parseFloat(cachedDuration)
            return true;
        },
        async processAudio(path: string) {
            const arrBuf = await window.app.vault.adapter.readBinary(path);
            const audioContext = new AudioContext();
            const tempArray = [] as number[];

            audioContext.decodeAudioData(arrBuf, (buf) => {
                let rawData = buf.getChannelData(0);
                this.duration = buf.duration;

                const blockSize = Math.floor(rawData.length / this.nSamples);
                for (let i = 0; i < this.nSamples; i++) {
                    let blockStart = blockSize * i;
                    let sum = 0;
                    for (let j = 0; j < blockSize; j++)
                        sum += Math.abs(rawData[blockStart + j]);
                    tempArray.push(sum / blockSize);
                }
                
                let maxval = Math.max(...tempArray);
                this.filteredData = tempArray.map(x => x / maxval);
                this.saveCache();
            })
        },

        /* --- Audio State --- */
        play() {
            if (this.currentTime > 0)
                this.audio.currentTime = this.currentTime;

            // Apply correct settings
            this.setPlayBackRate(this.getSettingPlaybackSpeed());
            this.setLoopValue(this.getSettingLoop());
            this.setVolume(this.getSettingVolume());
            this.audio.addEventListener('timeupdate', this.timeUpdateHandler); //Fix
            
            this.audio?.play();
            this.playing = true;
            setIcon(this.playpauseBtn, "pause");  
        },
        pause() {
            this.audio?.pause();
            this.playing = false;
            setIcon(this.playpauseBtn, "play");
        },
        togglePlay() {
            if (!this.isCurrent())
                this.audio.src = this.srcPath;
            this.audio.paused ? this.play() : this.pause();
        },
        setPlayPosition(time: number) {
            this.currentTime = time;
            if (!this.isCurrent())
                this.togglePlay();

            if (this.isCurrent())
                this.audio.currentTime = time;
        },
        onTimeBarInput() {
            // Validate and update the audio's current time
            if (!isNaN(this.currentTime) && this.audio)
                this.audio.currentTime = this.currentTime;
        },
        setPlayBackRate(multiplier : number){
        this.audio.playbackRate = multiplier;
        },
        setLoopValue(value : boolean){
        this.audio.loop = value;
        },
        setVolume(volume : number){
            this.audio.volume = volume;
        },

        /* --- Timestamp --- */
        showTimestampInput() {
            this.pause();
            this.showInput = true; // triggers template TO show section
            const isNotUnique : boolean = this.getTimestamps().some( (timestamp :AudioTimestamp) => timestamp.time == Math.floor(this.currentTime));
            setTimeout(() => {
                const input = this.$refs.commentInput as HTMLInputElement;
                if (isNotUnique && !this.editMode){ // IF we are creating a new timestamp WHERE there's already one: ban it
                    this.newTimestamp = "ALREADY EXISTS!";
                    this.isDuplicate = true;
                } else
                    input.focus();
            })
        },
        addTimestamp() {
            if (this.newTimestamp.length == 0)
                return;
            
            const timestamps = this.getTimestamps();
            const sectionInfo = this.ctx.getSectionInfo(this.mdElement);
            const lines = sectionInfo.text.split('\n') as string[];
            
            let newTimestamp : AudioTimestamp;
            let newIndex : number;

            if(!this.editMode){
                newTimestamp = {
                    time: Math.floor(this.currentTime),
                    content: this.newTimestamp,
                };
                newIndex = timestamps.findIndex((item : AudioTimestamp) => newTimestamp.time < item.time);
                if(newIndex == -1) newIndex = timestamps.length; // Edge-case WHERE it doesn't find a solution = it must be last
            } else {
                newTimestamp = {
                    time: this.editTime,
                    content: this.newTimestamp,
                };
                newIndex = timestamps.findIndex((item : AudioTimestamp) => newTimestamp.time == item.time);
                if(newIndex == -1) return;    
            }

            lines.splice(sectionInfo.lineEnd-timestamps.length+newIndex, this.editMode ? 1 : 0, `${newTimestamp.time} --- ${newTimestamp.content}`);
            window.app.vault.adapter.write(this.ctx.sourcePath, lines.join('\n'));

            // Reset states
            this.showInput = false;
            this.editMode = false;
            this.editTime = -1;
            this.deleteConfirm = false;
        },
        confirmDelete() {
            if (this.deleteConfirm) {
                // Trigger the actual deletion if confirmed
                this.showInput = false;
                this.editMode = false;
                this.deleteTimestamp(this.editTime);
                this.deleteConfirm = false;  // Reset confirmation state
            } else {
                // Set the flag to show "Sure?" on the next click
                this.deleteConfirm = true;
            }
        },
        deleteTimestamp(time: number){
            const timestamps = this.getTimestamps();
            const sectionInfo = this.ctx.getSectionInfo(this.mdElement);
            const lines = sectionInfo.text.split('\n') as string[];
            const newIndex = timestamps.findIndex((item : AudioTimestamp) => time == item.time);
            if (newIndex == -1) return;

            lines.splice(sectionInfo.lineEnd-timestamps.length+newIndex, 1);
            window.app.vault.adapter.write(this.ctx.sourcePath, lines.join('\n'));
        },
        editTimestamp(time: number){
            // Set states
            this.showInput = true;
            this.editMode = true;
            this.editTime = time;

            this.pause();
            
            // Place timestamp
            this.newTimestamp = this.getTimestamp(time).content;

            // Scroll the timestamp input into view
            this.$nextTick(() => {
                const timestampInput = this.$refs.commentInput as HTMLInputElement;
                if (timestampInput) {
                    timestampInput.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center' // Adjust to 'start' or 'end' if needed
                    });
                }
                // Delay focusing until the scrolling completes
                setTimeout(() => {
                    timestampInput.focus(); // Focus on the input box after scrolling
                }, 300); // Adjust the delay time (300ms is an example)
            });
        },
        getTimestamps() : Array<AudioTimestamp> {
            const timestampLines = this.getPluginCodeBlockData(regexTimestamp);
            const timestamps = timestampLines.map((line : string) => {
                const match = regexTimestamp.exec(line);
                return {
                    time: Number(match![1]), 
                    content: String(match![2]),
                } as AudioTimestamp  
            });
            return timestamps;
        },
        getTimestamp(time: number) : AudioTimestamp {
            const timestamps = this.getTimestamps();
            let newIndex : number = timestamps.findIndex((item : AudioTimestamp) => time == item.time);
            return timestamps[newIndex];
        },

        /* -- Controls Handling --- */


        /* -- Other -- */
        getPluginCodeBlockData(regex: RegExp = /^.*$/) : Array<string> {
            const sectionInfo = this.ctx.getSectionInfo(this.mdElement);    // What's inside the code-block
            const lines : Array<string> = sectionInfo.text.split('\n');
            return lines.filter((item : string) => regex.test(item));
        },
        getSettingPlaybackSpeed() : number {
            const defaultMultiplier : number = defaultOption.speed;
            const filteredLine = this.getPluginCodeBlockData(regexSpeed);
            if (filteredLine.length == 0) 
                return defaultMultiplier;
            let multiplier : number = parseFloat(regexSpeed.exec(filteredLine[0])![1]);
            multiplier = Math.round(multiplier*10)/10; // Allow only 1 decimal
            if ( multiplier < 1 || multiplier > 9.9)
                return defaultMultiplier;
            else 
                return multiplier;
        },
        getSettingLoop() : boolean {
            const defaultLoop : boolean = defaultOption.loop;
            const filteredLine = this.getPluginCodeBlockData(regexLoop);
            if (filteredLine.length == 0) 
                return defaultLoop;
            const loop : boolean = regexLoop.exec(filteredLine[0])![1] ? true : false;
            return loop;
        },
        getSettingVolume() : number {
            const defaultVolume : number = defaultOption.volume;
            const filteredLine = this.getPluginCodeBlockData(regexVolume);
            if (filteredLine.length == 0) 
                return defaultVolume;
            let volume : number = parseFloat(regexVolume.exec(filteredLine[0])![1]);
            volume = Math.round(volume*10)/10; // Allow only 1 decimal
            if ( volume < 0 || volume > 1)
                return defaultVolume;
            else 
                return volume;
        },
        getSettingSticky() : boolean {
            const defaultSticky : boolean = defaultOption.sticky;
            const filteredLine = this.getPluginCodeBlockData(regexSticky);
            if (filteredLine.length == 0) 
                return defaultSticky;
            const sticky : boolean = regexSticky.exec(filteredLine[0])![1] ? true : false;
            return sticky;
        },


        timeUpdateHandler() {
            if (this.isCurrent()) {
                this.currentTime = this.audio?.currentTime;

                const nextTimestamps = this.commentsSorted.filter((x: AudioTimestamp) => this.audio?.currentTime >= x.time);
                

                if (nextTimestamps.length == 1) {
                    this.activeComment = nextTimestamps[0];
                }
                if (nextTimestamps.length > 1) {
                    this.activeComment = nextTimestamps[nextTimestamps.length - 1];
                }
            }
        },

        isCurrent() { return this.audio.src === this.srcPath; },

    },
    created() { 
        this.loadFile();
    },
    mounted() {
        this.playpauseBtn = this.$refs.playpause as HTMLSpanElement;
        this.showtimestampBtn = this.$refs.showTimestamp as HTMLSpanElement;

        // Initialize icons
        setIcon(this.playpauseBtn, "play");
        setIcon(this.showtimestampBtn,"bookmark-plus");

        // Initialize ?
        this.isSticky = this.getSettingSticky();

        // Add event listeners
        document.addEventListener('allpause', () => {  
            setIcon(this.playpauseBtn, "play");
        });
        document.addEventListener('allresume', () => {
            if (this.isCurrent())
            setIcon(this.playpauseBtn, "pause");
        })
        document.addEventListener('addcomment', () => {
            if (this.isCurrent()) 
            this.showCommentInput();
        })
        document.addEventListener('togglePlayState', () => {
            if (this.audio.src === this.srcPath) {
            this.togglePlay()
            setIcon(this.playpauseBtn, this.audio.paused ? 'play' : 'pause');
            }
        });

        this.audio.addEventListener('ended', () => {
            if (this.audio.src === this.srcPath)
                setIcon(this.playpauseBtn, "play");
        });

        // get current time
        if (this.audio.src === this.srcPath) {
            this.currentTime = this.audio.currentTime
            this.audio.addEventListener('timeupdate', this.timeUpdateHandler);
            setIcon(this.playpauseBtn, this.audio.paused ? 'play' : 'pause');
        }

        // load comments
        setTimeout(() => { this.comments = this.getTimestamps(); });
    },
    beforeDestroy() {
        // None
    }
})

</script>