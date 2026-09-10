# Design artifacts

Diagrams drawn while reasoning about the domain, data flow and API boundaries before
implementation.

These are **design artifacts, not generated documentation.** The code is the source of truth; where
the two disagree, the code is right and the diagram is stale. The reasoning behind each decision
lives in [NOTES.md](../NOTES.md).

| | Diagram | Covers |
|---|---|---|
| 1 | [Product flow](./01-product-flow.md) | The core loop, record lifecycle, role permissions, screen navigation |
| 2 | [Database design](./02-database-design.md) | ERD, the subject-vs-actor split, index rationale, immutability |
| 3 | [API contract](./03-api-contract.md) | Endpoint surface by role, error shape, pagination shapes, request lifecycle |
| 4 | [Request/response flow](./04-request-response-flow.md) | The audited write, write conflicts, sign-in, front-end data flow |

Two supporting docs, kept out of the main path on purpose:

| | Covers |
|---|---|
| [Deployment runbook](./deployment.md) | How the demo is hosted, and the traps worth knowing before redeploying |
| [The design pass](./design-pass.md) | How the UI got there — a colourblind-unsafe palette caught by a validator, deleting shadcn's sidebar, the two Three.js scenes |

## Two versions of each, on purpose

Every page opens with the **hand-drawn sketch** made while designing the system
([`diagrams/`](./diagrams/)), then gives the **as-built** version in Mermaid.

Keeping both is more useful than keeping one. The sketch shows what was reasoned about while
designing; the Mermaid version shows what shipped. Where they differ, the difference is stated on
the page rather than quietly corrected.

Three of the four sketches match the implementation. The API one covers the core surface rather than
all of it, which is noted on its page.

**The Mermaid version is the one to trust.** The sketch is the thinking behind it.

## Why Mermaid rather than images

They render inline on GitHub, they stay diffable in review, and they cannot silently drift out of
date the way an exported PNG does. Every block here is validated by rendering it — a broken diagram
shows up as a parse error, which is worse than no diagram at all.

## Editing them as shapes

The Mermaid source is plain text, so it moves into a canvas tool easily:

- **[mermaid.live](https://mermaid.live)** — paste, edit, export SVG or PNG.
- **Excalidraw** — *Insert → Mermaid to Excalidraw* converts a diagram into editable shapes.
- **tldraw** — paste an SVG exported from either of the above onto the canvas.

If you re-draw one by hand, keep the Mermaid source here as the reviewable version and treat the
canvas export as a rendering of it.
