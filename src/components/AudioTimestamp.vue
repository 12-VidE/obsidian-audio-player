<template>
    <div class="timestamp" @click.left="emitMovePlayhead" @click.right="emitEdit">
        <span class="time">{{ timeTimestamp }}</span>
        <span class="timestamp-content">{{ cmt.content }}</span>
    </div>
</template>

<script lang="ts">
import { AudioTimestamp } from "../types";
import { defineComponent, PropType } from "vue";
import { secondsToString } from "../utils";

export default defineComponent({
    name: "AudioTimestamp",
    props: {
        cmt: {
            type: Object as PropType<AudioTimestamp>,
            required: true,
        },
    },
    computed:{
        timeTimestamp() {return secondsToString(this.cmt.time)},
    },
    methods: {
        emitMovePlayhead() : void{
            this.$emit("move-playhead", this.cmt.time);
        }, 
        emitEdit() : void{
            this.$emit("edit-timestamp", this.cmt.time);
        },
    },
});
</script>