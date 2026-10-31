import assert from "node:assert/strict";
import test from "node:test";
import { windowStartFor } from "../src/modules/shared/rate-limit";

test("rate limit windows are aligned and roll over by whole windows", () => {
  const t = new Date("2026-10-31T10:00:37.512Z");
  assert.equal(windowStartFor(t, 60).toISOString(), "2026-10-31T10:00:00.000Z");
  assert.equal(windowStartFor(t, 3600).toISOString(), "2026-10-31T10:00:00.000Z");
  // Both requests inside one window share the bucket; the next second-window does not.
  assert.equal(
    windowStartFor(new Date("2026-10-31T10:00:59.999Z"), 60).getTime(),
    windowStartFor(t, 60).getTime(),
  );
  assert.notEqual(
    windowStartFor(new Date("2026-10-31T10:01:00.000Z"), 60).getTime(),
    windowStartFor(t, 60).getTime(),
  );
});