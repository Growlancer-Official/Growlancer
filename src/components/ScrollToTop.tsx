import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollManager Component
 * - Resets window scroll position to top when route changes
 * - Handles smooth scroll to hash/anchor elements
 * - Handles mobile menu scroll behavior
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    // If there's a hash, scroll to that element
    if (hash) {
      const element = document.getElementById(hash.replace('#', ''));
      if (element) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    } else {
      // Otherwise scroll to top instantly
      window.scrollTo(0, 0);
      // Fallback for browsers that don't support scrollTo
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  }, [pathname, hash]);

  return null;
}

/**
 * Smooth scroll to element by ID
 * Used for in-page navigation
 */
// eslint-disable-next-line react-refresh/only-export-components
export function scrollToElement(elementId: string) {
  const element = document.getElementById(elementId);
  if (element) {
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }
}

/**
 * Scroll to top utility
 */
// eslint-disable-next-line react-refresh/only-export-components
export function scrollToTop() {
  window.scrollTo({
    top: 0,
    left: 0,
    behavior: 'smooth',
  });
}
