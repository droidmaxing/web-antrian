import assert from "node:assert/strict";
import test from "node:test";
import { INTAKE_CUTOFF_MINUTES, intakeState, minutesOfDay } from "../src/modules/queue/domain/intake";

// Senin 09:00–17:00, Minggu tutup.
const hours = [
  { weekday: 0, opensAt: "09:00", closesAt: "17:00", closed: true },
  { weekday: 1, opensAt: "09:00", closesAt: "17:00", closed: false },
];

test("AUTO mengikuti jam operasional dan berhenti sebelum jam tutup", () => {
  const at = (localDateTime: string) =>
    intakeState({ mode: "AUTO", localDateTime, hours }).open;

  assert.equal(INTAKE_CUTOFF_MINUTES, 30);
  assert.equal(at("2026-11-02T08:59"), false, "sebelum jam buka");
  assert.equal(at("2026-11-02T09:00"), true, "tepat jam buka");
  assert.equal(at("2026-11-02T16:29"), true, "masih di luar ambang tutup");
  assert.equal(at("2026-11-02T16:30"), false, "tepat 30 menit sebelum tutup");
  assert.equal(at("2026-11-02T17:30"), false, "setelah jam tutup");
  assert.equal(intakeState({ mode: "AUTO", localDateTime: "2026-11-02T16:30", hours }).reason.includes("mendekati jam tutup"), true);
});

test("hari tutup dan jam kosong", () => {
  const sunday = intakeState({ mode: "AUTO", localDateTime: "2026-11-01T10:00", hours });
  assert.equal(sunday.open, false);
  assert.match(sunday.reason, /Minggu/);

  const noHours = intakeState({ mode: "AUTO", localDateTime: "2026-11-02T10:00", hours: [] });
  assert.equal(noHours.open, true, "jam belum diatur tidak mengunci cabang");
});

test("tombol manual menang atas jam operasional", () => {
  const forcedOpen = intakeState({ mode: "OPEN", localDateTime: "2026-11-01T22:00", hours });
  assert.equal(forcedOpen.open, true, "petugas bisa membuka di luar jadwal");

  const forcedClosed = intakeState({ mode: "CLOSED", localDateTime: "2026-11-02T10:00", hours });
  assert.equal(forcedClosed.open, false);
  assert.match(forcedClosed.reason, /petugas/);
});

test("minutesOfDay menolak format yang salah", () => {
  assert.equal(minutesOfDay("2026-11-02T16:30"), 990);
  assert.throws(() => minutesOfDay("2026-11-02"));
});
