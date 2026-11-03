import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { getJob } from "@/server/jobs";
import type { Format } from "@/pipeline/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Streams the rendered ad with range support so the player can seek; ?download=1 saves it.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = getJob((await params).id);
  const search = new URL(req.url).searchParams;
  const format = (search.get("format") ?? "16:9") as Format;
  const file = job?.videos[format];
  if (!job || !file) return new Response("Not found", { status: 404 });

  const { size } = await fs.stat(file);
  const headers: Record<string, string> = { "Content-Type": "video/mp4", "Accept-Ranges": "bytes" };
  if (search.get("download")) {
    headers["Content-Disposition"] = `attachment; filename="${job.id}-${format.replace(":", "x")}.mp4"`;
  }

  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(body, { headers: { ...headers, "Content-Length": String(size) } });
}
