import { Easing, interpolate } from "remotion";
import type { ActionEvent, Segment } from "../pipeline/types";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.33, 0, 0.2, 1);

// Map a frame inside a scene back to a timestamp in the raw recording.
export function sourceMs(frame: number, fps: number, segments: Segment[]) {
  let ms = (frame / fps) * 1000;
  for (const s of segments) {
    const len = s.to - s.from;
    if (ms < len) return { ms: s.from + ms, holding: false };
    ms -= len;
  }
  const last = segments[segments.length - 1];
  return { ms: last ? last.to : 0, holding: true };
}

const FOCUS_TYPES = new Set(["click", "type", "keypress", "drag"]);

// Push in toward whatever the agent is interacting with, then ease back out.
export function zoomAt(ms: number, events: ActionEvent[]) {
  let best = { amount: 0, x: 0.5, y: 0.5 };
  for (const e of events) {
    if (!FOCUS_TYPES.has(e.type) || e.x === undefined || e.y === undefined) continue;
    const amount = Math.min(
      interpolate(ms, [e.t - 500, e.t - 50], [0, 1], { ...clamp, easing: ease }),
      interpolate(ms, [e.tEnd + 900, e.tEnd + 1400], [1, 0], { ...clamp, easing: ease }),
    );
    if (amount > best.amount) best = { amount, x: e.x, y: e.y };
  }
  return best;
}

// Headless recordings have no cursor, so we draw one gliding between the logged actions.
export function cursorAt(ms: number, events: ActionEvent[], fallback: { x: number; y: number }) {
  const pointed = events.filter((e) => e.x !== undefined && e.y !== undefined);
  let prev = fallback;
  for (const e of pointed) {
    if (e.t <= ms) {
      prev = { x: e.x!, y: e.y! };
      continue;
    }
    const p = interpolate(ms, [e.t - 550, e.t], [0, 1], { ...clamp, easing: ease });
    return { x: prev.x + (e.x! - prev.x) * p, y: prev.y + (e.y! - prev.y) * p };
  }
  return prev;
}

export function lastClick(ms: number, events: ActionEvent[]) {
  return events.filter((e) => e.type === "click" && e.t <= ms && ms - e.t < 450).pop();
}

// Zoom without ever showing past the page edges: pick the visible window around the focus
// point, clamped inside the viewport, and return the transform that fills the frame with it.
export function zoomTransform(scale: number, focus: { x: number; y: number }, vw: number, vh: number) {
  const w = vw / scale;
  const h = vh / scale;
  const left = Math.min(Math.max(focus.x - w / 2, 0), vw - w);
  const top = Math.min(Math.max(focus.y - h / 2, 0), vh - h);
  return `scale(${scale}) translate(${-left}px, ${-top}px)`;
}
