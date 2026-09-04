import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Silence console.error/warn in tests unless running in verbose mode
// — keeps test output clean while still catching real errors via assertions
if (!process.env.VITEST_VERBOSE) {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
}
