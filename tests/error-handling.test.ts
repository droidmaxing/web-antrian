import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import {
  AppError,
  errorResponse,
  readJsonRequest,
} from "../src/modules/shared/errors";
import { validationAppError } from "../src/modules/shared/validation-error";

test("validation errors include safe, field-specific guidance", async () => {
  const result = z.object({
    customerName: z.string().min(2),
    customerEmail: z.email(),
  }).safeParse({ customerName: "", customerEmail: "invalid" });
  assert.equal(result.success, false);
  if (result.success) return;

  const response = errorResponse(
    validationAppError(result.error, "Periksa data.", {
      customerName: "Nama lengkap",
      customerEmail: "Email",
    }),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      code: "INVALID_INPUT",
      message: "Periksa data.",
      fields: {
        customerName: "Periksa kembali Nama lengkap — nilainya belum sesuai.",
        customerEmail: "Periksa kembali Email — nilainya belum sesuai.",
      },
    },
  });
});

test("malformed JSON requests return a client validation error", async () => {
  await assert.rejects(
    readJsonRequest(new Request("http://localhost/api", {
      method: "POST",
      body: "{",
      headers: { "Content-Type": "application/json" },
    })),
    (error: unknown) =>
      error instanceof AppError &&
      error.status === 400 &&
      error.code === "INVALID_JSON",
  );
});

test("unexpected errors are logged and do not leak their message", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  let response: Response;
  try {
    response = errorResponse(new Error("database password must not leak"));
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: {
      code: "INTERNAL_ERROR",
      message: "Terjadi kesalahan server.",
    },
  });
});
