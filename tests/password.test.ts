import assert from "node:assert/strict";
import test from "node:test";
import { compare } from "bcryptjs";
import { hashPassword, temporaryPassword } from "../src/modules/shared/password";

test("sandi sementara punya pola tetap dan tidak berulang", () => {
  const a = temporaryPassword();
  const b = temporaryPassword();
  assert.match(a, /^Antrian-[A-Za-z0-9_-]{8}$/);
  assert.notEqual(a, b);
});

test("hanya hash sandi yang bisa diverifikasi, bukan teks aslinya", async () => {
  const password = temporaryPassword();
  const hashed = await hashPassword(password);
  assert.notEqual(hashed, password);
  assert.equal(await compare(password, hashed), true);
  assert.equal(await compare(`${password}x`, hashed), false);
});
