import { getJob } from "@/server/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The latest screenshot the agent saw, for the live theatre view.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = getJob((await params).id);
  if (!job?.frame) return new Response(null, { status: 204 });
  return new Response(new Uint8Array(job.frame), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
}
