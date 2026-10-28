import assert from "node:assert/strict";
import test from "node:test";
import { resolvePage } from "../src/modules/customer/domain/pagination";

test("skip/take dihitung dari nomor halaman", () => {
  assert.deepEqual(resolvePage(12, 10, 2), {
    page: 2,
    pageSize: 10,
    pageCount: 2,
    skip: 10,
    take: 10,
  });
});

test("halaman di luar rentang dijepit ke halaman yang ada", () => {
  assert.equal(resolvePage(12, 10, 9).page, 2);
  assert.equal(resolvePage(0, 10, 3).page, 1);
  assert.equal(resolvePage(12, 10, -4).page, 1);
});

test("daftar kosong tetap satu halaman kosong", () => {
  assert.deepEqual(resolvePage(0, 50, 1), {
    page: 1,
    pageSize: 50,
    pageCount: 1,
    skip: 0,
    take: 50,
  });
});

test("ukuran halaman tak dikenal kembali ke 10", () => {
  assert.equal(resolvePage(120, 25, 1).pageSize, 10);
  assert.equal(resolvePage(120, 100, 2).skip, 100);
});
