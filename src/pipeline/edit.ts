import fs from "node:fs/promises";
import path from "node:path";
import { VIEWPORT } from "./browser";
import { FPS, probeDurationMs, toConstantFrameRate } from "./media";
import { renderMusic } from "./synth";
import { FORMAT_SIZE, type AdScript, type AdTimeline, type ClipSource, type Exploration, type Format, type Score, type Segment, type Take, type TimedShot } from "./types";

export { FPS };

const LEAD_MS = 700; // show the screen before an action lands
const TAIL_MS = 1300; // let the result of the action breathe
const MERGE_GAP_MS = 600;
const END_HOLD_MS = 1500;

// The screen is static while the model thinks, so keep only the windows around real actions.
export function cutSegments(take: Take): Segment[] {
  const windows: Segment[] = take.events
    .filter((e) => e.type !== "move")
    .map((e) => ({ from: e.t - LEAD_MS, to: e.tEnd + TAIL_MS }));
  windows.push({ from: take.durationMs - END_HOLD_MS, to: take.durationMs });

  const clamped = windows
    .map((w) => ({ from: Math.max(0, w.from), to: Math.min(take.durationMs, w.to) }))
    .filter((w) => w.to > w.from)
    .sort((a, b) => a.from - b.from);

  const merged: Segment[] = [];
  for (const w of clamped) {
    const prev = merged[merged.length - 1];
    if (prev && w.from - prev.to < MERGE_GAP_MS) prev.to = Math.max(prev.to, w.to);
    else merged.push({ ...w });
  }
  return merged;
}

// Playwright starts recording before our action clock does; both end when the context
// closes, so the length difference is how far to shift the action log.
export async function alignTake(take: Take): Promise<Take> {
  const videoMs = await probeDurationMs(take.video);
  const offset = Math.max(0, videoMs - take.durationMs);
  return {
    ...take,
    durationMs: videoMs,
    events: take.events.map((e) => ({ ...e, t: e.t + offset, tEnd: e.tEnd + offset })),
  };
}

export async function buildAdTimeline(
  jobId: string,
  exp: Exploration,
  script: AdScript,
  score: Score,
  takes: Take[],
  publicDir: string,
  backdrop?: string, // Muse Image art, if the director asked for it
  format: Format = "16:9",
): Promise<AdTimeline> {
  const mediaDir = path.join(publicDir, "renders", jobId);
  await fs.mkdir(mediaDir, { recursive: true });
  let background: string | undefined;
  if (backdrop && script.style.backdrop === "image") {
    await fs.copyFile(backdrop, path.join(mediaDir, "backdrop.png"));
    background = `renders/${jobId}/backdrop.png`;
  }

  const clips: Record<string, ClipSource> = {};
  for (const sceneId of new Set(script.shots.flatMap((s) => (s.kind === "clip" ? [s.sceneId] : [])))) {
    const raw = takes.find((t) => t.sceneId === sceneId);
    if (!raw) continue;
    const take = await alignTake(raw);
    await toConstantFrameRate(take.video, path.join(mediaDir, `${sceneId}.mp4`));
    await fs.copyFile(take.endShot, path.join(mediaDir, `${sceneId}-end.png`));
    clips[sceneId] = {
      video: `renders/${jobId}/${sceneId}.mp4`,
      endShot: `renders/${jobId}/${sceneId}-end.png`,
      segments: cutSegments(take),
      events: take.events,
    };
  }

  const music = path.join(mediaDir, "music.wav");
  const { durationMs } = await renderMusic(script, score, music);

  // Place shots on exact beat times so rounding never drifts away from the music.
  const framesPerBeat = (FPS * 60) / script.bpm;
  let beat = 0;
  const shots: TimedShot[] = script.shots.map((shot) => {
    const from = Math.round(beat * framesPerBeat);
    beat += shot.beats;
    return { ...shot, from, durationInFrames: Math.round(beat * framesPerBeat) - from };
  });
  // The logo card holds through the music's ring-out instead of cutting to an empty frame.
  const durationInFrames = Math.ceil((durationMs / 1000) * FPS);
  const last = shots[shots.length - 1];
  last.durationInFrames = durationInFrames - last.from;

  return {
    fps: FPS,
    ...FORMAT_SIZE[format],
    viewport: VIEWPORT,
    brand: { ...exp.brand, primary: script.style.palette.primary },
    style: script.style,
    background,
    bpm: script.bpm,
    music: `renders/${jobId}/music.wav`,
    shots,
    clips,
    durationInFrames,
  };
}
