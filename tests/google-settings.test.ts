import assert from "node:assert/strict";
import test from "node:test";
import {
  sealApiKey,
  unsealApiKey,
  validateGoogleApiKey,
  maskApiKey,
  saveGoogleApiKey,
  removeGoogleApiKey,
  setGoogleApiKeyEnabled,
  googleApiKeyStatus,
} from "../src/modules/billing/google-settings";
import { prisma } from "../src/lib/prisma";

const TEST_AUTH_SECRET = "a".repeat(32); // 32 chars minimum for encryption
const VALID_GOOGLE_KEY = "AIzaSyABC1234567890DEF_GHIJK_LMNOPQRSTUvwxyz";

test("seal and unseal Google API key round-trip", () => {
  const sealed = sealApiKey(VALID_GOOGLE_KEY, TEST_AUTH_SECRET);
  assert.match(sealed, /^v1:.*:.*:.*$/);
  const unsealed = unsealApiKey(sealed, TEST_AUTH_SECRET);
  assert.equal(unsealed, VALID_GOOGLE_KEY);
});

test("unseal returns null for invalid sealed key", () => {
  const result = unsealApiKey("invalid:format", TEST_AUTH_SECRET);
  assert.equal(result, null);
});

test("validateGoogleApiKey rejects short or invalid formats", () => {
  assert.equal(validateGoogleApiKey("short"), false);
  assert.equal(validateGoogleApiKey("AIzaSyABC1234567890DEF_GHIJK_LMNOPQRSTUvwxyz"), true);
  assert.equal(validateGoogleApiKey("AIza@invalid#chars"), false);
});

test("maskApiKey shows first 10 and last 4 chars", () => {
  const masked = maskApiKey(VALID_GOOGLE_KEY);
  assert.equal(masked, `AIzaSyABC1…wxyz`);
});

test("saveGoogleApiKey stores encrypted key in database", async () => {
  await removeGoogleApiKey(); // cleanup first
  const status = await saveGoogleApiKey(VALID_GOOGLE_KEY);
  assert.equal(status.configured, true);
  assert.equal(status.source, "website");
  assert.match(status.masked, /^AIzaSyABC1…/);
});

test("removeGoogleApiKey deletes the key and disabled flag", async () => {
  await saveGoogleApiKey(VALID_GOOGLE_KEY);
  await setGoogleApiKeyEnabled(true);
  const removed = await removeGoogleApiKey();
  assert.equal(removed.configured, false);
  assert.equal(removed.source, null);
  assert.equal(removed.masked, null);
});

test("setGoogleApiKeyEnabled toggles enabled flag", async () => {
  await saveGoogleApiKey(VALID_GOOGLE_KEY);
  const enabled = await setGoogleApiKeyEnabled(true);
  assert.equal(enabled.enabled, true);
  const disabled = await setGoogleApiKeyEnabled(false);
  assert.equal(disabled.enabled, false);
  await removeGoogleApiKey();
});

test("setGoogleApiKeyEnabled throws when key not configured", async () => {
  await removeGoogleApiKey();
  try {
    await setGoogleApiKeyEnabled(true);
    assert.fail("Should have thrown");
  } catch (error) {
    assert.match(String(error), /Google API key belum dikonfigurasi/);
  }
});
