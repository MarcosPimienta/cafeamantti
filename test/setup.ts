import { afterEach } from "vitest";

// Pin the clock-sensitive bits: Colombia has no DST, tests assume UTC-5.
process.env.TZ = "America/Bogota";

// Unmount React trees between tests (jsdom tests only; a no-op elsewhere).
afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
