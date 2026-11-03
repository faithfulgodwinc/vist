import { NextResponse } from "next/server";
import { finish } from "@/server/remote";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  try {
    await finish(id);
    return NextResponse.json({ sessionId: id });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 410 });
  }
}
