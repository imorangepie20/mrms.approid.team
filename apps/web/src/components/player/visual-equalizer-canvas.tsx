"use client";

import { useEffect, useRef } from "react";

import type { TidalAudioAnalyser } from "@/hooks/use-tidal-audio-analyser";

export type VisualizerMode = "bars" | "radial";

type Props = {
  analyser: TidalAudioAnalyser;
  className?: string;
  mode: VisualizerMode;
};

const BAR_COUNT = 48;
const BAR_HORIZONTAL_SHIFT_RATIO = 0.025;
const HIGH_FREQUENCY_GAIN = 0.45;
const NOISE_FLOOR = 0.04;

export function resolveVisualizerBarLayout(width: number, count = BAR_COUNT) {
  const gap = Math.max(2, width * 0.004);
  const barWidth = Math.max(2, (width * 0.84 - gap * (count - 1)) / count);
  const totalWidth = barWidth * count + gap * (count - 1);
  return {
    barWidth,
    gap,
    startX: (width - totalWidth) / 2 + width * BAR_HORIZONTAL_SHIFT_RATIO,
    totalWidth,
  };
}

export function resolveVisualizerMaxBarHeight(height: number) {
  return Math.min(height * 0.38, 390);
}

export function createVisualizerBarLevels(values: Float32Array, count = BAR_COUNT) {
  const levels = new Float32Array(count);
  if (values.length === 0) return levels;
  const minBin = Math.min(1, values.length - 1);
  const maxBin = Math.max(minBin + 1, values.length - 1);
  const minLog = Math.log(Math.max(1, minBin));
  const maxLog = Math.log(Math.max(2, maxBin));

  for (let index = 0; index < count; index += 1) {
    const startRatio = index / count;
    const endRatio = (index + 1) / count;
    const start = Math.min(
      values.length - 1,
      Math.max(minBin, Math.floor(Math.exp(minLog + (maxLog - minLog) * startRatio))),
    );
    const end = Math.min(
      values.length,
      Math.max(start + 1, Math.ceil(Math.exp(minLog + (maxLog - minLog) * endRatio))),
    );
    let sum = 0;
    for (let bin = start; bin < end; bin += 1) sum += values[bin];
    const bandPosition = index / Math.max(1, count - 1);
    const average = sum / Math.max(1, end - start) / 255;
    const gained = average * (1 + bandPosition * HIGH_FREQUENCY_GAIN);
    const gated = Math.max(0, gained - NOISE_FLOOR) / (1 - NOISE_FLOOR);
    levels[index] = Math.min(0.88, Math.pow(gated, 1.08) * 0.82);
  }
  return levels;
}

function fitCanvas(canvas: HTMLCanvasElement) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  return { height, ratio, width };
}

function drawBars(
  context: CanvasRenderingContext2D,
  values: Float32Array,
  width: number,
  height: number,
) {
  const levels = createVisualizerBarLevels(values);
  const { barWidth, gap, startX, totalWidth } = resolveVisualizerBarLayout(width, levels.length);
  const baseline = height * 0.78;
  const maxHeight = resolveVisualizerMaxBarHeight(height);

  context.strokeStyle = "rgba(255, 255, 255, 0.16)";
  context.beginPath();
  context.moveTo(startX, baseline + 9);
  context.lineTo(startX + totalWidth, baseline + 9);
  context.stroke();

  for (let index = 0; index < levels.length; index += 1) {
    const normalized = levels[index];
    const barHeight = 3 + normalized * maxHeight;
    const red = Math.round(103 + normalized * 89);
    const green = Math.round(232 - normalized * 86);
    context.fillStyle = `rgb(${red}, ${green}, 249)`;
    context.fillRect(startX + index * (barWidth + gap), baseline - barHeight, barWidth, barHeight);
  }
}

function drawRadial(
  context: CanvasRenderingContext2D,
  values: Float32Array,
  width: number,
  height: number,
) {
  const centerX = width / 2;
  const centerY = height * 0.46;
  const radius = Math.min(width, height) * 0.2;
  const count = 72;

  context.strokeStyle = "rgba(255, 255, 255, 0.2)";
  context.lineWidth = 1;
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.stroke();

  for (let index = 0; index < count; index += 1) {
    const angle = index / count * Math.PI * 2 - Math.PI / 2;
    const sourceIndex = Math.floor(index * values.length / count);
    const normalized = values[sourceIndex] / 255;
    const length = 4 + normalized * Math.min(150, radius * 0.78);
    const innerX = centerX + Math.cos(angle) * (radius + 5);
    const innerY = centerY + Math.sin(angle) * (radius + 5);
    context.strokeStyle = index % 3 === 0 ? "rgba(103, 232, 249, 0.92)" : "rgba(216, 180, 254, 0.9)";
    context.lineWidth = Math.max(2, radius * 0.018);
    context.beginPath();
    context.moveTo(innerX, innerY);
    context.lineTo(
      centerX + Math.cos(angle) * (radius + 5 + length),
      centerY + Math.sin(angle) * (radius + 5 + length),
    );
    context.stroke();
  }
}

export function VisualEqualizerCanvas({ analyser, className = "visualizer-canvas", mode }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const values = new Uint8Array(analyser.binCount);
    const smoothed = new Float32Array(analyser.binCount);
    let frame = 0;

    const paint = () => {
      const { height, ratio, width } = fitCanvas(canvas);
      analyser.read(values);
      for (let index = 0; index < values.length; index += 1) {
        smoothed[index] = Math.max(values[index], smoothed[index] * 0.84);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      if (mode === "radial") drawRadial(context, smoothed, width, height);
      else drawBars(context, smoothed, width, height);
      frame = window.requestAnimationFrame(paint);
    };

    frame = window.requestAnimationFrame(paint);
    return () => window.cancelAnimationFrame(frame);
  }, [analyser, mode]);

  return <canvas aria-hidden="true" className={className} ref={canvasRef} />;
}
