import { getJob } from "@/server/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-sent events: replays everything so far, then streams new events as they happen.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = getJob((await params).id);
  if (!job) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      send({ type: "status", status: job.status });
      for (const e of job.events) send(e);
      if (job.frameCount) send({ type: "frame", count: job.frameCount });

      const listener = (e: unknown) => send(e);
      job.listeners.add(listener);
      const heartbeat = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 15000);
      cleanup = () => {
        clearInterval(heartbeat);
        job.listeners.delete(listener);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        controller.close();
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    // Compression buffers the stream, so events would arrive in bursts or not at all.
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Content-Encoding": "none",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
