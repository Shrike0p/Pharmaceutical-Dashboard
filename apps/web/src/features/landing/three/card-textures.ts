import * as THREE from "three";

/**
 * Every texture in the scene is drawn by hand onto a 2D canvas rather than
 * pulled from an image asset — this is a compliance product, so the card
 * faces show the exact fields (asset code, status, actor, timestamp) the
 * real UI shows, not stock art. Drawn at a fixed high resolution regardless
 * of display size, since a canvas texture only needs to out-resolve the
 * screen-space size the card actually renders at (a few hundred px), not
 * match device pixel ratio directly.
 */

const CARD_PX = { w: 1024, h: 640 };
const INK_900 = "#221d1b";
const BRAND_600 = "#ff385c";
const STONE_700 = "#57534e";
const BRAND_200 = "#ffc2cf";
const VERIFY_600 = "#3fa76a";
const VERIFY_700 = "#2e8055";
const PENDING_600 = "#b45309";
const PENDING_700 = "#92400a";
const BORDER = "#ebe5e1";

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_PX.w;
  canvas.height = CARD_PX.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  return { canvas, ctx };
}

/**
 * Builds the texture as a `THREE.CanvasTexture` with alpha 0 outside a
 * rounded-rect — the plane geometry stays a plain rectangle, but the
 * material's alpha test drops the corners, so the card silhouette reads as
 * rounded without needing extruded/multi-material geometry.
 */
function toAlphaMaskedTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export interface RecordCardFaceInput {
  equipmentCode: string;
  equipmentName: string;
  actorName: string;
  timestamp: string;
  status: "PENDING" | "VERIFIED";
}

/** The main card's front (PENDING) or back (VERIFIED) face. */
export function drawRecordCardFace(input: RecordCardFaceInput): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas();
  const { w, h } = CARD_PX;
  const pad = 56;

  roundedRectPath(ctx, 0, 0, w, h, 64);
  ctx.clip();

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  const isVerified = input.status === "VERIFIED";
  const accent = isVerified ? VERIFY_600 : PENDING_600;
  const accentSoft = isVerified ? "rgba(63,167,106,0.08)" : "rgba(180,83,9,0.08)";
  const accentText = isVerified ? VERIFY_700 : PENDING_700;

  // A quiet corner wash, matching the app's stat-tile treatment.
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, accentSoft);
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // Top-left: asset identity.
  ctx.fillStyle = INK_900;
  ctx.font = "700 40px 'Figtree Variable', system-ui, sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(input.equipmentCode, pad, pad + 40);
  ctx.fillStyle = STONE_700;
  ctx.font = "400 26px 'Geist Variable', system-ui, sans-serif";
  ctx.fillText(input.equipmentName, pad, pad + 78);

  // Status pill, top-right.
  ctx.font = "600 26px 'Geist Variable', system-ui, sans-serif";
  const label = isVerified ? "VERIFIED" : "PENDING";
  const labelWidth = ctx.measureText(label).width;
  const pillW = labelWidth + 76;
  const pillH = 56;
  const pillX = w - pad - pillW;
  const pillY = pad;
  roundedRectPath(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fillStyle = isVerified ? "rgba(63,167,106,0.12)" : "rgba(180,83,9,0.12)";
  ctx.fill();
  ctx.fillStyle = accentText;
  ctx.fillText(label, pillX + 44, pillY + 38);
  // A small dot/check glyph before the label, drawn as vector shapes rather
  // than an icon font so the texture has no external font dependency.
  ctx.beginPath();
  ctx.fillStyle = accent;
  ctx.arc(pillX + 26, pillY + 28, 8, 0, Math.PI * 2);
  ctx.fill();

  // Divider.
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, h * 0.52);
  ctx.lineTo(w - pad, h * 0.52);
  ctx.stroke();

  // Bottom: who / when, the two fields a compliance reviewer actually reads first.
  const rowY = h * 0.52 + 64;
  ctx.fillStyle = STONE_700;
  ctx.font = "400 22px 'Geist Variable', system-ui, sans-serif";
  ctx.fillText(isVerified ? "VERIFIED BY" : "CLEANED BY", pad, rowY);
  ctx.fillStyle = INK_900;
  ctx.font = "600 32px 'Figtree Variable', system-ui, sans-serif";
  ctx.fillText(input.actorName, pad, rowY + 42);

  ctx.fillStyle = STONE_700;
  ctx.font = "400 22px 'Geist Variable', system-ui, sans-serif";
  ctx.fillText("TIMESTAMP", pad, rowY + 96);
  ctx.fillStyle = BRAND_600;
  ctx.font = "500 28px 'Geist Mono Variable', ui-monospace, monospace";
  ctx.fillText(input.timestamp, pad, rowY + 136);

  // Brand mark, bottom-right — a small hexagon outline, echoing brand.png.
  const hx = w - pad - 36;
  const hy = h - pad - 36;
  ctx.strokeStyle = BRAND_200;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    const px = hx + 22 * Math.cos(angle);
    const py = hy + 22 * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();

  return toAlphaMaskedTexture(canvas);
}

/** A small supporting "ghost" card — one field-level change from the trail. */
export function drawAuditEntryFace(fieldLabel: string, oldValue: string, newValue: string): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas();
  const { w, h } = CARD_PX;
  const pad = 64;

  roundedRectPath(ctx, 0, 0, w, h, 64);
  ctx.clip();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = STONE_700;
  ctx.font = "600 30px 'Geist Variable', system-ui, sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(fieldLabel.toUpperCase(), pad, pad + 30);

  ctx.font = "400 34px 'Geist Variable', system-ui, sans-serif";
  ctx.fillStyle = STONE_700;
  ctx.fillText(oldValue, pad, h * 0.56);
  // Strike-through the old value, matching the real audit-trail UI.
  const oldWidth = ctx.measureText(oldValue).width;
  ctx.strokeStyle = STONE_700;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, h * 0.56 - 12);
  ctx.lineTo(pad + oldWidth, h * 0.56 - 12);
  ctx.stroke();

  ctx.fillStyle = BRAND_600;
  ctx.font = "600 44px 'Geist Variable', system-ui, sans-serif";
  ctx.fillText(`→  ${newValue}`, pad, h * 0.56 + 74);

  return toAlphaMaskedTexture(canvas);
}
