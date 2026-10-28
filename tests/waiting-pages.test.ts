import assert from "node:assert/strict";
import test from "node:test";
import {
  WAITING_FETCH_LIMIT,
  nextWaitingPage,
  paginateWaiting,
} from "../src/modules/display/domain/waiting-pages";

test("daftar menunggu dibagi per halaman tanpa memotong nomor", () => {
  const waiting = Array.from({ length: 20 }, (_, index) => `A-${index + 1}`);
  const pages = paginateWaiting(waiting);
  assert.deepEqual(
    pages.map((page) => page.length),
    [8, 8, 4],
  );
  assert.equal(pages.flat().length, waiting.length);
  assert.equal(pages[0][0], "A-1");
  assert.equal(pages[2][3], "A-20");
});

test("daftar kosong tidak menghasilkan halaman", () => {
  assert.deepEqual(paginateWaiting([]), []);
});

test("putaran halaman kembali ke awal dan tidak berputar saat hanya satu halaman", () => {
  assert.equal(nextWaitingPage(0, 3), 1);
  assert.equal(nextWaitingPage(2, 3), 0);
  assert.equal(nextWaitingPage(0, 1), 0);
});

test("batas ambil data menutupi semua halaman yang bisa ditayangkan", () => {
  assert.equal(WAITING_FETCH_LIMIT % 8, 0);
  assert.ok(WAITING_FETCH_LIMIT >= 24);
});
