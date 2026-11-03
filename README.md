# Vist: your launch ad, made by an agent

Paste your product's URL. Vist's agent **uses your product by itself**, finds what makes it great, films those moments, and cuts a **motion-graphics launch ad with an original soundtrack**: designed for your brand, cut on the beat, exported for landscape, vertical and square. No screen recording, no editing.

Built for the **Meta Global AI Developer Hackathon 2026** (Startup track, theme: *Build for Your World*).

## Everything here was built during the hackathon

This repository was created on **Oct 29, 2026**, after the hackathon started (Oct 26). Every line of the pipeline, the renderer, the synthesizer and the web app was written during the event. There is no pre-existing codebase; the only scaffold is the stock `create-next-app` template (first commit).

## How Vist uses Meta's models

| Step | Meta model | What it does |
|---|---|---|
| **Explore** | **Muse Spark 1.3 · computer use** | Signs in with your session and operates your product in a real browser (Playwright), mapping its most demo-worthy features |
| **Storyboard** | **Muse Spark 1.3** | Plans shots that show each feature working, never login or onboarding |
| **Shoot + review** | **Muse Spark 1.3 · computer use + vision** | Performs each shot while it's recorded, then **checks the final frame against the script** and re-shoots takes that miss (a self-verifying agent) |
| **Direct** | **Muse Spark 1.3 · vision** | Writes a beat-timed ad script and **designs a unique style kit** from your screenshots: palette, font pairing, motion personality, layout, product frame, backdrop |
| **Backdrop** | **Muse Image** | Paints abstract art in your brand's mood and palette |
| **Score** | **Muse Spark 1.3 as composer** | Writes the soundtrack as a score (tempo, key, chords, drum/bass patterns per energy level, sound palette), which Vist's own synthesizer plays, so every cut lands on the beat |

Spark doesn't generate audio, so Vist turns it into a composer: it writes structured music that a small offline synthesizer performs (pads, bass, drums in four kits, piano/bell/pluck/saw leads, risers, sidechain). Every ad gets an original, licence-free score tied to its edit grid.

## What makes it work

- **Idle-time cutting.** The agent thinks for seconds between actions; Vist logs every action with timestamps and keeps only the moments around real interactions, then re-syncs the footage to the action log.
- **Auto-zoom and a synthetic cursor**, driven by the logged clicks, kept inside the page bounds.
- **Per-product design system.** Light/dark/brand themes, 16 Google font pairings, snappy/smooth/bouncy motion, browser/floating/bleed frames, glow/mesh/grid/solid/painted backdrops, with automatic contrast correction.
- **Real numbers only.** Stat shots must come from what the agent saw on your main screen.
- **Live agent theatre.** The web studio streams what the agent sees, stage by stage, as the ad is made.
- **Live remote sign-in.** Products behind email-code or OAuth logins are signed into through a browser streamed into the page; Vist keeps the session, never the password.
- **Safety rails.** The agent never pays, donates, publishes or submits anything public; it fills forms to demonstrate them and stops before the final button.
- **Hard spend cap.** Every Meta API call goes through a budget guard ($20 by default) that refuses to send once the cap is reached.

## Architecture

```
src/pipeline/   explore → storyboard → shoot (+ review) → direct → edit → render
                agent.ts (Muse computer-use loop), synth.ts (music), direct.ts (director/composer)
src/remotion/   VistAd.tsx: the motion-graphics composition (responsive 16:9 / 9:16 / 1:1)
src/server/     job queue, invite codes, remote sign-in browser
src/app/        Next.js web app: landing, sign-in, studio (live theatre, reveal, editor)
scripts/        CLI (vist.ts), guided login, offline test (no API calls)
```

Each stage caches its result, so edits and new formats re-cut the ad from saved footage without new agent work or API calls.

## Run it

```bash
npm install
npx playwright install chromium
cp .env.example .env          # add MODEL_API_KEY and invite codes
npm run dev                   # web app at http://localhost:3000

# or from the terminal
npm run vist:login -- --url https://yourproduct.com   # sign in once, if needed
npm run vist -- --url https://yourproduct.com
npm run vist -- --url https://yourproduct.com --fresh=edit --format=9:16
```

Deploy: the included `Dockerfile` (Playwright base image) runs on Railway, Render or Fly. Set `MODEL_API_KEY`, `VIST_INVITES` and optionally `VIST_BUDGET_USD`.
