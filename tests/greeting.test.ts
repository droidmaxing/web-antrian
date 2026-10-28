import assert from "node:assert/strict";
import test from "node:test";
import { greetingFor } from "../src/modules/shared/greeting";

test("the greeting follows the branch timezone, not the server clock", () => {
  const jakarta = "Asia/Jakarta"; // UTC+7
  assert.equal(greetingFor(jakarta, "2026-10-27T20:00:00.000Z"), "Selamat pagi"); // 03:00
  assert.equal(greetingFor(jakarta, "2026-10-28T03:59:00.000Z"), "Selamat pagi"); // 10:59
  assert.equal(greetingFor(jakarta, "2026-10-28T04:00:00.000Z"), "Selamat siang"); // 11:00
  assert.equal(greetingFor(jakarta, "2026-10-28T07:59:00.000Z"), "Selamat siang"); // 14:59
  assert.equal(greetingFor(jakarta, "2026-10-28T08:00:00.000Z"), "Selamat sore"); // 15:00
  assert.equal(greetingFor(jakarta, "2026-10-28T11:59:00.000Z"), "Selamat sore"); // 18:59
  assert.equal(greetingFor(jakarta, "2026-10-28T12:00:00.000Z"), "Selamat malam"); // 19:00
  assert.equal(greetingFor(jakarta, "2026-10-28T23:30:00.000Z"), "Selamat pagi"); // 06:30 next day
});

test("the same instant greets differently in another timezone", () => {
  const instant = "2026-10-28T16:00:00.000Z";
  assert.equal(greetingFor("UTC", instant), "Selamat sore"); // 16:00
  assert.equal(greetingFor("Asia/Jakarta", instant), "Selamat malam"); // 23:00
  assert.equal(greetingFor("America/Los_Angeles", instant), "Selamat pagi"); // 09:00
});
