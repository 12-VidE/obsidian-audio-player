# Obsidian Audio Player

- one audio instance for the whole obsidian vault
- easy to initialize
- wave visualizer 
- keeps playing even if you've closed the tab
- add bookmarks to your audio files

## Demo
![add_audio](https://user-images.githubusercontent.com/117757392/201384119-fa94f5bc-dc8f-4e03-8822-0f8948aa52dd.gif)

### Bookmarks
![add_bookmark](https://user-images.githubusercontent.com/117757392/201384274-14831e0b-458e-4a01-9869-34f34ad628cc.gif)

- **Add Bookmark**
    1. Double click on any of the bars on the wave visualizer, 
    2. Type your text
    3. Hit enter or press the "Add" button
    4. Click on any bookmark timecode to set the playhead position
- **Modify Bookmark**
    1. TODO
- **Cancel Bookmark**
    1. TODO

### Settings
They are manually inserted in the codeblock by the user.

- `audio` = Internal Obsidian link to the audio file to use. The aliases are neglected
- `speed` [optional] = Playback multiplier = `1.0-9.9` (default: `1.0`)
- `volume` [optional] = Volume percentage = `0.1-1.0` (default: `0.5`)
- `loop` [optional] = Loop at the start when the track ends = `true-false` (default: `false`)
- `sticky` [optional] = Sticky inputs when scrolling = `true-false` (default: `false`)

### Complete Example
~~~
```audio-player
audio: [[my awesome audio file.mp3|my player]]
speed: 1.5
volume: 0.8
loop: true
sticky: true

44 --- chapter
110 --- chapter 2 
160 --- chapter 3 in which nothing happened
```
~~~
![image](https://user-images.githubusercontent.com/117757392/201384550-33aa7f25-cadc-4ce5-a846-24d87bd7a05d.png)

