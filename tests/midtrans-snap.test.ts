import assert from "node:assert/strict";
import test from "node:test";
import { createSnapTransaction } from "../src/modules/billing/midtrans";

/** Membaca body yang dikirim ke Midtrans tanpa benar-benar memanggil gateway. */
async function snapBody(input: { finishUrl?: string }) {
  const original = globalThis.fetch;
  let body: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ token: "snap-token", redirect_url: "https://app.sandbox.midtrans.com/snap/v2/vtweb/x" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    await createSnapTransaction({
      orderId: "ORDER-TEST-1",
      amount: 125000,
      itemName: "Paket Uji (bulanan)",
      customerName: "Uji",
      customerEmail: "uji@example.com",
      finishUrl: input.finishUrl,
    });
  } finally {
    globalThis.fetch = original;
  }
  return body as unknown as Record<string, unknown>;
}

test("Snap memakai finishUrl sendiri supaya tombol silang tidak mendarat di example.com", async () => {
  const finish = "https://antrian.test/dashboard/toko/langganan";
  const body = await snapBody({ finishUrl: finish });
  assert.deepEqual(body.callbacks, { finish });
});

test("tanpa finishUrl tidak ada override callbacks di body Snap", async () => {
  const body = await snapBody({});
  assert.equal("callbacks" in body, false);
});
