"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function CreateForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [invite, setInvite] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      setInvite(localStorage.getItem("vist-invite") ?? "");
    } catch {}
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      localStorage.setItem("vist-invite", invite);
    } catch {}
    const check = await fetch("/api/invite", { method: "POST", body: JSON.stringify({ code: invite }) }).then((r) => r.json());
    if (!check.ok) {
      setError(check.reason);
      setBusy(false);
      return;
    }
    if (needsLogin) {
      router.push(`/connect?url=${encodeURIComponent(url)}`);
      return;
    }
    const res = await fetch("/api/jobs", { method: "POST", body: JSON.stringify({ url, invite }) });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error);
      setBusy(false);
      return;
    }
    router.push(`/studio/${body.id}`);
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-3 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="yourproduct.com"
          className="min-w-0 flex-1 rounded-xl bg-background px-4 py-3.5 text-base outline-none ring-ink/10 focus:ring-2"
        />
        <button
          disabled={busy}
          className="rounded-xl bg-ink px-6 py-3.5 font-medium text-background transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Starting…" : "Make my ad"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-2 pb-1 text-sm">
        <label className="flex cursor-pointer items-center gap-2 text-muted">
          <input type="checkbox" checked={needsLogin} onChange={(e) => setNeedsLogin(e.target.checked)} className="accent-ink" />
          My product needs a login
        </label>
        <input
          required
          value={invite}
          onChange={(e) => setInvite(e.target.value)}
          placeholder="Invite code"
          className="w-40 rounded-lg border border-line bg-background px-3 py-1.5 outline-none focus:border-ink/30"
        />
      </div>
      {error && <p className="px-2 pt-2 text-sm text-live">{error}</p>}
    </form>
  );
}
