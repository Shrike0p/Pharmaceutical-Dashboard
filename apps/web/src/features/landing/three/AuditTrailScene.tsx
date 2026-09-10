import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { drawAuditEntryFace, drawRecordCardFace } from "./card-textures";

/** Clamped linear remap — the one bit of math this whole scene runs on. */
function remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  const t = Math.min(1, Math.max(0, (value - inMin) / (inMax - inMin)));
  return outMin + t * (outMax - outMin);
}

const CAPTIONS = [
  {
    eyebrow: "Every change, recorded",
    body: "A cleaning is logged the moment it happens — who, what, and when, before any review.",
  },
  {
    eyebrow: "Reviewed, then verified",
    body: "A supervisor signs it off. The record itself never silently changes state.",
  },
  {
    eyebrow: "Nothing is ever deleted",
    body: "Every edit becomes its own entry, field by field, appended forever — not overwritten.",
  },
];

const GHOST_ENTRIES = [
  { field: "Status", from: "Pending", to: "Verified" },
  { field: "Verified by", from: "—", to: "Priya Nair" },
  { field: "Notes", from: "Standard cleaning", to: "Additional rinse performed" },
];

export function AuditTrailScene() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [captionIndex, setCaptionIndex] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let disposed = false;
    let inView = false;
    const progressTarget = { current: 0 };
    const progressActual = { current: 0 };

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 9);

    // Warm three-point lighting matching the brand's coral identity — a warm
    // cream fill instead of a cold blue one, and a coral rim light rather
    // than a generic white/blue "tech" glow.
    scene.add(new THREE.AmbientLight(0xfff3ef, 1.4));
    const key = new THREE.DirectionalLight(0xfff8f5, 2.5);
    key.position.set(3, 4, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffe4d6, 0.9);
    fill.position.set(-4, -1, 3);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xff5c7a, 0.85);
    rim.position.set(-2, 3, -4);
    scene.add(rim);

    const cardGroup = new THREE.Group();
    scene.add(cardGroup);

    const cardWidth = 3.4;
    const cardHeight = cardWidth * (640 / 1024);
    const planeGeometry = new THREE.PlaneGeometry(cardWidth, cardHeight);

    const frontTexture = drawRecordCardFace({
      equipmentCode: "MT-002",
      equipmentName: "Mixing Tank 02",
      actorName: "Rahul Verma",
      timestamp: "8 Sep 2026, 10:30",
      status: "PENDING",
    });
    const backTexture = drawRecordCardFace({
      equipmentCode: "MT-002",
      equipmentName: "Mixing Tank 02",
      actorName: "Priya Nair",
      timestamp: "8 Sep 2026, 11:15",
      status: "VERIFIED",
    });

    const materialFor = (texture: THREE.CanvasTexture) =>
      new THREE.MeshPhysicalMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.02,
        roughness: 0.32,
        clearcoat: 0.25,
        clearcoatRoughness: 0.4,
        side: THREE.FrontSide,
      });

    // Two coplanar-ish planes, the second pre-rotated 180° so it faces away
    // until the whole group turns to meet the camera — see NOTES.md for why
    // this (rather than extruded box geometry) is the deliberately simple
    // choice here.
    const frontMesh = new THREE.Mesh(planeGeometry, materialFor(frontTexture));
    frontMesh.position.z = 0.015;
    const backMesh = new THREE.Mesh(planeGeometry, materialFor(backTexture));
    backMesh.rotation.y = Math.PI;
    backMesh.position.z = -0.015;
    cardGroup.add(frontMesh, backMesh);

    const ghostGeometry = new THREE.PlaneGeometry(cardWidth * 0.62, cardHeight * 0.62);
    const ghostMeshes = GHOST_ENTRIES.map((entry, index) => {
      const texture = drawAuditEntryFace(entry.field, entry.from, entry.to);
      const material = new THREE.MeshPhysicalMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.02,
        roughness: 0.5,
        clearcoat: 0.2,
      });
      const mesh = new THREE.Mesh(ghostGeometry, material);
      mesh.position.z = -0.4 - index * 0.02;
      scene.add(mesh);
      return mesh;
    });

    // Rendering is paused entirely outside the viewport - no point spending a
    // GPU frame budget on a canvas nobody can see.
    const observer = new IntersectionObserver(([entry]) => {
      inView = Boolean(entry?.isIntersecting);
    });
    observer.observe(section);

    function handleScroll() {
      const rect = section!.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      const passed = -rect.top;
      progressTarget.current = scrollable > 0 ? Math.min(1, Math.max(0, passed / scrollable)) : 0;

      const nextCaption =
        progressTarget.current < 0.35 ? 0 : progressTarget.current < 0.6 ? 1 : 2;
      setCaptionIndex((current) => (current === nextCaption ? current : nextCaption));
    }

    function resize() {
      const { clientWidth, clientHeight } = canvas!;
      if (clientWidth === 0 || clientHeight === 0) return;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    let frameId = 0;
    function animate() {
      frameId = requestAnimationFrame(animate);
      if (disposed || !inView) return;

      // Critically-damped lerp toward the scroll target, so a fast flick of
      // the wheel doesn't snap the card instantly — it settles.
      progressActual.current += (progressTarget.current - progressActual.current) * 0.12;
      const p = progressActual.current;

      const flip = remap(p, 0, 0.55, 0, Math.PI);
      cardGroup.rotation.y = flip;
      cardGroup.position.y = Math.sin(flip) * 0.25;
      cardGroup.rotation.x = remap(p, 0, 1, 0.05, -0.03);

      const fan = remap(p, 0.5, 1, 0, 1);
      const idleBob = Math.sin(Date.now() * 0.0006) * 0.03;
      ghostMeshes.forEach((mesh, index) => {
        const spread = 1 + index;
        mesh.position.x = -remap(fan, 0, 1, 0, 1.1 * spread);
        mesh.position.y = remap(fan, 0, 1, -0.2, -0.5 - index * 0.35) + idleBob;
        mesh.position.z = remap(fan, 0, 1, -0.4 - index * 0.02, -0.9 - index * 0.55);
        mesh.rotation.z = remap(fan, 0, 1, 0, -0.12 - index * 0.05);
        const material = mesh.material as THREE.MeshPhysicalMaterial;
        material.opacity = remap(fan, 0, 0.4, 0, 1);
      });

      camera.position.x = Math.sin(p * Math.PI) * 0.3;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    }

    if (prefersReducedMotion) {
      // No scroll-driven motion: render one settled, informative frame -
      // mid-flip, ghost cards partly fanned - and stop.
      progressActual.current = 0.75;
      progressTarget.current = 0.75;
      inView = true;
      resize();
      cardGroup.rotation.y = remap(0.75, 0, 0.55, 0, Math.PI);
      const fan = remap(0.75, 0.5, 1, 0, 1);
      ghostMeshes.forEach((mesh, index) => {
        mesh.position.x = -remap(fan, 0, 1, 0, 1.1 * (1 + index));
        mesh.position.y = remap(fan, 0, 1, -0.2, -0.5 - index * 0.35);
        mesh.rotation.z = remap(fan, 0, 1, 0, -0.12 - index * 0.05);
        (mesh.material as THREE.MeshPhysicalMaterial).opacity = 1;
      });
      renderer.render(scene, camera);
      setCaptionIndex(2);
    } else {
      window.addEventListener("scroll", handleScroll, { passive: true });
      handleScroll();
      animate();
    }

    setReady(true);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", handleScroll);
      observer.disconnect();
      resizeObserver.disconnect();
      planeGeometry.dispose();
      ghostGeometry.dispose();
      frontTexture.dispose();
      backTexture.dispose();
      [frontMesh, backMesh, ...ghostMeshes].forEach((mesh) => {
        const material = mesh.material as THREE.MeshPhysicalMaterial;
        material.map?.dispose();
        material.dispose();
      });
      renderer.dispose();
    };
  }, []);

  return (
    <section ref={sectionRef} className="relative h-[300vh]">
      <div className="sticky top-0 flex h-screen flex-col overflow-hidden bg-background">
        <div className="relative flex-1">
          <canvas ref={canvasRef} className={`size-full transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`} />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-6 pb-16 sm:px-12">
          <div className="mx-auto max-w-xl text-center">
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
