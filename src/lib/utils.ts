import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Render star rating as a string of unicode star symbols.
 * @example renderStars(4.5) → "★★★★½"
 * @example renderStars(3) → "★★★☆☆"
 */
export function renderStars(rating: number): string {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  let stars = '';
  for (let i = 0; i < fullStars; i++) {
    stars += '★';
  }
  if (hasHalfStar) {
    stars += '½';
  }
  for (let i = 0; i < emptyStars; i++) {
    stars += '☆';
  }
  return stars;
}
