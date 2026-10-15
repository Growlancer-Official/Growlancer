import '@testing-library/jest-dom';
import { vi } from 'vitest';

// jsdom never implemented scrollIntoView (every browser has it). Components
// call it when a list highlights an item (e.g. CountrySelect keyboard nav),
// so the effect would crash in tests without this stub.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Silence console.error/warn in tests unless running in verbose mode
// — keeps test output clean while still catching real errors via assertions
if (!process.env.VITEST_VERBOSE) {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
}
