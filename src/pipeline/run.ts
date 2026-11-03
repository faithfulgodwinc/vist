import fs from "node:fs/promises";
import path from "node:path";
import { composeScore, paintBackdrop, writeAdScript } from "./direct";
import { buildAdTimeline } from "./edit";
import { emit, log, type Stage } from "./events";
import { explore } from "./explore";
import { jobPaths } from "./job";
import { BUDGET_USD, spend } from "./meta";
import { renderTimeline } from "./render";
import { shootScene } from "./shoot";
import { writeStoryboard } from "./storyboard";
import type { AdScript, AdTimeline, Exploration, Format, Score, Storyboard, Take } from "./types";

export const STAGES: Stage[] = ["explore", "storyboard", "shoot", "direct", "edit", "render"];

export type JobOptions = {
  url: string;
  jobId?: string;
  email?: string;
  password?: string;
  fresh?: Stage; // re-run from this stage, reusing everything before it
  scene?: string; // shoot only this scene
  format?: Format;
  root?: string;
};

export type Direction = { script: AdScript; score: Score };

// URL in, ad out. Each stage caches its result in renders/<job>/ so later stages can be
// re-run (after an edit, or a different format) without paying for earlier ones again.
export async function runJob(opts: JobOptions) {
  const root = opts.root ?? process.cwd();
  const format = opts.format ?? "16:9";
  const { id: jobId, workDir, statePath } = jobPaths(opts.url, opts.jobId, root);
  const freshFrom = opts.fresh ? STAGES.indexOf(opts.fresh) : Infinity;
  await fs.mkdir(workDir, { recursive: true });
  log(`Budget: $${spend.usd.toFixed(2)} spent of $${BUDGET_USD} cap`);

  async function stage<T>(name: Stage, run: () => Promise<T>, file = `${name}.json`): Promise<T> {
    const cachePath = path.join(workDir, file);
    if (STAGES.indexOf(name) < freshFrom) {
      try {
        const cached = JSON.parse(await fs.readFile(cachePath, "utf8")) as T;
        log(`• ${name}: cached`);
        emit({ type: "stage", stage: name, status: "cached" });
        return cached;
      } catch {}
    }
    log(`• ${name}…`);
    emit({ type: "stage", stage: name, status: "start" });
    const started = Date.now();
    const result = await run();
    await fs.writeFile(cachePath, JSON.stringify(result, null, 2));
    const seconds = (Date.now() - started) / 1000;
    log(`  ${name} done in ${seconds.toFixed(1)}s · this run $${spend.run.toFixed(2)} · total $${spend.usd.toFixed(2)} of $${BUDGET_USD}`);
    emit({ type: "stage", stage: name, status: "done", seconds, spendUsd: spend.run });
    return result;
  }

  const exp = await stage<Exploration>("explore", () =>
    explore(opts.url, { email: opts.email, password: opts.password }, statePath),
  );
  emit({ type: "card", card: "exploration", data: exp });

  const board = await stage<Storyboard>("storyboard", () => writeStoryboard(exp));
  emit({ type: "card", card: "storyboard", data: board });

  const takes = await stage<Take[]>("shoot", async () => {
    const done: Take[] = [];
    for (const scene of board.scenes) {
      if (opts.scene && scene.id !== opts.scene) continue;
      done.push(await shootScene(scene, exp, statePath, workDir));
    }
    return done;
  });
  const titles = new Map(board.scenes.map((s) => [s.id, s.title]));
  for (const t of takes) {
    emit({ type: "card", card: "take", data: { sceneId: t.sceneId, title: titles.get(t.sceneId), attempt: 0, ok: t.verified, reason: t.note } });
  }

  const backdropPath = path.join(workDir, "backdrop.png");
  const { script, score } = await stage<Direction>("direct", async () => {
    const script = await writeAdScript(exp, board, takes, path.join(workDir, "home.jpg"));
    const score = await composeScore(script);
    if (script.style.backdrop === "image") {
      // A failed painting just falls back to a generated gradient backdrop.
      await paintBackdrop(script.style, backdropPath).catch((err) => {
        log(`  ! backdrop failed (${err.message}); using a gradient instead`);
        script.style.backdrop = "mesh";
      });
    }
    return { script, score };
  });
  const st = script.style;
  log(`  ${script.mood} · ${st.theme} · ${st.displayFont}/${st.bodyFont} · ${st.motion} · ${st.frame} · ${st.backdrop}`);
  log(`  ${script.bpm} BPM · ${score.key} ${score.scale} · ${score.sound.kit} drums, ${score.sound.lead} lead, ${score.sound.pad} pad`);
  emit({ type: "card", card: "direction", data: { script, score } });

  const tag = format.replace(":", "x");
  const timeline = await stage<AdTimeline>(
    "edit",
    () => buildAdTimeline(jobId, exp, script, score, takes, path.join(root, "public"), backdropPath, format),
    `edit-${tag}.json`,
  );

  const out = path.join(workDir, `${jobId}-${tag}.mp4`);
  await stage(
    "render",
    async () => {
      await renderTimeline(timeline, out, root, (pct) => emit({ type: "card", card: "render", data: { pct } }));
      return { out };
    },
    `render-${tag}.json`,
  );
  log(`\n🎬 ${out}`);
  emit({ type: "done", video: out });
  return { jobId, workDir, out };
}
