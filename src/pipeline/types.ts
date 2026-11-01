// Shared shapes passed between pipeline stages and into the Remotion composition.

export type ActionEvent = {
  t: number; // ms since recording start
  tEnd: number;
  type: string;
  x?: number;
  y?: number;
};

export type Brand = {
  url: string;
  name: string;
  tagline: string;
  primary: string;
  background: string;
  logo?: string;
};

export type Feature = { name: string; howTo: string; why: string };

export type Exploration = {
  brand: Brand;
  homeUrl: string;
  summary: string;
  features: Feature[];
};

export type StoryScene = {
  id: string;
  title: string;
  goal: string; // instruction the shooting agent follows
  narration: string;
};

export type Storyboard = { hook: string; cta: string; scenes: StoryScene[] };

export type Take = {
  sceneId: string;
  video: string; // absolute path to the recorded webm
  durationMs: number;
  events: ActionEvent[];
  endShot: string; // absolute path to the final-frame png
  verified: boolean;
  note?: string;
};

export type Segment = { from: number; to: number }; // ms in the source recording

export type Energy = 0 | 1 | 2 | 3;

// One shot of the ad, measured in beats so cuts land on the music.
export type AdShot =
  | { kind: "text"; beats: number; energy: Energy; lines: string[] }
  | { kind: "clip"; beats: number; energy: Energy; sceneId: string; caption: string; sub: string }
  | { kind: "stat"; beats: number; energy: Energy; value: string; label: string }
  | { kind: "features"; beats: number; energy: Energy; items: string[] }
  | { kind: "logo"; beats: number; energy: Energy; tagline: string };

export const FONT_NAMES = [
  "Inter", "Space Grotesk", "Manrope", "DM Sans", "Sora", "Outfit", "Nunito", "Poppins",
  "Playfair Display", "Fraunces", "DM Serif Display", "Instrument Serif", "Syne", "Unbounded",
  "Bricolage Grotesque", "JetBrains Mono",
] as const;
export type FontName = (typeof FONT_NAMES)[number];

// The per-product look: everything that makes one brand's ad not look like another's.
export type StyleKit = {
  theme: "dark" | "light" | "brand";
  palette: { primary: string; secondary: string; background: string; ink: string; muted: string };
  displayFont: FontName;
  bodyFont: FontName;
  caps: boolean; // uppercase headlines
  motion: "snappy" | "smooth" | "bouncy";
  align: "center" | "left";
  frame: "browser" | "floating" | "bleed";
  backdrop: "glow" | "grid" | "mesh" | "image" | "solid";
  imagePrompt: string; // what Muse Image paints for the backdrop
  radius: number; // corner radius in px
};

export type AdScript = { mood: string; bpm: number; style: StyleKit; shots: AdShot[] };

export type DrumPattern = { kick: string; snare: string; hat: string; bass: string; arp: boolean }; // 16-step x/. strings

export type SoundPalette = {
  kit: "punchy" | "808" | "soft" | "lofi";
  lead: "pluck" | "piano" | "bell" | "saw";
  pad: "warm" | "airy" | "dark";
  swing: number; // 0..0.3, delays off-beat 16ths
};

export type Score = {
  sound: SoundPalette;
  key: string; // e.g. "A"
  scale: "major" | "minor";
  progression: string[]; // one chord per bar, looped, e.g. ["Am", "F", "C", "G"]
  patterns: Record<"0" | "1" | "2" | "3", DrumPattern>; // by energy level
  padBrightness: number; // 0..1
};

// Product footage a clip shot can use, already cut down to the moments that matter.
export type ClipSource = {
  video: string; // path relative to /public
  endShot: string; // path relative to /public
  segments: Segment[];
  events: ActionEvent[];
};

export type TimedShot = AdShot & { from: number; durationInFrames: number };

export type AdTimeline = {
  fps: number;
  width: number;
  height: number;
  viewport: { width: number; height: number };
  brand: Brand;
  style: StyleKit;
  background?: string; // Muse Image backdrop, path relative to /public
  bpm: number;
  music: string; // path relative to /public
  shots: TimedShot[];
  clips: Record<string, ClipSource>;
  durationInFrames: number;
};
