import { buildReferralLink, formatReferralCode } from './referralCode';

/**
 * Referral sharing — one professional voice everywhere.
 *
 * Rules this file enforces:
 *   • The message is written like a person inviting a colleague: no emoji, no
 *     "Hey! 👋", no marketing shout. It states what Growlanzo is, shows the
 *     code, and gives one link.
 *   • Every share carries the Growlanzo brand: platform links preview with
 *     /og-image.png, and native shares attach a generated 1200×630 invite card
 *     (the same canvas layout, so the card is always on-brand and current).
 *   • Sharing never silently does nothing. If the browser cannot share files,
 *     the message is copied AND the card is downloaded so the sender can attach
 *     it — and the caller can say exactly that.
 */

export type ReferralSharePlatform = 'whatsapp' | 'linkedin' | 'twitter' | 'email' | 'native';

export type ReferralShareContext = {
  code: string;
  link?: string;
  name?: string | null;
  /** Tailors one sentence: freelancers invite peers, clients invite hirers. */
  role?: string | null;
};

export type ReferralShareResult = 'shared' | 'copied' | 'downloaded' | 'cancelled' | 'failed';

const SITE_URL = 'https://growlanzo.com';
const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
// The green ring mark, square — it lands inside the white tile the card draws.
const LOGO_SOURCES = ['/favicon-growlanzo.png'];

function resolvedLink(ctx: ReferralShareContext): string {
  const code = formatReferralCode(ctx.code);
  if (ctx.link) return ctx.link;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return buildReferralLink(code, origin || SITE_URL);
}

/**
 * The invite message. Deliberately plain text so it survives WhatsApp,
 * LinkedIn, email and SMS without broken emoji or stripped formatting.
 */
export function buildReferralShareMessage(ctx: ReferralShareContext): string {
  const code = formatReferralCode(ctx.code) || 'your invite code';
  const link = resolvedLink(ctx);
  const pitch =
    ctx.role === 'client'
      ? 'Growlanzo is an AI-powered freelancing marketplace: verified freelancers, escrow-protected payments, and matching that fits the brief you post.'
      : ctx.role === 'freelancer'
        ? 'Growlanzo is an AI-powered freelancing marketplace: real client work, escrow-protected payments, and projects matched to your skills.'
        : 'Growlanzo is an AI-powered freelancing marketplace: verified talent, escrow-protected payments, and matching that fits the brief.';
  const lines = [
    "You're invited to Growlanzo.",
    '',
    pitch,
    '',
    'Use my invite code when you sign up:',
    code,
    '',
    `Join here: ${link}`,
  ];

  const name = (ctx.name || '').trim();
  if (name) {
    lines.push('', `Invite from ${name}.`);
  }

  return lines.join('\n');
}

export function buildReferralShareSubject(ctx: ReferralShareContext): string {
  const code = formatReferralCode(ctx.code);
  return code ? `You're invited to Growlanzo — invite code ${code}` : "You're invited to Growlanzo";
}

/** Platform share intent. LinkedIn only accepts a URL; the rest take the text. */
export function buildReferralShareIntent(
  platform: Exclude<ReferralSharePlatform, 'native'>,
  ctx: ReferralShareContext
): string {
  const message = buildReferralShareMessage(ctx);
  const link = resolvedLink(ctx);

  if (platform === 'linkedin') {
    return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`;
  }
  if (platform === 'twitter') {
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}`;
  }
  if (platform === 'email') {
    return `mailto:?subject=${encodeURIComponent(buildReferralShareSubject(ctx))}&body=${encodeURIComponent(message)}`;
  }
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** Clipboard with the insecure-context fallback older desktop browsers need. */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }

  if (typeof document === 'undefined') return false;

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, height / 2, width / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

async function loadBrandLogo(): Promise<HTMLImageElement | null> {
  for (const src of LOGO_SOURCES) {
    const image = await loadImage(src);
    if (image) return image;
  }
  return null;
}

/**
 * Render the Growlanzo invite card (1200×630 PNG).
 *
 * Everything is drawn from primitives + the shipped logo, so the card needs no
 * network round-trip beyond the logo and never goes stale relative to the
 * brand colours used across the app (emerald 500/600 on near-black).
 */
export async function createReferralInviteCard(ctx: ReferralShareContext): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;

  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return null;

  // Background: deep green → near-black, with a soft emerald glow.
  const background = ctx2d.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  background.addColorStop(0, '#04140F');
  background.addColorStop(0.55, '#071F18');
  background.addColorStop(1, '#03100C');
  ctx2d.fillStyle = background;
  ctx2d.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const glow = ctx2d.createRadialGradient(980, 90, 0, 980, 90, 620);
  glow.addColorStop(0, 'rgba(16, 185, 129, 0.30)');
  glow.addColorStop(1, 'rgba(16, 185, 129, 0)');
  ctx2d.fillStyle = glow;
  ctx2d.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Brand mark: the shipped logo inside a white tile (readable on any artwork).
  const logo = await loadBrandLogo();
  const tileSize = 96;
  const tileX = 72;
  const tileY = 56;
  roundedRect(ctx2d, tileX, tileY, tileSize, tileSize, 24);
  ctx2d.fillStyle = '#FFFFFF';
  ctx2d.fill();

  if (logo) {
    const inset = 12;
    const box = tileSize - inset * 2;
    const scale = Math.min(box / logo.width, box / logo.height);
    const drawWidth = logo.width * scale;
    const drawHeight = logo.height * scale;
    ctx2d.save();
    roundedRect(ctx2d, tileX + inset, tileY + inset, box, box, 16);
    ctx2d.clip();
    ctx2d.drawImage(
      logo,
      tileX + (tileSize - drawWidth) / 2,
      tileY + (tileSize - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
    ctx2d.restore();
  } else {
    ctx2d.fillStyle = '#059669';
    ctx2d.font = 'bold 56px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText('G', tileX + tileSize / 2, tileY + tileSize / 2 + 2);
    ctx2d.textAlign = 'left';
    ctx2d.textBaseline = 'alphabetic';
  }

  ctx2d.fillStyle = '#FFFFFF';
  ctx2d.font = 'bold 38px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  ctx2d.fillText('Growlanzo', 196, 108);

  ctx2d.fillStyle = 'rgba(167, 243, 208, 0.85)';
  ctx2d.font = '20px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  ctx2d.fillText('AI-powered freelancing marketplace', 196, 140);

  // Divider
  ctx2d.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx2d.lineWidth = 1;
  ctx2d.beginPath();
  ctx2d.moveTo(72, 196);
  ctx2d.lineTo(CARD_WIDTH - 72, 196);
  ctx2d.stroke();

  ctx2d.fillStyle = '#FFFFFF';
  ctx2d.font = 'bold 54px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  ctx2d.fillText("You're invited to Growlanzo", 72, 288);

  ctx2d.fillStyle = 'rgba(209, 250, 229, 0.78)';
  ctx2d.font = '24px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  ctx2d.fillText('Verified freelancers · Escrow-protected payments · AI matching', 72, 330);

  // Code panel
  const panelX = 72;
  const panelY = 384;
  const panelWidth = 640;
  const panelHeight = 148;
  roundedRect(ctx2d, panelX, panelY, panelWidth, panelHeight, 24);
  ctx2d.fillStyle = 'rgba(16, 185, 129, 0.14)';
  ctx2d.fill();
  ctx2d.strokeStyle = 'rgba(16, 185, 129, 0.75)';
  ctx2d.lineWidth = 2;
  ctx2d.stroke();

  ctx2d.fillStyle = 'rgba(110, 231, 183, 0.95)';
  ctx2d.font = 'bold 15px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  ctx2d.fillText('Y O U R   I N V I T E   C O D E', panelX + 32, panelY + 44);

  ctx2d.fillStyle = '#FFFFFF';
  ctx2d.font = 'bold 56px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx2d.fillText(formatReferralCode(ctx.code) || 'GRW-XXXX-XXXX', panelX + 30, panelY + 116);

  // Right column — three proof points, aligned with the marketplace pitch.
  const bullets = ['Verified talent', 'Escrow-protected work', 'AI project matching'];
  ctx2d.font = '22px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  bullets.forEach((line, index) => {
    const y = 420 + index * 44;
    ctx2d.fillStyle = '#10B981';
    ctx2d.beginPath();
    ctx2d.arc(788, y - 7, 7, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.fillStyle = 'rgba(236, 253, 245, 0.9)';
    ctx2d.fillText(line, 810, y);
  });

  // Footer
  ctx2d.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx2d.beginPath();
  ctx2d.moveTo(72, 566);
  ctx2d.lineTo(CARD_WIDTH - 72, 566);
  ctx2d.stroke();

  ctx2d.fillStyle = 'rgba(148, 163, 184, 0.95)';
  ctx2d.font = '20px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  ctx2d.fillText('growlanzo.com/signup', 72, 606);

  const name = (ctx.name || '').trim();
  if (name) {
    ctx2d.textAlign = 'right';
    ctx2d.fillStyle = 'rgba(167, 243, 208, 0.9)';
    ctx2d.fillText(`Invite from ${name.slice(0, 48)}`, CARD_WIDTH - 72, 606);
    ctx2d.textAlign = 'left';
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95);
  });
}

export function referralCardFileName(code: string): string {
  const safe = formatReferralCode(code).replace(/[^0-9A-Z-]/gi, '') || 'invite';
  return `growlanzo-invite-${safe}.png`;
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Download the branded invite card on its own. */
export async function downloadReferralInviteCard(ctx: ReferralShareContext): Promise<boolean> {
  const blob = await createReferralInviteCard(ctx);
  if (!blob || typeof document === 'undefined') return false;
  triggerDownload(blob, referralCardFileName(ctx.code));
  return true;
}

/**
 * Share the invite with the branded card.
 *
 * On phones the native share sheet receives the PNG + the professional message.
 * Where file sharing is unavailable, the message is copied and the card is
 * downloaded, so the caller can tell the user exactly what to attach.
 */
export async function shareReferralInvite(
  ctx: ReferralShareContext,
  prebuiltCard?: Blob | null
): Promise<ReferralShareResult> {
  const message = buildReferralShareMessage(ctx);
  const card = prebuiltCard ?? (await createReferralInviteCard(ctx));

  if (card && typeof File !== 'undefined' && typeof navigator !== 'undefined' && navigator.canShare) {
    const file = new File([card], referralCardFileName(ctx.code), { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: buildReferralShareSubject(ctx),
          text: message,
        });
        return 'shared';
      } catch (error) {
        // The user dismissed the sheet — that is not a failure.
        if ((error as DOMException)?.name === 'AbortError') return 'cancelled';
      }
    }
  }

  const copied = await copyToClipboard(message);

  if (card) {
    triggerDownload(card, referralCardFileName(ctx.code));
    return 'downloaded';
  }

  return copied ? 'copied' : 'failed';
}
