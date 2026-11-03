"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const SPECIAL_KEYS = new Set(["Enter", "Backspace", "Tab", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Delete", "Home", "End"]);

// A browser running on Vist's server, shown live in the page. Clicks and keys are forwarded,
// so people can sign in with email codes, Google, anything, without giving Vist a password.
export function RemoteBrowser({ url }: { url: string }) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [finishing, setFinishing] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const [invite, setInvite] = useState<string | null>(null);

  useEffect(() => {
    try {
      setInvite(localStorage.getItem("vist-invite") ?? "");
    } catch {
      setInvite("");
    }
  }, []);

  useEffect(() => {
    if (invite === null) return;
    let cancelled = false;
    fetch("/api/remote", { method: "POST", body: JSON.stringify({ url, invite }) })
      .then((r) => r.json())
      .then((b) => (cancelled ? null : b.id ? setId(b.id) : setError(b.error)));
    return () => {
      cancelled = true;
    };
  }, [url, invite]);

  // Pull a fresh frame a few times a second; object URLs avoid flicker between frames.
  useEffect(() => {
    if (!id) return;
    let alive = true;
    let last: string | null = null;
    const tick = async () => {
      const res = await fetch(`/api/remote/${id}/frame`, { cache: "no-store" }).catch(() => null);
      if (res?.status === 410) return setError("This sign-in window expired. Refresh to start again.");
      if (res?.ok && res.status === 200) {
        const next = URL.createObjectURL(await res.blob());
        setSrc(next);
        if (last) URL.revokeObjectURL(last);
        last = next;
      }
      if (alive) setTimeout(tick, 450);
    };
    tick();
    surface.current?.focus();
    return () => {
      alive = false;
    };
  }, [id]);

  const send = (payload: object) => id && fetch(`/api/remote/${id}/input`, { method: "POST", body: JSON.stringify(payload) });

  function onClick(e: React.MouseEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    send({ type: "click", x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height });
    surface.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.metaKey || e.ctrlKey) {
      if (e.key.toLowerCase() === "v") return; // let the paste event handle it
      e.preventDefault();
      send({ type: "key", key: `Control+${e.key}` });
      return;
    }
    if (SPECIAL_KEYS.has(e.key)) {
      e.preventDefault();
      send({ type: "key", key: e.key });
    } else if (e.key.length === 1) {
      e.preventDefault();
      send({ type: "type", text: e.key });
    }
  }

  async function done() {
    if (!id) return;
    setFinishing(true);
    const fin = await fetch(`/api/remote/${id}/finish`, { method: "POST" }).then((r) => r.json());
    if (!fin.sessionId) {
      setError(fin.error);
      setFinishing(false);
      return;
    }
    const res = await fetch("/api/jobs", { method: "POST", body: JSON.stringify({ url, invite, sessionId: fin.sessionId }) });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error);
      setFinishing(false);
      return;
    }
    router.push(`/studio/${body.id}`);
  }

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_30px_80px_-40px_rgba(0,0,0,0.3)]">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3 text-sm">
          <span className="flex gap-1.5">
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <span key={c} className="h-3 w-3 rounded-full" style={{ background: c }} />
            ))}
          </span>
          <span className="flex-1 truncate rounded-md bg-background px-3 py-1 text-muted">{url}</span>
          <span className="flex items-center gap-1.5 text-xs text-live">
            <span className="live-dot h-2 w-2 rounded-full bg-live" /> Live
          </span>
        </div>
        <div
          ref={surface}
          tabIndex={0}
          onClick={onClick}
          onKeyDown={onKeyDown}
          onPaste={(e) => send({ type: "type", text: e.clipboardData.getData("text") })}
          onWheel={(e) => send({ type: "scroll", dy: e.deltaY })}
          className="relative aspect-[16/10] cursor-pointer bg-background outline-none"
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="Your product, live" className="h-full w-full select-none object-contain" draggable={false} />
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted">{error || "Opening your product…"}</div>
          )}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-md text-sm text-muted">
          Click and type in the window above to sign in the way you normally do. Vist never sees your password; it only keeps the signed-in session.
        </p>
        <button onClick={done} disabled={!id || finishing} className="rounded-xl bg-ink px-6 py-3 font-medium text-background disabled:opacity-50">
          {finishing ? "Saving session…" : "I'm signed in → make my ad"}
        </button>
      </div>
      {error && src && <p className="mt-3 text-sm text-live">{error}</p>}
    </div>
  );
}
