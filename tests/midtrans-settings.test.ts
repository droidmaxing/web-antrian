import assert from "node:assert/strict";
import test from "node:test";
import { maskServerKey, sealServerKey, unsealServerKey, validateSandboxServerKey } from "../src/modules/billing/midtrans-settings";

test("sandbox server keys are validated without trimming away malformed input", () => {
  assert.equal(validateSandboxServerKey("SB-Mid-server-abcdefghijklmnop"), true);
  assert.equal(validateSandboxServerKey("Mid-server-abcdefghijklmnop"), false);
  assert.equal(validateSandboxServerKey("SB-Mid-server-short"), false);
});

test("server keys round-trip through authenticated encryption", () => {
  const authSecret = "test-auth-secret-that-is-long-enough-32chars";
  const encrypted = sealServerKey("SB-Mid-server-abcdefghijklmnop", authSecret);
  assert.notEqual(encrypted, "SB-Mid-server-abcdefghijklmnop");
  assert.equal(unsealServerKey(encrypted, authSecret), "SB-Mid-server-abcdefghijklmnop");
  assert.equal(unsealServerKey(encrypted, "different-auth-secret"), null);
  assert.equal(unsealServerKey("SB-Mid-server-plaintext", authSecret), null);
  assert.equal(unsealServerKey("v1:aaaa:bbbb:cccc", authSecret), null);
});

test("server-key status reveals only a short identifying hint", () => {
  assert.equal(maskServerKey("SB-Mid-server-abcdefghijklmnop"), "SB-Mid-server-…mnop");
});
