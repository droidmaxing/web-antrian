import assert from "node:assert/strict";
import test from "node:test";
import { estimateWaitMinutes } from "../src/modules/queue/domain/estimate";

test("estimasi bertambah mengikuti urutan antrean", () => {
  // 4 orang di depan, estimasi default 12 menit per antrean → 48 menit.
  assert.equal(estimateWaitMinutes({ ahead: 4, minutesPerQueue: 12 }), 48);
  // Urutan berubah → estimasi ikut berubah.
  assert.equal(estimateWaitMinutes({ ahead: 1, minutesPerQueue: 12 }), 12);
});

test("buffer cabang ditambahkan setelah hitungan urutan", () => {
  assert.equal(estimateWaitMinutes({ ahead: 2, minutesPerQueue: 5, bufferMinutes: 3 }), 13);
});

test("antrean kosong berarti nol menit, bukan satu antrean", () => {
  assert.equal(estimateWaitMinutes({ ahead: 0, minutesPerQueue: 0 }), 0);
  assert.equal(estimateWaitMinutes({ ahead: 0, minutesPerQueue: 12 }), 0);
});

test("estimasi default ekstrem tetap dibatasi agar angka masuk akal", () => {
  // Estimasi default 0 menit tidak boleh membuat antrean terlihat instan.
  assert.equal(estimateWaitMinutes({ ahead: 3, minutesPerQueue: 0 }), 3);
  // Estimasi default 10 jam dibatasi 120 menit per antrean.
  assert.equal(estimateWaitMinutes({ ahead: 2, minutesPerQueue: 600 }), 240);
});