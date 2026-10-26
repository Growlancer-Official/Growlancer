/**
 * BrandLogo — the official Growlanzo lockup.
 *
 * The site is light-only, so there is exactly one flavour of each variant:
 *   - growlanzo-wordmark.png — the "Growlanzo" name (headers, sidebars)
 *   - growlanzo-full.png     — name + "Freelance work. Grown together."
 *
 * `theme="inverse"` swaps in the -inverse artwork (white name, same greens) for
 * the two surfaces that are dark by design and never follow the page theme: the
 * admin console sidebar and the admin sign-in plate. It is a logo variant, not
 * a theme: nothing else on the site ever needs it.
 *
 * Both files are cut from the master artwork (black name, green G / "ZO", grey
 * and green tagline) and share identical geometry, so switching variant never
 * shifts layout.
 */
import type { ImgHTMLAttributes } from 'react';

export type BrandLogoVariant = 'wordmark' | 'full';
export type BrandLogoTheme = 'light' | 'inverse';

/** Intrinsic pixels of public/growlanzo-{variant}*.png (both identical). */
const SIZES: Record<BrandLogoVariant, { width: number; height: number }> = {
  wordmark: { width: 480, height: 94 },
  full: { width: 480, height: 113 },
};

interface BrandLogoProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'width' | 'height'> {
  /** `wordmark` (name only) or `full` (name + tagline). Default: wordmark. */
  variant?: BrandLogoVariant;
  /** `light` (default) for the site, `inverse` for the deliberately dark admin chrome. */
  theme?: BrandLogoTheme;
  /** Tailwind sizing; width is intrinsic (`w-auto` keeps the 480:94/113 ratio). */
  className?: string;
  alt?: string;
}

export function BrandLogo({
  variant = 'wordmark',
  theme = 'light',
  className = 'h-8 w-auto',
  alt = 'Growlanzo',
  ...rest
}: BrandLogoProps) {
  const { width, height } = SIZES[variant];
  // `?v=` busts any cached copy of a previous artwork revision: the file name
  // is stable across rebrands, so without it a returning visitor keeps the old
  // logo until their cache expires.
  const suffix = theme === 'inverse' ? '-inverse' : '';
  const src = `/growlanzo-${variant}${suffix}.png?v=7`;

  return <img src={src} alt={alt} className={className} width={width} height={height} {...rest} />;
}
