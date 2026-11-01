import React from "react";
import { Composition, registerRoot } from "remotion";
import type { AdTimeline } from "../pipeline/types";
import { VistAd } from "./VistAd";

const sample: AdTimeline = {
  fps: 30,
  width: 1920,
  height: 1080,
  viewport: { width: 1280, height: 800 },
  brand: { url: "https://vist.video", name: "Vist", tagline: "", primary: "#6d5dfc", background: "#07070b" },
  style: {
    theme: "dark",
    palette: { primary: "#6d5dfc", secondary: "#22d3ee", background: "#07070b", ink: "#f5f5f7", muted: "#a1a1b5" },
    displayFont: "Sora",
    bodyFont: "Inter",
    caps: false,
    motion: "snappy",
    align: "center",
    frame: "browser",
    backdrop: "glow",
    imagePrompt: "",
    radius: 20,
  },
  bpm: 110,
  music: "",
  shots: [{ kind: "logo", beats: 8, energy: 2, tagline: "Launch videos, made by an agent.", from: 0, durationInFrames: 131 }],
  clips: {},
  durationInFrames: 131,
};

const Root: React.FC = () => (
  <Composition
    id="VistAd"
    component={VistAd as unknown as React.FC<Record<string, unknown>>}
    defaultProps={sample as unknown as Record<string, unknown>}
    fps={30}
    width={1920}
    height={1080}
    durationInFrames={sample.durationInFrames}
    calculateMetadata={({ props }) => {
      const t = props as unknown as AdTimeline;
      return { durationInFrames: t.durationInFrames, fps: t.fps, width: t.width, height: t.height };
    }}
  />
);

registerRoot(Root);
