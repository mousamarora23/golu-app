let currentAudioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let currentAnalyser: AnalyserNode | null = null;

export function stopPCM(): void {
  try {
    if (currentSource) {
      currentSource.stop();
      currentSource.disconnect();
      currentSource = null;
    }
    if (currentAudioCtx && currentAudioCtx.state !== "closed") {
      currentAudioCtx.close();
      currentAudioCtx = null;
    }
    currentAnalyser = null;
  } catch (err) {
    console.warn("Error stopping PCM audio:", err);
  }
}

export function isPCMPlaying(): boolean {
  return currentSource !== null;
}

export function getPCMVolume(): number {
  if (!currentAnalyser) return 0;
  const dataArray = new Uint8Array(currentAnalyser.frequencyBinCount);
  currentAnalyser.getByteFrequencyData(dataArray);
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    sum += dataArray[i];
  }
  return Math.min(1, (sum / dataArray.length) / 128);
}

export async function playPCM(base64Data: string): Promise<void> {
  stopPCM();

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      console.warn("AudioContext not supported");
      return;
    }

    const audioCtx = new AudioContextClass({ sampleRate: 24000 });
    currentAudioCtx = audioCtx;
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const buffer = new Int16Array(bytes.buffer);
    const audioBuffer = audioCtx.createBuffer(1, buffer.length, 24000);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      channelData[i] = buffer[i] / 32768.0;
    }

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    currentSource = source;

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    currentAnalyser = analyser;

    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    source.start();

    return new Promise<void>((resolve) => {
      source.onended = () => {
        if (currentSource === source) {
          currentSource = null;
          currentAnalyser = null;
        }
        if (currentAudioCtx === audioCtx) {
          audioCtx.close().catch(() => {});
          currentAudioCtx = null;
        }
        resolve();
      };
    });
  } catch (error) {
    console.error("Error playing audio:", error);
    stopPCM();
  }
}
