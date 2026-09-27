type Listener = (audio: HTMLAudioElement | null) => void;

let activeAudio: HTMLAudioElement | null = null;
const listeners = new Set<Listener>();

export function getActiveTidalAudioElement() {
  return activeAudio;
}

export function setActiveTidalAudioElement(audio: HTMLAudioElement | null) {
  activeAudio = audio;
  listeners.forEach((listener) => listener(audio));
}

export function subscribeActiveTidalAudioElement(listener: Listener) {
  listeners.add(listener);
  listener(activeAudio);
  return () => {
    listeners.delete(listener);
  };
}
