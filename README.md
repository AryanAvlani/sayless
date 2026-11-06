# Sayless — reel engine and posting system

Faceless Instagram page **@sayless_verb**: "How your stuff actually works" — 3D explainers of everyday tech.

## How a reel is made
1. **Topic + facts** — pick an everyday object; every claim checked against a first-party or primary source, listed in `reels/<slug>/sources.md`.
2. **Script + voice** — `reels/<slug>/vo.py` writes the lines and renders the voiceover with Kokoro TTS (voice `am_michael`, speed 1.1). Output: `vo.wav`, `vo.json` (line + word timings).
3. **Visuals** — a Remotion + three.js composition in `engine/src/<Name>Reel.tsx`, built from `engine/src/lib.tsx` (camera keys, captions, labels, end card, grade).
4. **Sound** — `engine/tools/mix.py <reel_dir> cues.json`: voice + original music bed + effects → `mix.wav`.
5. **Render** — `npx remotion render src/index.ts <Comp> out/x.mp4 --gl=swangle --codec h264 --crf 16 --muted`, then mux with `mix.wav` (H.264 High, yuv420p, AAC 48 kHz, `+faststart`).
6. **QC** — scan every frame for blank/flicker frames, contact-sheet review, fact re-check.

## How posting works (no manual uploads)
- Finished reels go on the **`media`** branch (served by GitHub Pages). That branch is replaced each week, so videos never pile up in git history.
- `queue/queue.json` lists each reel: file, caption, `publish_at` (UTC), status.
- `.github/workflows/publish.yml` runs every 30 min and publishes whatever is due through the official Instagram API (`scripts/publish.py`).
- The access token is a system-user token that never expires (app: Sayless Publisher, business portfolio: Sayless).

### Secrets (set once, by the owner)
- `IG_TOKEN` — never-expiring system-user access token (Graph API host graph.facebook.com).
- Instagram account ID 17841475226001074 (@sayless_verb) is set in the workflows.

## Weekly loop
Research → 3–4 reels → QC → queue → auto-post → read insights → adjust topics/hooks.

## Adding reels (for the reel-making session)
1. Finish the reel (MP4, 1080x1920) and write its caption (end with "Voiceover is AI-generated." when the voice is AI).
2. From a clone of this repo: `python3 scripts/add_reel.py path/to/reel.mp4 <slug> "<caption>"` — adds it as a **draft** (hosted, never posted).
3. To schedule: set `publish_at` (e.g. `2026-11-08T19:00:00+05:30`) and `status: "queued"` in `queue/queue.json`, commit, push. The publisher posts it within 30 min of that time — only after the owner approves the schedule.
4. Optional safety check before scheduling: run the **dryrun** workflow with the file name (Instagram processes the video, nothing is posted).

## Status checks
- `check` workflow: token + account + posting quota (read-only).
- `insights` workflow: Mondays, writes `insights/<date>.json` (followers, views, reach, shares, saves, watch time).
- A failed `publish` run emails the repo owner (GitHub default).
