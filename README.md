# Sentinel

> A local, explainable web prototype to review the health indicators of astronauts during a long space mission: see what changed, why it was flagged, and record a human decision.

🇪🇸 [Versión en español](README.es.md)

**NASA Space Apps Challenge 2026** · Challenge: monitoring astronaut health during missions
**Team:** Sentinel · **Live demo:** https://sentinel-projectt.netlify.app/ · **Demo:** https://docs.google.com/presentation/d/1QW6c57K_g7T_IAXg9_s__zVtZIluKyOU/edit?usp=sharing&ouid=112804907578764469712&rtpof=true&sd=true

## Authors

- Sebastian Avalos

## Table of Contents

- [Description](#description)
- [Features](#features)
- [NASA data and resources](#nasa-data-and-resources)
- [Try it in 90 seconds](#try-it-in-90-seconds)
- [Run it locally](#run-it-locally)
- [Project structure](#project-structure)
- [Tests](#tests)
- [Technologies](#technologies)
- [Use of AI](#use-of-ai)
- [Scope and limitations](#scope-and-limitations)
- [Future work](#future-work)

## Description

On long-duration missions, crews cannot rely on constant contact with Earth. **Sentinel** is a prototype that helps review personal health indicators on board: it compares each crew member with their *own* baseline, shows the evidence behind every flag, keeps missing data visible instead of hiding it, and leaves every decision to a person.

It is a **replay of a simulated 120-day mission** (not live telemetry) with three fictitious crew members and three scenarios: nominal mission, sustained change, and incomplete data. It also lets you import your own measurements from a CSV.

The application runs in the browser with no server, accounts or installation, and keeps working offline ("on board" mode). Only the optional NASA RadLab query uses the network.

```
Simulated mission or CSV  →  Validate and explore  →  Add mission context  →  Record review / decision  →  Save summary locally
```

## Features

- **Explainable review:** pulse, sleep and reaction time against a personal baseline, with the evidence and the rule that triggered each flag. Missing readings show as gaps and are never treated as zero.
- **Mission timeline:** 120 days with key milestones (launch, orbital insertion, EVA, re-entry, closing). Select a milestone to inspect the day and compare any two days (B minus A).
- **Systems summary:** cardiovascular, rest and recovery, conditioning, and environment/radiation, labelled "expected in script / to review / not evaluable" instead of clinical states.
- **Human decisions:** daily check-in, review notes, follow-up options, mission log and pending tasks, saved locally per crew member and scenario.
- **Bring your own data:** CSV import with column and unit mapping, validation (dates, duplicates, ranges), person and period filters, two-period comparison, JSON mission files and a standalone HTML report.
- **Optional NASA RadLab context:** in the own-data panel, query public historical ISS radiation readings (DosTel instrument) for up to 7 days. Only the dates and fixed ISS/DosTel filters are sent; your CSV, names, notes and health data never leave the browser.
- **Local summary:** a printable/copyable summary prepared on board for a future communication. Nothing is transmitted to Earth.
- **Mission soundscape (optional):** ambient sound and milestone cues synthesized in the browser with Web Audio. Off by default.
- **Guided demo:** a six-step, ~90 second tour from baseline to summary.

## NASA data and resources

- **NASA Open Science Data Repository (OSDR) · Environmental Data Application (EDA):** a local snapshot of historical ISS cabin CO₂ from mission RR-1 (21 Sep 2014, 00:04–00:59 UTC, 12 readings between 2,855 and 2,886 ppm). It is shown as independent environmental context and is **not** linked to the fictitious crew.
- **NASA OSDR RadLab Data API:** optional live query of historical ISS radiation (DosTel), shown separately from the user's own measurements.
- **NASA ISS exercise pages:** linked as a general educational reference.
- Personal indicators, radiation and cabin values inside the simulation are **fictitious**, and the review rules are **didactic, not NASA thresholds**.

## Try it in 90 seconds

1. Open `dist/index.html` (it redirects to `dist/replay.html`), or the live demo.
2. Choose **Watch the guided demo · 90 s** to follow the six-step tour with Crew member A.
3. Or choose a crew member, a scenario and a start day, then **Enter the mission panel**.
4. To test your own data, choose **Import and review your own data** and download the example CSV.

## Run it locally

No installation is needed. Open `index.html` (or `dist/index.html`) in a modern browser (Chrome, Edge, Brave, Firefox). To host it, upload the repository to any static host (for example GitHub Pages).

To run the tests you need [Node.js](https://nodejs.org/) 18 or newer. The logic tests need no packages.

## Project structure

```
.
├── index.html            # Redirects to dist/ (lets GitHub Pages serve the root)
├── dist/
│   ├── index.html        # Entry point (redirects to replay.html)
│   ├── replay.html       # Main application (HTML, CSS and JavaScript)
│   ├── audio.js          # Synthesized ambient sound and cues
│   └── assets/           # Local background image (AI-generated, watermarked)
├── work/                 # Verification scripts (verify-*.cjs)
├── docs/                 # Image prompt and detailed technical notes (Spanish)
├── README.md
└── README.es.md
```

## Tests

```bash
node work/verify-demo.cjs       # 53 checks: scenarios, charts, saving, guided tour
node work/verify-data.cjs       # 21 checks: CSV import, validation, export
node work/verify-followup.cjs   # 18 checks: mission files, reports, comparison
node work/verify-audio.cjs      # 20 checks: sound logic
node work/verify-radlab.cjs     # 9 checks: RadLab query handling (mocked)
```

These logic tests simulate the browser. `work/verify-audio-browser.cjs` is an extra Chrome check that needs Playwright (`PLAYWRIGHT_PATH` and `PW_CHANNEL` can be set). The interface was also opened in Chromium to check the layout and console errors. The live NASA RadLab connection depends on the browser and network and is not covered by the automated tests.

## Technologies

- HTML, CSS and vanilla JavaScript (single static app, no framework, no build step)
- Web Audio API for sound
- `localStorage` for local records; in-memory storage for imported data
- Node.js scripts for verification

## Use of AI

AI tools were used to build this project:

- **Code:** developed with AI assistance (ChatGPT/Codex by OpenAI), then reviewed and corrected with Claude by Anthropic (including a layout overflow fix). Both the application code and the tests were AI-assisted.
- **Image:** the background image `dist/assets/station-interior-v1.png` is **AI-generated** with ChatGPT's built-in image generation tool (prompt in `docs/background-prompt.txt`). It is marked with a visible watermark and an on-screen label.
- **Audio:** all sounds are synthesized by code in the browser (Web Audio); no AI-generated audio files are used.
- **Documentation:** the READMEs were drafted with AI assistance.

The team reviewed the results and is responsible for the final submission.

## Scope and limitations

- It is **not** a medical device. It does not diagnose, predict clinical outcomes, prescribe treatment or control any spacecraft system.
- It does not claim NASA approval or full compliance with the challenge.
- The mission is simulated and the data are fictitious. Imported data are not verified for accuracy.
- The optional RadLab query needs an internet connection and a browser that is allowed to call NASA's API. If it fails, the app shows a message and keeps working locally.
- Imported missions live in memory until downloaded as JSON; demo records stay in the browser where they were saved.
- The interface is in Spanish. The main panel is designed for desktop screens; the entry menu adapts to narrow screens.

## Future work

- Validation of review rules with medical and flight-surgeon expertise
- Use of real NASA open health and environment datasets as inputs
- English interface and a language switch
- A simplified view for family members or ground support staff
- Mobile layout for the main panel

## License

MIT
