import assert from "node:assert/strict";
import test from "node:test";
import { sealSecret, unsealSecret } from "../src/modules/shared/secret-box";

const TEST_AUTH_SECRET = "a".repeat(32);
const PLAINTEXT = "GOCSPX-kredensial-uji-123";

test("seal dan unseal kredensial bolak-balik", () => {
  const sealed = sealSecret(PLAINTEXT, TEST_AUTH_SECRET);
  assert.match(sealed, /^v1:.*:.*:.*$/);
  assert.notEqual(sealed, PLAINTEXT);
  assert.equal(unsealSecret(sealed, TEST_AUTH_SECRET), PLAINTEXT);
});

test("unseal menolak format rusak atau AUTH_SECRET berbeda", () => {
  assert.equal(unsealSecret("invalid:format", TEST_AUTH_SECRET), null);
  assert.equal(unsealSecret(sealSecret(PLAINTEXT, TEST_AUTH_SECRET), "b".repeat(32)), null);
});
