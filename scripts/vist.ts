// URL in, launch video out. Each stage caches its result in renders/<job>/ so you can
// re-run later stages without paying for earlier ones (pass --fresh=<stage> to redo one).
//
//   npm run vist -- --url https://app.example.com --email demo@x.com --password secret
//   npm run vist -- --url https://app.example.com --fresh=storyboard
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { composeScore, paintBackdrop, writeAdScript } from "../src/pipeline/direct";
import { buildAdTimeline } from "../src/pipeline/edit";
import { jobPaths } from "../src/pipeline/job";
import { explore } from "../src/pipeline/explore";
import { BUDGET_USD, BudgetExceededError, spend } from "../src/pipeline/meta";
import { renderTimeline } from "../src/pipeline/render";
import { shootScene } from "../src/pipeline/shoot";
import { writeStoryboard } from "../src/pipeline/storyboard";
import type { AdScript, AdTimeline, Exploration, Score, Storyboard, Take } from "../src/pipeline/types";

const STAGES = ["explore", "storyboard", "shoot", "direct", "edit", "render"] as const;

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    email: { type: "string" },
    password: { type: "string" },
    job: { type: "string" },
    fresh: { type: "string" },
    scene: { type: "string" },
  },
});
if (!values.url) throw new Error("--url is required");

const url = values.url;
const root = process.cwd();
const { id: jobId, workDir, statePath } = jobPaths(url, values.job, root);
const freshFrom = values.fresh ? STAGES.indexOf(values.fresh as (typeof STAGES)[number]) : Infinity;

async function stage<T>(name: (typeof STAGES)[number], run: () => Promise<T>): Promise<T> {
  const file = path.join(workDir, `${name}.json`);
  if (STAGES.indexOf(name) < freshFrom) {
    try {
      const cached = JSON.parse(await fs.readFile(file, "utf8")) as T;
      console.log(`• ${name}: cached`);
      return cached;
    } catch {}
  }
  console.log(`• ${name}…`);
  const started = Date.now();
  const result = await run();
  await fs.writeFile(file, JSON.stringify(result, null, 2));
  console.log(`  ${name} done in ${((Date.now() - started) / 1000).toFixed(1)}s · this run $${spend.run.toFixed(2)} · total $${spend.usd.toFixed(2)} of $${BUDGET_USD}`);
  return result;
}

async function main() {
  console.log(`Budget: $${spend.usd.toFixed(2)} spent of $${BUDGET_USD} cap`);
  await fs.mkdir(workDir, { recursive: true });

  const exp = await stage<Exploration>("explore", () =>
    explore(url, { email: values.email, password: values.password }, statePath),
  );
  console.log(`  ${exp.summary}`);

  const board = await stage<Storyboard>("storyboard", () => writeStoryboard(exp));
  for (const s of board.scenes) console.log(`  ${s.id} ${s.title}: ${s.narration}`);

  const takes = await stage<Take[]>("shoot", async () => {
    const done: Take[] = [];
    for (const scene of board.scenes) {
      if (values.scene && scene.id !== values.scene) continue;
      done.push(await shootScene(scene, exp, statePath, workDir));
    }
    return done;
  });

  const backdropPath = path.join(workDir, "backdrop.png");
  const ad = await stage<{ script: AdScript; score: Score }>("direct", async () => {
    const script = await writeAdScript(exp, board, takes, path.join(workDir, "home.jpg"));
    const score = await composeScore(script);
    if (script.style.backdrop === "image") {
      // A failed painting just falls back to a generated gradient backdrop.
      await paintBackdrop(script.style, backdropPath).catch((err) => {
        console.warn(`  ! backdrop failed (${err.message}); using a gradient instead`);
        script.style.backdrop = "mesh";
      });
    }
    return { script, score };
  });
  const { script, score } = ad;
  const st = script.style;
  console.log(`  ${script.mood} · ${st.theme} · ${st.displayFont}/${st.bodyFont} · ${st.motion} · ${st.frame} · ${st.backdrop}`);
  console.log(`  ${script.bpm} BPM · ${score.key} ${score.scale} · ${score.sound.kit} drums, ${score.sound.lead} lead, ${score.sound.pad} pad · ${script.shots.map((s) => s.kind).join(" → ")}`);

  const timeline = await stage<AdTimeline>("edit", () =>
    buildAdTimeline(jobId, exp, ad.script, ad.score, takes, path.join(root, "public"), backdropPath),
  );

  await stage("render", async () => {
    const out = path.join(workDir, `${jobId}.mp4`);
    await renderTimeline(timeline, out, root);
    console.log(`\n🎬 ${out}`);
    return { out };
  });
}

main().catch((err) => {
  if (err instanceof BudgetExceededError) {
    console.error(`\n⛔ ${err.message}`);
    process.exit(2);
  }
  console.error(err);
  process.exit(1);
});
