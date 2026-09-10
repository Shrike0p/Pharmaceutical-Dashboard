import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * The landing page's second 3D scene: ~7,000 points that start as a loose
 * cloud and converge, on scroll, into the brand mark — the hexagon outline in
 * coral, the verification check in green.
 *
 * Deliberately a different technique from `AuditTrailScene`, which is textured
 * planes. Here every point's motion is computed in the vertex shader from two
 * static attributes (its start and its target) plus a scroll uniform, so the
 * CPU does nothing per frame and no geometry is rebuilt: 7,000 independently
 * staggered particles cost one draw call and one uniform write.
 *
 * The metaphor is the page's argument, not decoration — many separate
 * entries resolving into one verifiable whole, and never the reverse.
 */

const PARTICLE_COUNT = 7000;
/** Share of the points that draw the hexagon; the rest draw the check. */
const HEX_SHARE = 0.62;
const HEX_RADIUS = 1.55;

/*
 * Passed through as sRGB, deliberately *not* `convertSRGBToLinear()`. Three
 * only applies its linear→sRGB output conversion inside the shader chunks its
 * built-in materials include; a hand-written `ShaderMaterial` like this one has
 * no such chunk, so whatever it writes to `gl_FragColor` is displayed as-is.
 * Linearising first therefore darkens twice — it rendered the green check as
 * near-black (#2e8055 linearises to ~0.03) while the brighter coral survived
 * well enough to look intentional.
 */
const BRAND = new THREE.Color("#ff385c");
const VERIFY = new THREE.Color("#2e8055");

const CAPTIONS = [
  {
    eyebrow: "Thousands of separate entries",
    body: "Every cleaning, every amendment, every verification — each one written once, on its own row.",
  },
  {
    eyebrow: "One verifiable whole",
    body: "Together they are the record a regulator reads. Nothing in the set can be quietly removed.",
  },
];

/** Lerps along a polyline, so points spread evenly over an outline. */
function pointOnPath(points: THREE.Vector2[], t: number, target: THREE.Vector2): void {
  const scaled = t * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const a = points[index]!;
  const b = points[index + 1]!;
  target.set(a.x + (b.x - a.x) * local, a.y + (b.y - a.y) * local);
}

function hexagonOutline(): THREE.Vector2[] {
  const corners: THREE.Vector2[] = [];
  for (let i = 0; i <= 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    corners.push(new THREE.Vector2(HEX_RADIUS * Math.cos(angle), HEX_RADIUS * Math.sin(angle)));
  }
  return corners;
}

/** The check inside the mark, as a two-segment polyline. */
const CHECK_PATH: THREE.Vector2[] = [
  new THREE.Vector2(-0.62, 0.06),
  new THREE.Vector2(-0.16, -0.42),
  new THREE.Vector2(0.7, 0.5),
];

const VERTEX_SHADER = /* glsl */ `
  uniform float uProgress;
  uniform float uTime;
  uniform float uPixelRatio;

  attribute vec3 aTarget;
  attribute float aSeed;
  attribute vec3 aColor;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = aColor;

    // Each point starts arriving at a slightly different time, so the mark
    // resolves rather than snapping into place all at once.
    float stagger = aSeed * 0.45;
    float t = clamp((uProgress - stagger) / max(1.0 - stagger, 0.0001), 0.0, 1.0);
    t = 1.0 - pow(1.0 - t, 3.0);

    vec3 pos = mix(position, aTarget, t);

    // Drift, strong while scattered and almost gone once settled — a fully
    // static final frame looks dead, a fully mobile one looks unresolved.
    float drift = (1.0 - t) * 0.22 + 0.015;
    pos.x += sin(uTime * 0.6 + aSeed * 31.0) * drift;
    pos.y += cos(uTime * 0.5 + aSeed * 23.0) * drift;
    pos.z += sin(uTime * 0.4 + aSeed * 17.0) * drift;

    vAlpha = mix(0.72, 1.0, t);

    vec4 viewPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = mix(1.8, 3.6, aSeed) * mix(1.7, 1.0, t) * uPixelRatio * (3.0 / -viewPosition.z);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // Round the square point sprite and soften its edge, so a dense cluster
    // reads as ink rather than as a grid of little boxes.
    float dist = length(gl_PointCoord - 0.5);
    if (dist > 0.5) discard;
    gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.5, 0.12, dist));
  }
`;

export function SealScene() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [captionIndex, setCaptionIndex] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    const container = containerRef.current;
    if (!section || !container) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    container.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 7.1);

    // --- Attributes, built once ------------------------------------------
    const starts = new Float32Array(PARTICLE_COUNT * 3);
    const targets = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const seeds = new Float32Array(PARTICLE_COUNT);

    const hexPath = hexagonOutline();
    const scratch = new THREE.Vector2();
    const hexCount = Math.floor(PARTICLE_COUNT * HEX_SHARE);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Start: a shell that stays inside the frustum. An earlier, much wider
      // spread put most points off-screen, so the opening frame of a 240vh
      // section was an empty page.
      const radius = 1.8 + Math.random() * 1.6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starts[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      starts[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      starts[i * 3 + 2] = radius * Math.cos(phi) * 0.6;

      const onHex = i < hexCount;
      const path = onHex ? hexPath : CHECK_PATH;
      pointOnPath(path, Math.random(), scratch);

      // A little jitter across the line turns a hairline into an inked stroke.
      const spread = onHex ? 0.055 : 0.075;
      targets[i * 3] = scratch.x + (Math.random() - 0.5) * spread;
      targets[i * 3 + 1] = scratch.y + (Math.random() - 0.5) * spread;
      targets[i * 3 + 2] = (Math.random() - 0.5) * 0.09;

      const color = onHex ? BRAND : VERIFY;
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      seeds[i] = Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(starts, 3));
    geometry.setAttribute("aTarget", new THREE.BufferAttribute(targets, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

    const uniforms = {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms,
      transparent: true,
      // Points overlap heavily; depth-writing makes the near ones punch holes
      // in the far ones instead of blending with them.
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    const group = new THREE.Group();
    group.add(points);
    // Lifted: the hexagon's bottom vertex otherwise sits behind the caption.
    group.position.y = 0.45;
    scene.add(group);

    // --- Drive -----------------------------------------------------------
    const scrollTarget = { current: 0 };
    const scrollActual = { current: 0 };
    const pointer = { x: 0, y: 0 };

    function handleScroll() {
      const rect = section!.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      const progress = scrollable > 0 ? Math.min(1, Math.max(0, -rect.top / scrollable)) : 0;
      scrollTarget.current = progress;
      setCaptionIndex(progress < 0.55 ? 0 : 1);
    }

    function handlePointerMove(event: PointerEvent) {
      pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
    }

    function resize() {
      const { clientWidth, clientHeight } = container!;
      if (clientWidth === 0 || clientHeight === 0) return;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    let inView = false;
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = Boolean(entry?.isIntersecting);
    });
    intersectionObserver.observe(section);

    let frameId = 0;
    const start = performance.now();

    function animate() {
      frameId = requestAnimationFrame(animate);
      if (!inView || document.hidden) return;

      scrollActual.current += (scrollTarget.current - scrollActual.current) * 0.09;
      uniforms.uProgress.value = scrollActual.current;
      uniforms.uTime.value = (performance.now() - start) / 1000;

      // Parallax, eased toward the pointer rather than tracking it exactly.
      group.rotation.y += (pointer.x * 0.22 - group.rotation.y) * 0.05;
      group.rotation.x += (pointer.y * 0.14 - group.rotation.x) * 0.05;

      renderer.render(scene, camera);
    }

    resize();
    if (prefersReducedMotion) {
      // The settled mark, held — the informative end state of the animation.
      uniforms.uProgress.value = 1;
      uniforms.uTime.value = 8;
      inView = true;
      renderer.render(scene, camera);
      setCaptionIndex(1);
    } else {
      window.addEventListener("scroll", handleScroll, { passive: true });
      window.addEventListener("pointermove", handlePointerMove, { passive: true });
      handleScroll();
      animate();
    }
    setReady(true);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pointermove", handlePointerMove);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return (
    <section ref={sectionRef} className="relative h-[240vh]">
      <div className="sticky top-0 flex h-screen flex-col overflow-hidden">
        <div
          ref={containerRef}
          aria-hidden
          className={`flex-1 transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"}`}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-6 pb-16 sm:px-12">
          <div className="relative mx-auto max-w-xl text-center">
            {CAPTIONS.map((caption, index) => (
              <div
                key={caption.eyebrow}
                className={`transition-opacity duration-500 ${
                  index === captionIndex ? "opacity-100" : "pointer-events-none absolute inset-0 opacity-0"
                }`}
              >
                <p className="text-sm font-bold tracking-wide text-brand-700 uppercase">{caption.eyebrow}</p>
                <p className="mt-2 font-heading text-xl text-foreground">{caption.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
