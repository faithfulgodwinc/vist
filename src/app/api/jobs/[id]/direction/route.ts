import { NextResponse } from "next/server";
import type { Direction } from "@/pipeline/run";
import { getJob, readDirection, rerender } from "@/server/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = getJob((await params).id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    return NextResponse.json(await readDirection(job));
  } catch {
    return NextResponse.json({ error: "Not ready yet" }, { status: 409 });
  }
}

// Saves edits from the shot strip and style controls, then re-cuts the ad.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = getJob((await params).id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const direction = (await req.json()) as Direction;
  if (!direction?.script?.shots?.length || direction.script.shots[direction.script.shots.length - 1].kind !== "logo") {
    return NextResponse.json({ error: "The ad needs at least one shot and must end on the logo." }, { status: 400 });
  }
  try {
    await rerender(job, direction);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 409 });
  }
}
