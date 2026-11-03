import { RemoteBrowser } from "@/components/RemoteBrowser";

export default async function Connect({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const { url } = await searchParams;
  const target = url && !/^https?:\/\//.test(url) ? `https://${url}` : url;
  return (
    <main className="mx-auto max-w-5xl px-6 pb-24 pt-6">
      <h1 className="text-3xl font-semibold tracking-tight">Sign in to your product</h1>
      <p className="mt-2 text-muted">Vist&apos;s agent will start from your signed-in screen, so it can show the real product, not the login page.</p>
      <div className="mt-8">{target ? <RemoteBrowser url={target} /> : <p className="text-live">Missing product URL.</p>}</div>
    </main>
  );
}
