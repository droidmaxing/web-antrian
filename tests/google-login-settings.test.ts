import assert from "node:assert/strict";
import test from "node:test";
import {
  maskGoogleClientSecret,
  readGoogleLoginCredentials,
  removeGoogleLoginCredentials,
  saveGoogleLoginCredentials,
  setGoogleLoginEnabled,
  validateGoogleClientId,
  validateGoogleClientSecret,
} from "../src/modules/platform/google-login";

const CLIENT_ID = "1234567890-abcdefghijklmnop.apps.googleusercontent.com";
const CLIENT_SECRET = "GOCSPX-abcdefghijklmnop";

test("validateGoogleClientId only accepts googleusercontent client ids", () => {
  assert.equal(validateGoogleClientId(CLIENT_ID), true);
  assert.equal(validateGoogleClientId("1234567890-abc"), false);
  assert.equal(validateGoogleClientId("https://example.com"), false);
});

test("validateGoogleClientSecret rejects empty and whitespace values", () => {
  assert.equal(validateGoogleClientSecret(CLIENT_SECRET), true);
  assert.equal(validateGoogleClientSecret("short"), false);
  assert.equal(validateGoogleClientSecret("GOCSPX with space"), false);
});

test("maskGoogleClientSecret keeps only the edges", () => {
  assert.equal(maskGoogleClientSecret(CLIENT_SECRET), "GOCSPX…mnop");
});

test("credentials round-trip through the database encrypted", async () => {
  await removeGoogleLoginCredentials();

  const saved = await saveGoogleLoginCredentials(CLIENT_ID, CLIENT_SECRET);
  assert.equal(saved.configured, true);
  assert.equal(saved.source, "website");
  assert.equal(saved.enabled, true);
  assert.equal(saved.clientId, CLIENT_ID);

  const stored = await readGoogleLoginCredentials();
  assert.equal(stored?.clientId, CLIENT_ID);
  assert.equal(stored?.clientSecret, CLIENT_SECRET);

  const disabled = await setGoogleLoginEnabled(false);
  assert.equal(disabled.enabled, false);

  const removed = await removeGoogleLoginCredentials();
  assert.notEqual(removed.source, "website");
  // Tanpa kredensial, sakelar harus terbaca nonaktif (bukan "menyala" tanpa isi).
  assert.equal(removed.configured, false);
  assert.equal(removed.enabled, false);
});
