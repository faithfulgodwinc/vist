import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { AdTimeline } from "./types";

export async function renderTimeline(timeline: AdTimeline, outFile: string, root = process.cwd()) {
  const serveUrl = await bundle({
    entryPoint: path.join(root, "src/remotion/index.tsx"),
    publicDir: path.join(root, "public"),
  });
  const inputProps = timeline as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl, id: "VistAd", inputProps });

  let lastPct = -10;
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outFile,
    inputProps,
    // Laptops with little free RAM evict frames before they are used; keep local renders lean.
    concurrency: Number(process.env.VIST_RENDER_CONCURRENCY ?? 1),
    offthreadVideoCacheSizeInBytes: 256 * 1024 * 1024,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 100);
      if (pct >= lastPct + 10) {
        lastPct = pct;
        console.log(`  render ${pct}%`);
      }
    },
  });
  return outFile;
}
