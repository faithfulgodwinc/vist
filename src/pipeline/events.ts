// The pipeline reports progress through here so both the CLI and the web studio can follow along.
export type Stage = "explore" | "storyboard" | "shoot" | "direct" | "edit" | "render";

export type VistEvent =
  | { type: "stage"; stage: Stage; status: "start" | "done" | "cached"; seconds?: number; spendUsd?: number }
  | { type: "log"; text: string }
  | { type: "card"; card: string; data: unknown }
  | { type: "frame"; jpeg: Buffer }
  | { type: "done"; video: string }
  | { type: "error"; message: string };

type Sink = (event: VistEvent) => void;
let sink: Sink | null = null;

// Only one job runs at a time per worker, so a single active sink is enough.
export function setSink(next: Sink | null) {
  sink = next;
}

export function emit(event: VistEvent) {
  sink?.(event);
}

export function log(text: string) {
  console.log(text);
  emit({ type: "log", text: text.trim() });
}
