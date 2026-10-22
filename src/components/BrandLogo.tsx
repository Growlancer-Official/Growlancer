/**
 * BrandLogo — the official Growlanzo wordmark, theme-aware.
 *
 * Two assets are shipped for each variant (see public/):
 *   - growlanzo-wordmark-*.png — the "Growlanzo" name only (headers, sidebars)
 *   - growlanzo-full-*.png     — name + "Freelance work. Grown together." + swoosh
 * Each comes in a light flavour (navy text, for white/light surfaces) and a dark
 * flavour (white text, for dark surfaces) — both share identical geometry so
 * swapping the theme never shifts layout.
 *
 * The default `theme="auto"` renders BOTH flavours and lets the `.dark` class on
 * <html> show exactly one (`darkMode: 'class'` in tailwind.config.js + the
 * ThemeContext palette remap in globals.css). That is deliberate:
 *   - it swaps with the same switch every other surface uses, so the logo can
 *     never disagree with the header/sidebar it sits in;
 *   - it is pure CSS, so a dark-mode user never flashes the light logo while
 *     React hydrates (the FOUC guard sets `.dark` before first paint).
 * Only the visible copy is decoded by the browser? No — both download, which
 * is the accepted cost of the no-flash guarantee (≈120 KB worst case).
 *
 * `theme="light" | "dark"` pins a flavour for surfaces that never flip with the
 * theme (the admin console's permanently-dark sidebar, the #0F172A sign-in
 * page, static share cards).
 */
import type { ImgHTMLAttributes } from 'react';

export type BrandLogoVariant = 'wordmark' | 'full';
export type BrandLogoTheme = 'auto' | 'light' | 'dark';

/** Intrinsic pixels of public/growlanzo-{variant}-{light,dark}.png (both identical). */
const SIZES: Record<BrandLogoVariant, { width: number; height: number }> = {
  wordmark: { width: 700, height: 123 },
  full: { width: 700, height: 177 },
};

interface BrandLogoProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'width' | 'height'> {
  /** `wordmark` (name only) or `full` (name + tagline + swoosh). Default: wordmark. */
  variant?: BrandLogoVariant;
  /** Follow the `.dark` class (default), or pin to one surface flavour. */
  theme?: BrandLogoTheme;
  /** Tailwind sizing; width is intrinsic (`w-auto` keeps the 700:123/177 ratio). */
  className?: string;
  alt?: string;
}

export function BrandLogo({
  variant = 'wordmark',
  theme = 'auto',
  className = 'h-8 w-auto',
  alt = 'Growlanzo',
  ...rest
}: BrandLogoProps) {
  const { width, height } = SIZES[variant];
  const lightSrc = `/growlanzo-${variant}-light.png`;
  const darkSrc = `/growlanzo-${variant}-dark.png`;
  const shared = { width, height, ...rest };

  if (theme === 'light') {
    return <img src={lightSrc} alt={alt} className={className} {...shared} />;
  }
  if (theme === 'dark') {
    return <img src={darkSrc} alt={alt} className={className} {...shared} />;
  }

  return (
    <>
      <img src={lightSrc} alt={alt} className={`${className} dark:hidden`} {...shared} />
      <img src={darkSrc} alt="" aria-hidden="true" className={`${className} hidden dark:block`} {...shared} />
    </>
  );
}
