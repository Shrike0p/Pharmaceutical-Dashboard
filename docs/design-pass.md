# The design pass

The functional build came first and looked like scaffolding. Two later passes turned it into
something that reads as a product. **None of the audit or pagination reasoning in
[NOTES.md](../NOTES.md) changed as a result** — this is the UI work, kept out of the engineering
notes so it does not compete with them for a reviewer's attention.

Worth reading if you care how the interface got there, skippable if you do not.

---

### Elevation

Every card carried a 1px ring and no shadow, which is the single biggest reason the
app read as a wireframe once real content was in it. Fixed with a layered, warm-tinted shadow system
(three stacked layers — contact, ambient, cast — because one flat blur does not read as elevation).

`ink` **and** `shell` **are separate token families.** A warm near-black reads as rich black in *text*,
but the same warmth spread across a whole sidebar reads plainly brown. Text keeps the warmth;
surfaces get a neutral charcoal.

### The recolour had quietly broken the chart's colourblind safety

Moving the brand hue to coral
left the activity chart plotting coral against verification green. Run through a palette validator,
that pair measures **ΔE 4.4 for deuteranopia** — below even the "legal only with secondary encoding"
floor, i.e. one colour to a red-green colourblind reader. It passed every eye test because it looks
fine to normal vision (ΔE 34). Fixed by plotting the app's own **status** tokens instead
(`pending-600` / `verify-700`, ΔE 8.8 deutan). That is more correct than what it replaced, because a
cleaning *is* recorded into `PENDING` and later becomes `VERIFIED` — the chart now reads in the same
two colours as every status badge. It is the strongest argument anywhere in this project for
computing colour rather than judging it by eye.

### Charts took the reference's energy, not its encoding

The visual reference was a neo-brutalist
dashboard with wide rainbow bars. Rainbow bars on nominal categories double-encode length as hue and
burn the only free channel on information the chart already shows, so `TopAssetsChart` uses one hue
for all seven columns, capped at 24px with a 4px rounded data-end. The verification split is a
**meter, not a two-slice donut** — a two-segment pie is a stat tile wearing a costume. Every value
stays readable without hovering, because a tooltip may enhance but must never gate.

### The sidebar: deleting the primitive was the fix

Restyling shadcn's sidebar kept meaning fighting
`SidebarMenuButton`'s own `data-active` background rather than composing with it. So the ~700-line
primitive was deleted and replaced with ~250 lines of hand-written markup. The sliding active
indicator previously listed as "skipped for time" became three lines — one `motion.span` with a
shared `layoutId`. The cost was never the animation; it was the primitive. It also removed a blank-page crash: that button rendered Radix tooltips in collapsed mode, so the
whole app needed a `TooltipProvider` ancestor or React unmounted the tree. With the primitive gone,
nothing in the app renders a tooltip at all.

### Three.js, twice, with different techniques

The landing page's first scene is a scroll-driven
card that flips `PENDING → VERIFIED` and fans out three ghost entries: two coplanar `PlaneGeometry`
meshes, one pre-rotated 180° and grouped, rather than extruded rounded-box geometry with
multi-material face groups — `ExtrudeGeometry`'s material ordering for a bevelled shape is easy to
get backwards and fails silently as a texture on the wrong face. Faces are drawn onto an offscreen
canvas showing the exact fields the real UI shows, with `alphaTest` dropping the corners so the
silhouette reads as rounded without rounded geometry. The second scene is ~7,000 `THREE.Points`
converging into the brand mark, with all motion computed in the vertex shader from two static
attributes plus a scroll uniform, so the CPU does nothing per frame.

Both track scroll in a plain ref read inside a `requestAnimationFrame` loop — never `setState` for a
continuously-changing value — pause on `IntersectionObserver`, and render one settled, informative
frame under `prefers-reduced-motion`.

### Bundle

`three` is the heaviest dependency and every consumer reaches it through `React.lazy`, so
it lands in one shared async chunk (~521KB, ~130KB gzipped) that the landing page (~39KB), the
sign-in panel and the two dashboard hero bands share. A signed-in user who never opens a page
carrying a canvas never downloads it. The main app chunk is ~1.56MB (~458KB gzipped); per-route
splitting inside the app is the obvious next lever.

### Every displayed number is raw or honestly derived

The stat tiles' "+10 this week" is summed in
the browser from the same `activity` array the chart renders. Where no honest derivation existed — a
backlog-trend arrow would need historical snapshots this system does not keep — the tile got a
descriptive line instead of a fabricated number. Likewise the sign-in panel's reference showed a
customer testimonial; inventing a quote from a named person is exactly what this project refuses, so
the panel carries a real artefact instead: one audit entry in the shape the database stores it.

---
