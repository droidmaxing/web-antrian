import assert from "node:assert/strict";
import test from "node:test";
import { initials } from "../src/lib/initials";

test("inisial avatar stabil untuk nama kosong, satu kata, dan banyak kata", () => {
  assert.equal(initials("Budi Santoso"), "BS");
  assert.equal(initials("budi"), "B");
  assert.equal(initials("  Rina   Dewi  Lestari "), "RD");
  assert.equal(initials(""), "?");
  assert.equal(initials("   "), "?");
});
