<template>
    <div class="audio-player-ui" tabindex="0">
        <div :class="['horiz', showInput && 'disabled-block']">
            <!-- WaveGraph + Timeline -->
            <div class="vert wide">
                <div class="waveform wide">
                    <div class="wv" v-for="(s, i) in filteredData" :key="srcPath+i"
                        v-bind:class="{'played': i <= currentBar }"
                        :style="{
                            height: s * 100 + 'px'
                    }"></div>
                </div>
                <div class="wide">
                    <input type="range" id="timeline-range" min="0" :max="duration" step="0.1" v-model="currentTime" @input="onTimeBarInput" />
                    <div class="timeline">
                        <span class="current-time">{{ displayedCurrentTime }}</span>
                        <span class="duration">{{ displayedDuration }}</span>
                    </div>
                </div>
            </div>
        </div>
        <!-- Controls -->
        <div :class="['horiz', showInput && 'disabled-block']" style="margin: auto">
            <div class="playpause seconds" @click="setPlayPosition(currentTime-5)" ref="min5">-5s</div>
            <div class="playpause" @click="togglePlay" ref="playpause"></div>
            <div class="playpause seconds" @click="setPlayPosition(currentTime+5)" ref="add5">+5s</div>
            <div class="showTimestamp" @click="showTimestampInput" ref="showTimestamp"></div>
        </div>
        <!-- Timestamp Input -->
        <div v-if="showInput" class="timestamp-input">
            <input v-model="newTimestamp" type="text" ref="commentInput"
                @keydown.escape="showInput = false; editMode = false; newTimestamp = ''" 
                @keydown.enter="addTimestamp">
            <button @click="addTimestamp">{{editMode ? "Confirm" : "Add"}}</button>
            <button @click="showInput = false; editMode = false; newTimestamp = ''">Cancel</button>
            <button v-if="editMode" @click="showInput = false; editMode = false; deleteTimestamp(editTime)">Delete</button>
        </div>
        <!-- Timestamps list -->
        <div :class="['comment-list', showInput && 'disabled-block']">
            <AudioTimestampVue v-for="cmt in commentsSorted" v-bind:class="{'active-comment': cmt == activeComment }"
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
const regexLoop = new RegExp('loop: *((t|T)rue)');

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
    defaultOption: Object as PropType<AudioPlayerOptions>
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

            activeComment: null as AudioTimestamp | null,
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
        console.log("###" + time);
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

    /* --- Timestamp --- */
    showTimestampInput() {
        this.pause();
        this.showInput = true; // triggers template TO show section
        setTimeout(() => {
            const input = this.$refs.commentInput as HTMLInputElement;
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
            if(newIndex == -1) console.warn("Impossible index");    
        }

        lines.splice(sectionInfo.lineEnd-timestamps.length+newIndex, this.editMode ? 1 : 0, `${newTimestamp.time} --- ${newTimestamp.content}`);
        window.app.vault.adapter.write(this.ctx.sourcePath, lines.join('\n'));

        // Reset states
        this.showInput = false;
        this.editMode = false;
        this.editTime = -1;
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

        // Place timestamp
        this.newTimestamp = this.getTimestamp(time).content;
    },
    getTimestamps() : Array<AudioTimestamp> {
        const timestampLines = this.getPluginCodeBlockData(regexTimestamp);
        const timestamps = timestampLines.map((line : string, index : Number) => {
            const match = regexTimestamp.exec(line);
            return {
                time: Number(match![1]), 
                content: String(match![2]),
                index: index
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
        const defaultMultiplier : number = this.defaultOption.speed;
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
        const defaultLoop : boolean = this.defaultOption.loop;
        const filteredLine = this.getPluginCodeBlockData(regexLoop);
        if (filteredLine.length == 0) 
            return defaultLoop;
        const loop : boolean = regexLoop.exec(filteredLine[0]) ? true : false;
        return loop;
    },


    timeUpdateHandler() {
      if (this.isCurrent()) {
        this.currentTime = this.audio?.currentTime;

        const nextCommencts = this.commentsSorted.filter((x: AudioTimestamp) => this.audio?.currentTime >= x.time);
        
        if (nextCommencts.length == 1) {
          this.activeComment = nextCommencts[0];
        }
        if (nextCommencts.length > 1) {
          this.activeComment = nextCommencts[nextCommencts.length - 1];
        }
      }

    },

    
    isCurrent() { return this.audio.src === this.srcPath; },
    
  },
  created() { 
    this.loadFile();
  },
    mounted() {
        //Set (dynamic) buttons
        this.playpauseBtn = this.$refs.playpause as HTMLSpanElement;
        this.showtimestampBtn = this.$refs.showTimestamp as HTMLSpanElement;

        // Initialize icons
        setIcon(this.playpauseBtn, "play");
        setIcon(this.showtimestampBtn,"bookmark-plus");

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
    this.ro.unobserve(this.$el);
  }
})

</script>