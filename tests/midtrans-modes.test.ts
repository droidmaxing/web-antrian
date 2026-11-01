import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../src/modules/shared/errors";
import {
  midtransServerKeyStatus,
  readMidtransEnabled,
  readMidtransMode,
  readMidtransServerKey,
  removeMidtransServerKey,
  saveMidtransEnabled,
  saveMidtransMode,
  saveMidtransServerKey,
  validateServerKey,
} from "../src/modules/billing/midtrans-settings";
import { midtransConfig } from "../src/modules/billing/midtrans";

const SANDBOX_KEY = "SB-Mid-server-testtesttest1234";
const PRODUCTION_KEY = "Mid-server-testtesttest1234";

test("each Midtrans mode only accepts its own key prefix", () => {
  assert.equal(validateServerKey(SANDBOX_KEY, "sandbox"), true);
  assert.equal(validateServerKey(PRODUCTION_KEY, "sandbox"), false);
  assert.equal(validateServerKey(PRODUCTION_KEY, "production"), true);
  assert.equal(validateServerKey(SANDBOX_KEY, "production"), false);
  assert.equal(validateServerKey("Mid-server-short", "production"), false);
});

test("production key slot never disturbs the sandbox slot", async () => {
  const sandboxBefore = await midtransServerKeyStatus("sandbox");
  try {
    await saveMidtransServerKey(PRODUCTION_KEY, "production");
    assert.deepEqual(await midtransServerKeyStatus("sandbox"), sandboxBefore);
    assert.equal((await midtransServerKeyStatus("production")).configured, true);
    assert.equal(await readMidtransServerKey("production"), PRODUCTION_KEY);

    // Kunci tersimpan adalah kunci yang dipakai Snap untuk mode tersebut.
    await saveMidtransMode("production");
    const config = await midtransConfig();
    assert.equal(config?.production, true);
    assert.equal(config?.serverKey, PRODUCTION_KEY);
  } finally {
    await removeMidtransServerKey("production");
    await saveMidtransMode("sandbox");
  }
  assert.equal((await midtransServerKeyStatus("production")).configured, false);
  assert.deepEqual(await midtransServerKeyStatus("sandbox"), sandboxBefore);
});

test("a key for the wrong mode is rejected instead of being stored", async () => {
  await assert.rejects(
    () => saveMidtransServerKey(SANDBOX_KEY, "production"),
    (error: unknown) => error instanceof AppError && error.code === "INVALID_SERVER_KEY" && error.status === 400,
  );
  assert.equal((await midtransServerKeyStatus("production")).configured, false);
});

test("the enable flag defaults to on and round-trips", async () => {
  const before = await readMidtransEnabled();
  try {
    assert.equal(await saveMidtransEnabled(false), false);
    assert.equal(await readMidtransEnabled(), false);
    assert.equal(await saveMidtransEnabled(true), true);
  } finally {
    await saveMidtransEnabled(before);
  }
  assert.equal(await readMidtransEnabled(), before);
  assert.equal(await readMidtransMode(), "sandbox");
});
