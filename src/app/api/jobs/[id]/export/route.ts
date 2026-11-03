import { NextResponse } from "next/server";
import { getJob, rerender } from "@/server/jobs";
import { FORMAT_SIZE, type Format } from "@/pipeline/types";

export const runtime = "nodejs";

// Renders the same ad in another aspect ratio (vertical for Reels/TikTok, square for feeds).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = getJob((await params).id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { format } = (await req.json()) as { format: Format };
  if (!(format in FORMAT_SIZE)) return NextResponse.json({ error: "Unknown format" }, { status: 400 });
  if (job.videos[format]) return NextResponse.json({ ok: true, ready: true });
  try {
    await rerender(job, undefined, format);
    return NextResponse.json({ ok: true, ready: false });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 409 });
  }
}
