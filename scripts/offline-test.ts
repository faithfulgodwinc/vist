// Exercises shoot-recording → edit → render with scripted actions instead of a model,
// so the video side can be tested without spending API credits.
//   node --import tsx scripts/offline-test.ts
import fs from "node:fs/promises";
import path from "node:path";
import { Driver, launch, newContext } from "../src/pipeline/browser";
import { buildAdTimeline } from "../src/pipeline/edit";
import { renderTimeline } from "../src/pipeline/render";
import type { AdScript, Exploration, Score, Take } from "../src/pipeline/types";

const PAGE = `<!doctype html><html><head><title>Taskly</title><meta name="theme-color" content="#ff6a3d"></head>
<body style="font-family:system-ui;margin:0;background:#f6f6f8">
<header style="padding:18px 32px;background:white;border-bottom:1px solid #e5e5ea;font-weight:700;font-size:20px">Taskly</header>
<main style="padding:40px 32px;max-width:720px">
  <h1>Your tasks</h1>
  <div style="display:flex;gap:12px"><input id="t" placeholder="New task" style="flex:1;padding:14px;font-size:16px;border:1px solid #ccc;border-radius:10px">
  <button id="add" style="padding:14px 22px;font-size:16px;background:#ff6a3d;color:white;border:0;border-radius:10px">Add task</button></div>
  <ul id="list" style="font-size:18px;line-height:2"></ul>
</main>
<script>document.getElementById('add').onclick=()=>{const v=document.getElementById('t');const li=document.createElement('li');li.textContent='✅ '+v.value;document.getElementById('list').append(li);v.value=''}</script>
</body></html>`;

const root = process.cwd();
const jobId = "offline-test";
const workDir = path.join(root, "renders", jobId);

async function main() {
  await fs.mkdir(workDir, { recursive: true });
  const pageFile = path.join(workDir, "page.html");
  await fs.writeFile(pageFile, PAGE);
  const url = "file:///" + pageFile.replace(/\\/g, "/");

  const browser = await launch();
  const context = await newContext(browser, { recordDir: path.join(workDir, "raw") });
  const page = await context.newPage();
  const driver = new Driver(page);
  driver.resetClock();
  await page.goto(url);
  await driver.settle();

  // Simulate the model "thinking" between batches, which the editor should cut out.
  const think = () => page.waitForTimeout(2500);
  await think();
  await driver.execute([{ type: "click", x: 330, y: 213 }]);
  await think();
  await driver.execute([{ type: "type", text: "Ship the launch video" }]);
  await think();
  await driver.execute([{ type: "click", x: 698, y: 213 }]);
  await page.waitForTimeout(1200);

  const endShot = path.join(workDir, "s1-end.png");
  await page.screenshot({ path: endShot });
  const video = page.video()!;
  const durationMs = driver.now();
  await context.close();
  const videoPath = path.join(workDir, "s1.webm");
  await video.saveAs(videoPath);
  await browser.close();

  const take: Take = { sceneId: "s1", video: videoPath, durationMs, events: driver.events, endShot, verified: true };
  const exp: Exploration = {
    brand: { url: "https://taskly.app", name: "Taskly", tagline: "", primary: "#ff6a3d", background: "#f6f6f8" },
    homeUrl: url,
    summary: "",
    features: [],
  };
  // A hand-written ad script and score stand in for the director and composer.
  const script: AdScript = {
    mood: "clean focused productivity",
    bpm: 104,
    style: {
      theme: "light",
      palette: { primary: "#ff6a3d", secondary: "#7c5cff", background: "#fbf7f2", ink: "#16130f", muted: "#6b645c" },
      displayFont: "Fraunces",
      bodyFont: "Inter",
      caps: false,
      motion: "smooth",
      align: "left",
      frame: "floating",
      backdrop: "mesh",
      imagePrompt: "",
      radius: 28,
    },
    shots: [
      { kind: "text", beats: 8, energy: 1, lines: ["Your to-do list", "is lying to you."] },
      { kind: "text", beats: 4, energy: 1, lines: ["Meet Taskly."] },
      { kind: "clip", beats: 16, energy: 3, sceneId: "s1", caption: "Add in a blink", sub: "Type it, hit add, it's on your list." },
      { kind: "stat", beats: 6, energy: 2, value: "3.2s", label: "to capture a task" },
      { kind: "features", beats: 10, energy: 3, items: ["No setup", "No clutter", "Just done"] },
      { kind: "logo", beats: 8, energy: 2, tagline: "Get it out of your head." },
    ],
  };
  const groove = { kick: "x...x...x...x...", snare: "....x.......x...", hat: "..x...x...x...x.", bass: "x..x..x...x..x..", arp: false };
  const score: Score = {
    sound: { kit: "soft", lead: "piano", pad: "airy", swing: 0.12 },
    key: "A",
    scale: "minor",
    progression: ["Am", "F", "C", "G"],
    padBrightness: 0.55,
    patterns: {
      "0": { kick: ".".repeat(16), snare: ".".repeat(16), hat: ".".repeat(16), bass: ".".repeat(16), arp: false },
      "1": { ...groove, kick: "x.......x.......", snare: ".".repeat(16), bass: ".".repeat(16) },
      "2": groove,
      "3": { ...groove, hat: "x.xxx.xxx.xxx.xx", arp: true },
    },
  };

  const timeline = await buildAdTimeline(jobId, exp, script, score, [take], path.join(root, "public"));
  const segments = timeline.clips.s1.segments;
  const cut = segments.reduce((s, g) => s + g.to - g.from, 0) / 1000;
  console.log(`raw ${(durationMs / 1000).toFixed(1)}s → cut ${cut.toFixed(1)}s · ad ${(timeline.durationInFrames / 30).toFixed(1)}s`);

  const out = path.join(workDir, "offline-test.mp4");
  await renderTimeline(timeline, out, root);
  console.log(`🎬 ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
