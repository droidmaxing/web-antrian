import assert from "node:assert/strict";
import test from "node:test";
import { isEventVisibleOnDisplay } from "../src/modules/display/domain/display-scope";

/**
 * Regresi keluhan "pelanggan layanan B hanya ada di loket 02, tapi dipanggil di
 * kedua loket". Snapshot layar sudah disaring per loket; aliran event SSE belum,
 * sehingga setelah halaman termuat layar loket 01 ikut menampilkan (dan
 * mengumumkan) panggilan loket 02.
 */
test("lobby screen (no scope) sees every counter's event", () => {
  assert.equal(isEventVisibleOnDisplay({ counterId: "c1" }, []), true);
  assert.equal(isEventVisibleOnDisplay({ counterId: "c2" }, []), true);
});

test("scoped screen only sees its own counters' events", () => {
  assert.equal(isEventVisibleOnDisplay({ counterId: "c1" }, ["c1"]), true);
  assert.equal(isEventVisibleOnDisplay({ counterId: "c2" }, ["c1"]), false);
});

test("multiple counters on one screen are all visible", () => {
  assert.equal(isEventVisibleOnDisplay({ counterId: "c3" }, ["c1", "c3"]), true);
  assert.equal(isEventVisibleOnDisplay({ counterId: "c2" }, ["c1", "c3"]), false);
});

test("counter-less events (new waiting ticket) still refresh a scoped screen", () => {
  // Punya loket lain tetap diblokir; yang tanpa loket hanya mengubah daftar
  // menunggu, dan snapshot itu sendiri sudah dibatasi cakupan loket.
  assert.equal(isEventVisibleOnDisplay({ counterId: "c2" }, ["c1"]), false);
  assert.equal(isEventVisibleOnDisplay({ queueId: "q1" }, ["c1"]), true);
  assert.equal(isEventVisibleOnDisplay(null, ["c1"]), true);
  assert.equal(isEventVisibleOnDisplay({ counterId: null }, ["c1"]), true);
});
