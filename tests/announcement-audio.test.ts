import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  DIGIT_CLIP_IDS,
  WORD_CLIP_IDS,
  buildAnnouncementClips,
  clipUrl,
  ticketTokens,
} from "../src/modules/announcement/audio-clips";

const AUDIO_DIR = join(process.cwd(), "public", "audio", "id");

test("ticket tokens split prefix, separators and trailing digits", () => {
  assert.deepEqual(ticketTokens("A-012"), ["A", "0", "1", "2"]);
  assert.deepEqual(ticketTokens("B103"), ["B", "1", "0", "3"]);
  assert.deepEqual(ticketTokens("Q 7"), ["Q", "7"]);
});

test("announcement reads the ticket then the counter", () => {
  const { clips, missing } = buildAnnouncementClips({
    ticketNumber: "A-012",
    counterName: "Loket 1",
  });
  assert.deepEqual(missing, []);
  assert.deepEqual(clips, [
    "nomor-antrean",
    "letter-a",
    "digit-0",
    "digit-1",
    "digit-2",
    "jeda",
    "silakan-menuju",
    "loket",
    "satu",
  ]);
});

test("counter names without a known clip are reported, never silently dropped", () => {
  const { clips, missing } = buildAnnouncementClips({
    ticketNumber: "12",
    counterName: "Loket Zebra",
  });
  assert.deepEqual(clips, [
    "nomor-antrean",
    "digit-1",
    "digit-2",
    "jeda",
    "silakan-menuju",
    "loket",
  ]);
  assert.deepEqual(missing, ["zebra"]);
});

test("numeric counter names use number words, not digits", () => {
  assert.deepEqual(
    buildAnnouncementClips({ ticketNumber: "5", counterName: "103" }).clips.slice(-4),
    ["silakan-menuju", "satu", "ratus", "tiga"],
  );
  assert.deepEqual(
    buildAnnouncementClips({ ticketNumber: "5", counterName: "Loket 11" }).clips.slice(-3),
    ["silakan-menuju", "loket", "sebelas"],
  );
});

test("word-style ticket prefixes are spoken, not spelled out", () => {
  const { clips, missing } = buildAnnouncementClips({
    ticketNumber: "UMUM-001",
    counterName: "Loket 01",
  });
  assert.deepEqual(missing, []);
  assert.deepEqual(clips, [
    "nomor-antrean",
    "umum",
    "digit-0",
    "digit-0",
    "digit-1",
    "jeda",
    "silakan-menuju",
    "loket",
    "satu",
  ]);
});

test("every clip the mapper can emit exists on disk as a real file", () => {
  const referenced = new Set<string>(["jeda", ...DIGIT_CLIP_IDS, ...WORD_CLIP_IDS]);
  for (const ticket of ["A-012", "B-1", "Z-999"]) {
    for (const clip of buildAnnouncementClips({ ticketNumber: ticket, counterName: "Loket 100" }).clips) {
      referenced.add(clip);
    }
  }
  for (const clipId of referenced) {
    assert.ok(
      existsSync(join(AUDIO_DIR, `${clipId}.mp3`)),
      `missing audio clip for "${clipId}"`,
    );
  }
  assert.equal(clipUrl("digit-1"), "/audio/id/digit-1.mp3");
});
