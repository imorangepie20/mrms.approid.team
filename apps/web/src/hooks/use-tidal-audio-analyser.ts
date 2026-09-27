"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { subscribeActiveTidalAudioElement } from "@/lib/tidal/active-audio";
import { AudioRingBuffer } from "@/lib/tidal/audio-ring-buffer";
import {
  subscribeTidalAudioCapture,
  type CapturedAudioSegment,
} from "@/lib/tidal/audio-capture";
import {
  decodeCompleteAudioData,
  decodeFragmentedMp4Segment,
  supportsAudioDecoding,
} from "@/lib/tidal/segment-decoder";
import {
  analysisAudioUrl,
  createLiveAudioAnalyser,
  type LiveAudioAnalyser,
} from "@/lib/tidal/live-audio-analyser";
import { pcmToByteFrequencyData } from "@/lib/tidal/simple-fft";

export type AudioAnalyserMode = "error" | "idle" | "pcm" | "unsupported" | "waiting";

export type TidalAudioAnalyser = {
  binCount: number;
  mode: AudioAnalyserMode;
  read: (target: Uint8Array) => void;
};

const FFT_SIZE = 256;
const BIN_COUNT = FFT_SIZE / 2;

function segmentStart(segment: CapturedAudioSegment, audio: HTMLAudioElement | null) {
  if (segment.startTime !== null) return segment.startTime;
  return audio && Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
}

function zero(target: Uint8Array) {
  target.fill(0);
}

export async function fetchVisualizerAnalysisAudio(trackId: string, signal: AbortSignal) {
  const response = await fetch(
    analysisAudioUrl(trackId),
    { cache: "no-store", signal },
  );
  if (!response.ok) throw new Error("tidal_analysis_audio_unavailable");
  return response.arrayBuffer();
}

export function useTidalAudioAnalyser(isPlaying: boolean): TidalAudioAnalyser {
  const ring = useRef(new AudioRingBuffer());
  const audio = useRef<HTMLAudioElement | null>(null);
  const playing = useRef(isPlaying);
  const decodeQueue = useRef<Promise<void>>(Promise.resolve());
  const job = useRef(0);
  const abortController = useRef<AbortController | null>(null);
  const liveAnalyser = useRef<LiveAudioAnalyser | null>(null);
  const [mode, setMode] = useState<AudioAnalyserMode>(() => (
    supportsAudioDecoding() ? "waiting" : "unsupported"
  ));

  useEffect(() => {
    playing.current = isPlaying;
    liveAnalyser.current?.sync(isPlaying, audio.current?.currentTime ?? 0);
  }, [isPlaying]);

  useEffect(() => subscribeActiveTidalAudioElement((element) => {
    audio.current = element;
  }), []);

  useEffect(() => {
    if (!supportsAudioDecoding()) {
      return;
    }
    let mounted = true;

    const nextJob = () => {
      job.current += 1;
      abortController.current?.abort();
      abortController.current = null;
      liveAnalyser.current?.dispose();
      liveAnalyser.current = null;
      return job.current;
    };
    const current = (jobId: number) => mounted && job.current === jobId;

    const decodeSegment = async (segment: CapturedAudioSegment, jobId: number) => {
      if (!current(jobId) || segment.kind !== "media") return;
      if (!segment.initSegment) {
        setMode("waiting");
        return;
      }
      try {
        const decoded = await decodeFragmentedMp4Segment(segment.initSegment, segment.payload);
        if (!current(jobId)) return;
        ring.current.append({
          sampleRate: decoded.sampleRate,
          samples: decoded.samples,
          startTime: segmentStart(segment, audio.current),
        });
        setMode("pcm");
      } catch {
        if (current(jobId)) setMode("error");
      }
    };

    const decodeDirect = async (
      trackId: string,
      startTime: number | null,
      jobId: number,
      signal: AbortSignal,
    ) => {
      try {
        const data = await fetchVisualizerAnalysisAudio(trackId, signal);
        const decoded = await decodeCompleteAudioData(data);
        if (!current(jobId)) return;
        ring.current.clear();
        ring.current.append({
          sampleRate: decoded.sampleRate,
          samples: decoded.samples,
          startTime: startTime ?? 0,
        });
        setMode("pcm");
      } catch {
        if (current(jobId)) setMode("error");
      }
    };

    const streamDirect = async (
      trackId: string,
      startTime: number | null,
      jobId: number,
      signal: AbortSignal,
    ) => {
      try {
        const live = createLiveAudioAnalyser(
          trackId,
          startTime ?? audio.current?.currentTime ?? 0,
        );
        liveAnalyser.current = live;
        await live.ready;
        if (!current(jobId)) {
          live.dispose();
          return;
        }
        live.sync(playing.current, audio.current?.currentTime ?? 0);
        setMode("pcm");
      } catch {
        if (!current(jobId)) return;
        liveAnalyser.current?.dispose();
        liveAnalyser.current = null;
        await decodeDirect(trackId, startTime, jobId, signal);
      }
    };

    const unsubscribe = subscribeTidalAudioCapture((event) => {
      if (event.type === "reset") {
        nextJob();
        ring.current.clear();
        if (mounted) setMode("waiting");
        return;
      }
      if (event.type === "source") {
        setMode(event.source === "native-hls" ? "unsupported" : "waiting");
        return;
      }
      if (event.type === "direct-stream") {
        const jobId = nextJob();
        const controller = new AbortController();
        abortController.current = controller;
        decodeQueue.current = decodeQueue.current
          .catch(() => undefined)
          .then(() => streamDirect(
            event.trackId,
            event.startTime,
            jobId,
            controller.signal,
          ));
        return;
      }
      const jobId = job.current;
      decodeQueue.current = decodeQueue.current
        .catch(() => undefined)
        .then(() => decodeSegment(event.segment, jobId));
    });

    return () => {
      mounted = false;
      abortController.current?.abort();
      liveAnalyser.current?.dispose();
      liveAnalyser.current = null;
      unsubscribe();
    };
  }, []);

  return useMemo(() => ({
    binCount: BIN_COUNT,
    mode,
    read(target: Uint8Array) {
      if (mode !== "pcm" || !playing.current) {
        zero(target);
        return;
      }
      if (liveAnalyser.current) {
        liveAnalyser.current.sync(true, audio.current?.currentTime ?? 0);
        liveAnalyser.current.read(target);
        return;
      }
      const currentTime = audio.current?.currentTime ?? Number.NaN;
      const samples = ring.current.readWindow(currentTime, FFT_SIZE);
      if (!samples) {
        zero(target);
        return;
      }
      pcmToByteFrequencyData(samples, target);
    },
  }), [mode]);
}
