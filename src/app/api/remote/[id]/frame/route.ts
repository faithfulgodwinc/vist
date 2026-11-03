import { frame, getRemote } from "@/server/remote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = getRemote((await params).id);
  if (!r) return new Response("Expired", { status: 410 });
  const jpeg = await frame(r).catch(() => null);
  if (!jpeg) return new Response(null, { status: 204 });
  return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
}
