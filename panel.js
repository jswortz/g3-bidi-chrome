let ws = null;
let audioContextOut = null;
let audioContextIn = null;
let micStream = null;
let screenStream = null;
let nextAudioPlayTime = 0;
let activeAudioNodes = [];
let screenCaptureInterval = null;

const statusLog = document.getElementById('status');
const connectBtn = document.getElementById('connect-btn');
const micBtn = document.getElementById('mic-btn');
const screenBtn = document.getElementById('screen-btn');
const apiKeyInput = document.getElementById('api-key');

function log(msg) {
  statusLog.innerHTML += msg + '\n';
  statusLog.scrollTop = statusLog.scrollHeight;
}

// Load key from storage
chrome.storage.local.get(['geminiApiKey'], (result) => {
  if (result.geminiApiKey) {
    apiKeyInput.value = result.geminiApiKey;
  }
});

document.getElementById('save-key-btn').addEventListener('click', () => {
  chrome.storage.local.set({ geminiApiKey: apiKeyInput.value }, () => {
    log('API Key Saved.');
  });
});

connectBtn.addEventListener('click', () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
    return;
  }
  
  if (!apiKeyInput.value) {
    log('Please enter an API Key first.');
    return;
  }

  log('Connecting...');
  ws = new WebSocket('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=' + apiKeyInput.value);

  ws.onopen = async () => {
    log('Connected to Gemini Live API.');
    connectBtn.innerText = 'Disconnect';
    
    // Setup Audio Context for output
    if (!audioContextOut) {
      audioContextOut = new AudioContext({ sampleRate: 24000 });
    }
    
    // Send Setup Message
    const setupMessage = {
      setup: {
        model: "models/gemini-3.1-flash-live-preview", 
        generation_config: {
          response_modalities: ["AUDIO"]
        }
      }
    };
    log('Sending setup message...');
    ws.send(JSON.stringify(setupMessage));
    
    micBtn.disabled = false;
    screenBtn.disabled = false;
  };

  ws.onmessage = async (evt) => {
    let text;
    try {
      if (evt.data instanceof Blob) {
        text = await evt.data.text();
      } else {
        text = evt.data;
      }
    } catch (e) {
      console.error("Error reading message:", e);
      return;
    }

    const data = JSON.parse(text);
    console.log('Received:', data);

    if (data.setupComplete) {
      log('Setup Complete.');
    }
    
    if (data.error) {
      log('Server Error: ' + data.error.message);
      console.error("Server Error:", data.error);
    }

    if (data.serverContent) {
      if (data.serverContent.interrupted) {
        log('--- Interrupted by User Speech ---');
        stopAllAudio();
      }

      if (data.serverContent.modelTurn) {
        const parts = data.serverContent.modelTurn.parts;
        for (const part of parts) {
          if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
            playAudioChunk(part.inlineData.data);
          }
          if (part.text) {
            log('Gemini: ' + part.text);
          }
        }
      } 
    }
  };

  ws.onclose = (e) => {
    log(`Connection Closed. Code: ${e.code}, Reason: ${e.reason || 'No reason provided'}`);
    connectBtn.innerText = 'Connect connection';
    micBtn.disabled = true;
    screenBtn.disabled = true;
    stopAllAudio();
    stopMic();
    stopScreen();
  };

  ws.onerror = (e) => {
    log('WebSocket Error (check API Key and permissions).');
  }
});

function _base64ToArrayBuffer(base64) {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

function stopAllAudio() {
  activeAudioNodes.forEach(source => {
    try { source.stop(); } catch(e) {}
  });
  activeAudioNodes = [];
  nextAudioPlayTime = 0;
}

function playAudioChunk(base64) {
  if (audioContextOut.state === 'suspended') {
    audioContextOut.resume();
  }

  const buffer = _base64ToArrayBuffer(base64);
  const int16Array = new Int16Array(buffer);
  
  const audioBuffer = audioContextOut.createBuffer(1, int16Array.length, 24000); // 24kHz output for Gemini Live
  const channelData = audioBuffer.getChannelData(0);
  for (let i = 0; i < int16Array.length; i++) {
    channelData[i] = int16Array[i] / 32768.0;
  }
  
  const source = audioContextOut.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContextOut.destination);
  
  if (nextAudioPlayTime === 0 || audioContextOut.currentTime > nextAudioPlayTime) {
    nextAudioPlayTime = audioContextOut.currentTime;
  }
  source.start(nextAudioPlayTime);
  nextAudioPlayTime += audioBuffer.duration;
  
  source.onended = () => {
    activeAudioNodes = activeAudioNodes.filter(n => n !== source);
  };
  activeAudioNodes.push(source);
}

// Microphone Capture
let isWorkletLoaded = false;

micBtn.addEventListener('click', async () => {
  if (micStream) {
    stopMic();
    return;
  }
  
  log('Requesting Mic...');
  try {
    // Check permission status first (optional but helpful for debugging)
    if (navigator.permissions && navigator.permissions.query) {
      const status = await navigator.permissions.query({ name: 'microphone' });
      log('Current Mic Permission Status: ' + status.state);
    }

    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    if (!audioContextIn) {
      audioContextIn = new AudioContext({ sampleRate: 16000 });
    }
    await audioContextIn.resume();

    if (!isWorkletLoaded) {
      log('Loading audio worklet...');
      await audioContextIn.audioWorklet.addModule('recorder-worklet.js');
      isWorkletLoaded = true;
    }
    
    const source = audioContextIn.createMediaStreamSource(micStream);
    const processor = new AudioWorkletNode(audioContextIn, 'recorder-worklet');
    source.connect(processor);
    processor.connect(audioContextIn.destination); // Required to keep processor alive
    
    processor.port.onmessage = (e) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        const int16Array = e.data;
        // Convert int16array buffer to base64
        const uint8 = new Uint8Array(int16Array.buffer);
        let binary = '';
        for (let i = 0; i < uint8.byteLength; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        const b64 = btoa(binary);
        
        ws.send(JSON.stringify({
          realtimeInput: {
            audio: {
              mimeType: 'audio/pcm;rate=16000',
              data: b64
            }
          }
        }));
      }
    };
    log('Mic active.');
    micBtn.innerText = 'Stop Microphone';
    micBtn.classList.add('active');
  } catch (err) {
    log('Mic Error: ' + err.name + ' - ' + err.message);
    if (err.name === 'NotAllowedError' || err.message.includes('dismissed') || err.message.includes('denied')) {
      log('Try granting permission in the extension options page.');
      if (confirm('Microphone permission dismissed/denied. Open options page to grant access?')) {
        chrome.runtime.openOptionsPage();
      }
    }
  }
});

function stopMic() {
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
    log('Mic stopped.');
    micBtn.innerText = 'Enable Microphone';
    micBtn.classList.remove('active');
  }
}

// Screen Share Capture
screenBtn.addEventListener('click', async () => {
  if (screenStream) {
    stopScreen();
    return;
  }
  
  log('Requesting Screen Share...');
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    
    const video = document.createElement('video');
    video.autoplay = true;
    video.srcObject = screenStream;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    video.onloadedmetadata = () => {
      // Downscale for performance
      canvas.width = Math.floor(video.videoWidth / 2);
      canvas.height = Math.floor(video.videoHeight / 2);
    };
    
    screenCaptureInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN && canvas.width > 0) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const b64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
        ws.send(JSON.stringify({
          realtimeInput: {
            video: {
              mimeType: 'image/jpeg',
              data: b64
            }
          }
        }));
      }
    }, 1000); // 1 FPS Server limit or general best practice
    
    screenStream.getVideoTracks()[0].onended = stopScreen;
    
    log('Screen share active.');
    screenBtn.innerText = '🛑 Stop Screen Share';
    screenBtn.classList.add('active');
  } catch (err) {
    log('Screen Error: ' + err.message);
  }
});

function stopScreen() {
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
  if (screenCaptureInterval) {
    clearInterval(screenCaptureInterval);
    screenCaptureInterval = null;
  }
  log('Screen share stopped.');
  screenBtn.innerText = '🖥️ Start Screen Share';
  screenBtn.classList.remove('active');
}
