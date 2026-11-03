import { CreateForm } from "@/components/CreateForm";
import { Showcase } from "@/components/Showcase";

const STEPS = [
  { title: "Explore", model: "Muse Spark · computer use", text: "An agent signs in and uses your product like a new customer, mapping what makes it great." },
  { title: "Shoot", model: "Muse Spark · vision review", text: "It records each feature in action and re-shoots any take that doesn't show the result." },
  { title: "Direct", model: "Muse Spark · Muse Image", text: "A creative director writes the ad, designs a style kit for your brand, and paints the backdrop." },
  { title: "Score & cut", model: "Composed by Spark", text: "Spark composes an original soundtrack, and Vist cuts motion graphics on the beat." },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6 pb-24">
      <section className="pt-10 text-center">
        <h1 className="mx-auto max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">
          Your launch ad,
          <br />
          made by an agent.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
          Paste your product URL. Vist uses your product, finds what&apos;s great, and cuts a motion-graphics ad with an original soundtrack. No recording. No editing.
        </p>
      </section>

      <section className="mx-auto mt-12 max-w-4xl overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_30px_80px_-30px_rgba(0,0,0,0.25)]">
        <Showcase name="goodcause" />
      </section>
      <p className="mt-3 text-center text-sm text-muted">Made by Vist for goodcause.app — nobody recorded or edited anything.</p>

      <section className="mx-auto mt-14 max-w-2xl">
        <CreateForm />
      </section>

      <section id="how" className="mt-28">
        <h2 className="text-center text-3xl font-semibold tracking-tight">How Vist makes your ad</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-2xl border border-line bg-surface p-6">
              <div className="text-sm text-muted">0{i + 1}</div>
              <div className="mt-3 text-lg font-semibold">{s.title}</div>
              <div className="mt-1 text-xs font-medium text-live">{s.model}</div>
              <p className="mt-3 text-sm leading-relaxed text-muted">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-24">
        <h2 className="text-center text-3xl font-semibold tracking-tight">Every product gets its own look and sound</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-muted">Fonts, colours, motion, layout and music are designed for each brand. No templates.</p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {[
            { file: "goodcause", name: "goodcause", note: "Light · Outfit · smooth · soft drums & piano" },
            { file: "taskly", name: "Taskly", note: "Cream · Fraunces · editorial · airy pads" },
          ].map((v) => (
            <figure key={v.name} className="overflow-hidden rounded-2xl border border-line bg-surface">
              <Showcase name={v.file} />
              <figcaption className="flex items-center justify-between px-5 py-4 text-sm">
                <span className="font-medium">{v.name}</span>
                <span className="text-muted">{v.note}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    </main>
  );
}
