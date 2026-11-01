import assert from "node:assert/strict";
import test from "node:test";
import { pickLeastLoadedCounter } from "../src/modules/queue/domain/counter-assignment";
import { isValidNik } from "../src/modules/shared/nik";

test("tiket baru diarahkan ke loket dengan antrean menunggu paling sedikit", () => {
  assert.equal(
    pickLeastLoadedCounter([
      { id: "loket-1", waiting: 2 },
      { id: "loket-2", waiting: 0 },
      { id: "loket-3", waiting: 1 },
    ]),
    "loket-2",
  );
});

test("seri diputus urutan loket, bukan acak", () => {
  assert.equal(
    pickLeastLoadedCounter([
      { id: "loket-1", waiting: 3 },
      { id: "loket-2", waiting: 3 },
    ]),
    "loket-1",
  );
});

test("tanpa kandidat loket, tiket tidak dipetakan (tiket tetap dipanggil petugas)", () => {
  assert.equal(pickLeastLoadedCounter([]), null);
  assert.equal(pickLeastLoadedCounter([{ id: "loket-1", waiting: 99 }]), "loket-1");
});

test("NIK hanya sah kalau 16 digit angka", () => {
  assert.equal(isValidNik("3273010101900001"), true);
  assert.equal(isValidNik(" 3273010101900001 "), true, "spasi di tepi dimaafkan");
  assert.equal(isValidNik("327301010190000"), false, "15 digit");
  assert.equal(isValidNik("32730101019000012"), false, "17 digit");
  assert.equal(isValidNik("32730101019000ab"), false, "ada huruf");
  assert.equal(isValidNik(""), false);
});
