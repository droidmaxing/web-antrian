import assert from "node:assert/strict";
import test from "node:test";
import { PAGE_SIZES, paginate, resolvePage } from "../src/modules/shared/pagination";

test("resolvePage menjepit halaman dan ukuran di luar daftar", () => {
  assert.deepEqual(resolvePage(12, 10, 2), {
    page: 2,
    pageSize: 10,
    pageCount: 2,
    skip: 10,
    take: 10,
  });
  assert.deepEqual(resolvePage(0, 10, 1), {
    page: 1,
    pageSize: 10,
    pageCount: 1,
    skip: 0,
    take: 10,
  });
  // Ukuran tak dikenal kembali ke 10, halaman di luar rentang dijepit.
  assert.equal(resolvePage(100, 999, 1).pageSize, PAGE_SIZES[0]);
  assert.equal(resolvePage(100, 10, 99).page, 10);
});

test("paginate memotong daftar per halaman", () => {
  const items = Array.from({ length: 25 }, (_, index) => index + 1);
  const third = paginate(items, 10, 3);
  assert.deepEqual(third.rows, [21, 22, 23, 24, 25]);
  assert.equal(third.pageCount, 3);
  assert.equal(paginate(items, 50, 1).rows.length, 25);
});
