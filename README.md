# Gemini 3.1 Flash Live Bidi Chrome Extension

A Chrome Extension demonstrating real-time, bidirectional (Bidi) audio streaming with the `gemini-3.1-flash-live-preview` model using the new Gemini Live API.

## Features
- **Real-Time Audio**: Streams microphone audio (downsampled to 16kHz PCM) via an `AudioWorklet`. 
- **Flawless Playback**: Plays 24kHz PCM audio responses directly from the Gemini API using seamless `AudioBuffer` queuing.
- **Barge-in / Interruptions**: Instantly halts playback and clears the audio queue when the user speaks over the agent.
- **Screen Sharing**: Periodically captures and sends screen frames (1 FPS) for multimodal contexts.

## Setup
1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top right.
4. Click **Load unpacked** and select the directory containing this extension.

## Usage
1. Open the Chrome Extension side panel.
2. Enter your Gemini API Key.
3. Click "Connect".
4. Use the "Start Mic" button to begin streaming audio to Gemini.
5. Use the "Start Screen Share" button to share your screen.

## API Notes
This extension utilizes the `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent` endpoint. 

To ensure glitch-free audio, playback logic splits the input (16kHz) and output (24kHz) onto separate isolated Web Audio Contexts as per the Gemini 3.1 Live API migration guidelines.

