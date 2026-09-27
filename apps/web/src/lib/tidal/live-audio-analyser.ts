export type LiveAudioAnalyser = {
  binCount: number;
  dispose: () => void;
  read: (target: Uint8Array) => void;
  ready: Promise<void>;
  sync: (isPlaying: boolean, currentTime: number) => void;
};

function audioContextConstructor() {
  return window.AudioContext ?? (
    window as Window & { webkitAudioContext?: typeof AudioContext }
  ).webkitAudioContext;
}

export function analysisAudioUrl(trackId: string) {
  return `/api/tidal/tracks/${encodeURIComponent(trackId)}/analysis?quality=LOW`;
}

export function createLiveAudioAnalyser(trackId: string, initialTime: number): LiveAudioAnalyser {
  const AudioContextConstructor = audioContextConstructor();
  if (!AudioContextConstructor) throw new Error("audio_context_unavailable");

  const audio = document.createElement("audio");
  const context = new AudioContextConstructor();
  const source = context.createMediaElementSource(audio);
  const analyser = context.createAnalyser();
  const silence = context.createGain();
  let disposed = false;
  let rejectReady: ((reason: Error) => void) | null = null;

  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.72;
  const frequencyData = new Uint8Array(analyser.frequencyBinCount);
  silence.gain.value = 0;
  source.connect(analyser);
  analyser.connect(silence);
  silence.connect(context.destination);

  audio.preload = "auto";
  audio.muted = true;
  audio.src = analysisAudioUrl(trackId);
  if (Number.isFinite(initialTime) && initialTime > 0) {
    audio.addEventListener("loadedmetadata", () => {
      if (!disposed) audio.currentTime = initialTime;
    }, { once: true });
  }

  const ready = new Promise<void>((resolve, reject) => {
    rejectReady = reject;
    const fail = () => {
      if (!rejectReady) return;
      const rejectPending = rejectReady;
      rejectReady = null;
      rejectPending(new Error("live_analysis_audio_unavailable"));
    };
    audio.addEventListener("error", fail, { once: true });
    audio.addEventListener("playing", () => {
      void context.resume()
        .then(() => {
          if (disposed) return;
          rejectReady = null;
          audio.muted = false;
          resolve();
        })
        .catch(fail);
    }, { once: true });
    void audio.play().catch(fail);
  });

  return {
    binCount: analyser.frequencyBinCount,
    dispose() {
      if (disposed) return;
      disposed = true;
      rejectReady?.(new Error("live_analysis_disposed"));
      rejectReady = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      source.disconnect();
      analyser.disconnect();
      silence.disconnect();
      void context.close().catch(() => undefined);
    },
    read(target) {
      analyser.getByteFrequencyData(frequencyData);
      target.fill(0);
      target.set(frequencyData.subarray(0, target.length));
    },
    ready,
    sync(isPlaying, currentTime) {
      if (disposed) return;
      if (
        Number.isFinite(currentTime) &&
        Math.abs(audio.currentTime - currentTime) > 1.25
      ) {
        try {
          audio.currentTime = Math.max(0, currentTime);
        } catch {
          // The proxy may not have buffered the requested position yet.
        }
      }
      if (isPlaying && audio.paused) void audio.play().catch(() => undefined);
      else if (!isPlaying && !audio.paused) audio.pause();
    },
  };
}
