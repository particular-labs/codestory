# codestory promo — "Your code has a story"

Apple-style product film · 16:9 · ~55s · dark · no VO (music + SFX only)

## Research summary

- **Product truth** (README + viewer): living journey maps; journeys = steps/decisions/exits; exits chain to entries via ports; agents keep maps in sync; `validate` gates the contract; viewer at :4747; `npx @particular-labs/codestory init`.
- **Visual language** (viewer screenshot, shot-demo fixture): near-black slate UI, indigo `#6366f1`-family accents, green **built** / amber **drifted** status dots, rounded node cards, edge chips, mono type. Brand (PL SSOT): Syne for hooks, DM Mono body, dark default.
- **Apple grammar**: single subject floating in a void, slow camera pushes/glides, spring-eased assembly, copy in short declaratives that fade in/track out, one idea per shot, silence + minimal pulse bed.
- **Engine**: **Remotion** (programmatic — exact UI, brand-exact colors, deterministic, free, re-renderable per release). Generative video (Veo/Sora) would hallucinate the UI; at most an optional abstract opener. SFX from studio kit; minimal electronic bed.
- **Content safety**: all on-screen journeys use the fictional shot-demo / Astro Outfitters fixtures — no real project data.

## Storyboard

| # | Time | Shot | Motion | On-screen copy (EN / ES caption variant) | Audio |
|---|------|------|--------|------------------------------------------|-------|
| 1 | 0–4s | Black void. A single green status dot pulses center-frame. | Slow push-in; dot breathes. | `Your code has a story.` / `Tu código tiene una historia.` | Low sub-pulse fades in. |
| 2 | 4–10s | Ghosted artifacts drift past: a stale wiki page, a whiteboard diagram, an outdated flowchart — desaturated, slightly blurred. | Lateral drift; each blurs out and dissolves. | `Docs drift. Diagrams rot.` / `La documentación se desactualiza.` | Bed thins; faint paper/static texture. |
| 3 | 10–18s | **Reveal.** From the void, journey nodes spring-assemble: *Receive request → Validate payload → ◇ Needs review?* — edges draw themselves, branch chips (`low risk` / `high risk`) pop in. | Spring easing on each card; edges animate stroke-dashoffset; camera orbits ~5°. | Wordmark **codestory** fades in below. `Living journey maps for your codebase.` / `Mapas vivos de los flujos de tu código.` | Bed returns with a lift; soft click per node. |
| 4 | 18–26s | Camera glides right: an **exit port** lights up, a link arcs across the void into another journey's **entry**. Zoom out — journeys chain into a full end-to-end map. | Continuous dolly; arc draws with light trail; scale-out to map. | `Journeys chain into one map.` / `Los flujos se conectan en un solo mapa.` | Whoosh on the arc; bed adds a layer. |
| 5 | 26–34s | Split moment: code diff scrolls softly on the left; on the right a node's dot flips **amber (drifted) → green (built)**. | Diff scroll + dot color morph with a small ripple. | `Agents keep it in sync with the code.` / `Los agentes lo mantienen sincronizado con el código.` | Tick SFX on the flip. |
| 6 | 34–44s | The real viewer UI floats in 3D — full dark interface, personas rail, step-through bar animating `1/8 → 2/8`, contract panel (in/out, acceptance checks) sliding up. | Slow parallax push; subtle glass reflection sweep across the panel. | `Step through the flow.` / `Recorre el flujo paso a paso.` | Bed at full; soft UI ticks per step. |
| 7 | 44–55s | Void again. Terminal types on: `npx @particular-labs/codestory init` … `codestory present`. Viewer blooms from the terminal. **End card**: codestory wordmark · `particular-labs.github.io/codestory` · `MIT · Particular Labs`. | Type-on cursor; bloom transition; end card settles, everything else fades. | `Start in one command.` / `Empieza con un solo comando.` | Bed resolves to a single sustained tone; final click. |

## Production plan (after approval)

1. Remotion project at `marketing/promo-video/remotion/` — one composition, 7 `<Sequence>`s, brand tokens pulled from the viewer CSS.
2. Node/edge scenes rebuilt as React components (exact viewer styling); scene 6 uses a captured viewer render of the shot-demo fixture.
3. Music bed: minimal pulse (studio music gen, or licensed-free fallback); SFX from `+studio/domains/media/sfx/kit/`.
4. Two caption tracks: EN burn-in (primary cut), ES variant cut.
5. Render 1080p and a 9:16 crop of scenes 1/3/7 for social.
