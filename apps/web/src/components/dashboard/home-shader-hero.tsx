"use client";

import { MeshGradient } from "@paper-design/shaders-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { HomeContent } from "@/lib/home/content";

const shaderColors = ["#76e1dc", "#0d4652", "#f26b38", "#a8ae72", "#201226"];

export function HomeShaderHero({ hero }: { hero: HomeContent }) {
  const [canRenderShader, setCanRenderShader] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReduceMotion(Boolean(media?.matches));
    const initialize = window.setTimeout(() => {
      updateMotion();
      setCanRenderShader(typeof window.WebGLRenderingContext !== "undefined");
    }, 0);

    media?.addEventListener("change", updateMotion);
    return () => {
      window.clearTimeout(initialize);
      media?.removeEventListener("change", updateMotion);
    };
  }, []);

  return (
    <section className="home-feature" aria-labelledby="home-feature-title">
      <div className="home-feature-fallback" aria-hidden="true" />
      {canRenderShader ? (
        <MeshGradient
          aria-hidden="true"
          className="home-feature-shader"
          colors={shaderColors}
          distortion={0.82}
          grainMixer={0.18}
          grainOverlay={0.12}
          maxPixelCount={1_200_000}
          speed={reduceMotion ? 0 : 0.12}
          swirl={0.48}
        />
      ) : null}
      <div className="home-feature-scrim" aria-hidden="true" />

      <div className="home-feature-meta" aria-hidden="true">
        <span>MUSIC PIE</span>
        <span>EMS / GMS / MMS</span>
      </div>

      <div className="home-feature-copy">
        <p className="home-wordmark">PERSONAL MUSIC DISCOVERY</p>
        <h1 id="home-feature-title">{hero.title}</h1>
        <p>{hero.body}</p>
        <div className="home-feature-actions">
          {hero.linkHref ? <Link className="home-action" href={hero.linkHref}>{hero.linkLabel}</Link> : null}
          {hero.linkHref !== "/ems" ? <Link className="home-action-secondary" href="/ems">EMS 선곡 보기</Link> : null}
        </div>
      </div>

      <div className="home-feature-signal" aria-hidden="true">
        <span /><span /><span /><span /><span />
        <small>LIVE CATALOG</small>
      </div>
    </section>
  );
}
