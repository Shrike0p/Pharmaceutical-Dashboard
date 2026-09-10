import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * An animated, flowing colour field — a single full-screen quad running a
 * domain-warped fBm shader, which is what gives the slow "liquid silk" motion
 * you cannot get from a CSS gradient (CSS can interpolate stops, but it cannot
 * advect them through a noise field).
 *
 * Deliberately one draw call with no geometry, lights or post-processing: the
 * whole image is computed per-pixel in the fragment shader, so the cost is
 * resolution-bound rather than scene-bound, and dropping the internal render
 * scale below 1 (see `RENDER_SCALE`) is invisible on an image this smooth while
 * cutting the pixel count roughly in half.
 */

const PALETTES = {
  /** The sign-in panel: a saturated coral/violet iridescence. */
  brand: ["#3b0d63", "#ff385c", "#ffe4ea", "#8b5cf6"],
  /**
   * The dashboard hero band. The base is the neutral `shell-950` charcoal, not
   * a warm one: spread across a band this wide, a warm near-black stops reading
   * as black and starts reading as brown. The accents stay hot so the aurora
   * still has somewhere to go.
   */
  shell: ["#15161c", "#ff2d6f", "#2b1740", "#7c3aed"],
} as const;

export type GradientPalette = keyof typeof PALETTES;

/**
 * Renders at 70% of layout resolution and upscales. A smooth gradient has no
 * high-frequency detail to lose, so this reads identically and costs ~half the
 * fragment work of a 1:1 render on a large panel.
 */
const RENDER_SCALE = 0.7;

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    // The geometry is already a 2x2 quad centred on the origin, so it maps
    // straight onto clip space — no camera projection needed.
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  uniform float uTime;
  uniform float uAspect;
  uniform vec3 uColor0;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      sum += amp * valueNoise(p);
      p *= 2.02;
      amp *= 0.5;
    }
    return sum;
  }

  void main() {
    vec2 p = vec2(vUv.x * uAspect, vUv.y) * 2.2;
    float t = uTime * 0.05;

    // Two rounds of domain warping. Feeding fBm its own output is what bends
    // the bands into folded, cloth-like shapes instead of isotropic clouds.
    vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
    vec2 r = vec2(
      fbm(p + 2.4 * q + vec2(1.7, 9.2) + 0.6 * t),
      fbm(p + 2.4 * q + vec2(8.3, 2.8) - 0.4 * t)
    );
    float f = fbm(p + 2.6 * r);

    vec3 col = mix(uColor0, uColor1, clamp(f * f * 3.2, 0.0, 1.0));
    col = mix(col, uColor2, clamp(length(q) * 0.75, 0.0, 1.0));
    col = mix(col, uColor3, clamp(r.x * r.x * 1.6, 0.0, 1.0));

    // A soft vignette so the panel edges stay quiet under overlaid UI.
    float vignette = smoothstep(1.35, 0.25, length(vUv - 0.5) * 1.6);
    col *= mix(0.82, 1.0, vignette);

    // Static dither. An 8-bit-per-channel gradient this wide bands visibly;
    // half a level of noise breaks the steps up without reading as grain.
    col += (hash(vUv * 1024.0) - 0.5) * 0.012;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function GradientCanvas({
  palette = "brand",
  className,
}: {
  palette?: GradientPalette;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    /*
     * The canvas is created here rather than rendered by React, because the
     * cleanup below calls `forceContextLoss()` — and a canvas whose context has
     * been force-lost can never get another one. With a React-owned canvas,
     * StrictMode's mount → cleanup → mount replay hands the second renderer the
     * same, now-permanently-dead element: `getContext` returns null and Three
     * dies reading `capabilities.precision` off it, which blanks the whole
     * route. Owning the element means each run gets a fresh one and the
     * teardown can be as thorough as it should be.
     */
    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    container.appendChild(canvas);

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * RENDER_SCALE);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    /*
     * Note this does NOT make the output match the source hex. Three only
     * applies its linear→sRGB output conversion inside the shader chunks its
     * built-in materials include, and this is a hand-written ShaderMaterial
     * with no such chunk — so linearising here renders everything a good deal
     * darker than the literal hex.
     *
     * Kept deliberately: this image is a backdrop for white text, and the
     * darker, deeper result is the one that holds contrast. Where the literal
     * colour mattered (`SealScene`'s green check, which came out near-black)
     * the conversion is correctly omitted instead.
     */
    const [c0, c1, c2, c3] = PALETTES[palette];
    const toLinear = (hex: string) => new THREE.Color(hex).convertSRGBToLinear();

    const uniforms = {
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uColor0: { value: toLinear(c0) },
      uColor1: { value: toLinear(c1) },
      uColor2: { value: toLinear(c2) },
      uColor3: { value: toLinear(c3) },
    };

    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms,
    });
    scene.add(new THREE.Mesh(geometry, material));

    function resize() {
      const { clientWidth, clientHeight } = container!;
      if (clientWidth === 0 || clientHeight === 0) return;
      renderer.setSize(clientWidth, clientHeight, false);
      uniforms.uAspect.value = clientWidth / clientHeight;
      renderer.render(scene, camera);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    let inView = true;
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = Boolean(entry?.isIntersecting);
    });
    intersectionObserver.observe(container);

    let frameId = 0;
    const start = performance.now();

    function animate() {
      frameId = requestAnimationFrame(animate);
      // No point burning a GPU frame on a panel that is scrolled away or on a
      // background tab.
      if (!inView || document.hidden) return;
      uniforms.uTime.value = (performance.now() - start) / 1000;
      renderer.render(scene, camera);
    }

    resize();
    if (prefersReducedMotion) {
      // One settled, fully-formed frame rather than a blank panel.
      uniforms.uTime.value = 12;
      renderer.render(scene, camera);
    } else {
      animate();
    }
    setReady(true);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      /*
       * Removing the element is what actually lets the browser reclaim the
       * WebGL context: a detached canvas with no references is collectable,
       * and the ~16-context limit is only reached by canvases that stay
       * reachable.
       *
       * Deliberately NOT `renderer.forceContextLoss()`, which is the usual
       * advice. Chrome will not grant a new context in the same task as a
       * forced loss, so on any immediate remount — StrictMode's mount →
       * cleanup → mount replay, or a fast route toggle — `getContext` returns
       * null and Three throws reading `capabilities.precision`, blanking the
       * route. Prompt teardown without it beats a leak fix that breaks
       * mounting.
       */
      canvas.remove();
    };
  }, [palette]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className={`size-full transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"} ${className ?? ""}`}
    />
  );
}
