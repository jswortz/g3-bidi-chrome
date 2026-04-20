class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.buffer = new Int16Array(this.bufferSize);
    this.offset = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      for (let i = 0; i < channelData.length; i++) {
        // Convert Float32 to Int16
        let s = Math.max(-1, Math.min(1, channelData[i]));
        this.buffer[this.offset] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        this.offset++;

        if (this.offset >= this.bufferSize) {
          this.port.postMessage(this.buffer);
          this.buffer = new Int16Array(this.bufferSize);
          this.offset = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('recorder-worklet', RecorderProcessor);
