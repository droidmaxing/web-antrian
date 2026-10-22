#!/usr/bin/env python3
"""
Generate the Indonesian voice-announcement clips used by the queue system.

The runtime never synthesises speech: browsers play these pre-rendered MP3
clips in order (digit by digit), so the announcement sounds identical on every
device and does not depend on voices installed on the operator's machine.

Usage:
    python3 scripts/generate-announcement-audio.py [--out public/audio/id] [--voice id-ID-GadisNeural]

Requires: `pip install edge-tts` and ffmpeg on PATH (only for normalising).
Output: numbered/lettered clips + manifest.json consumed by
`src/modules/announcement/audio-clips.ts`.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
from pathlib import Path

try:
    import edge_tts
except ImportError:  # pragma: no cover - dependency guard for rendering only
    # Verification (`--verify`) never talks to the TTS service, so a missing
    # edge-tts must not block checking an existing clip set on a CI box.
    edge_tts = None  # type: ignore[assignment]

DIGITS = ["nol", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan"]

# Words that may appear in a counter name. Keys are clip ids, values the text
# sent to the TTS engine. Counter names are tokenised at runtime and each token
# is matched against this dictionary (see audio-clips.ts).
WORDS: dict[str, str] = {
    "nomor-antrean": "nomor antrean",
    "silakan-menuju": "silakan menuju",
    "loket": "loket",
    "counter": "counter",
    "ruang": "ruang",
    "poli": "poli",
    "poliklinik": "poliklinik",
    "kasir": "kasir",
    "pembayaran": "pembayaran",
    "pendaftaran": "pendaftaran",
    "farmasi": "farmasi",
    "laboratorium": "laboratorium",
    "radiologi": "radiologi",
    "igd": "I G D",
    "umum": "umum",
    "gigi": "gigi",
    "anak": "anak",
    "kandungan": "kandungan",
    "bedah": "bedah",
    "mata": "mata",
    "tht": "T H T",
    "satu": "satu",
    "dua": "dua",
    "tiga": "tiga",
    "empat": "empat",
    "lima": "lima",
    "enam": "enam",
    "tujuh": "tujuh",
    "delapan": "delapan",
    "sembilan": "sembilan",
    "sepuluh": "sepuluh",
    "sebelas": "sebelas",
    "belas": "belas",
    "puluh": "puluh",
    "ratus": "ratus",
}


def clip_specs() -> list[tuple[str, str]]:
    specs: list[tuple[str, str]] = []
    for value, word in enumerate(DIGITS):
        specs.append((f"digit-{value}", word))
    for index in range(26):
        letter = chr(ord("a") + index)
        specs.append((f"letter-{letter}", letter.upper()))
    specs.extend(WORDS.items())
    specs.append(("jeda", "."))  # short natural pause, rendered as sentence gap
    return specs


async def render(voice: str, text: str, target: Path, retries: int = 3) -> None:
    for attempt in range(1, retries + 1):
        try:
            # Sentences get a trailing period so the engine lands on a falling
            # intonation instead of clipping the last syllable.
            payload = text if text.endswith(".") else f"{text}."
            communicate = edge_tts.Communicate(payload, voice)
            await communicate.save(str(target))
            if target.stat().st_size == 0:
                raise RuntimeError("file kosong")
            return
        except Exception as error:  # noqa: BLE001 - retry network hiccups
            if attempt == retries:
                raise RuntimeError(
                    f"gagal membuat {target.name} setelah {retries} percobaan "
                    f"(voice={voice}): {error}"
                ) from error
            print(f"  ! ulangi ({attempt}/{retries}) {target.name}: {error}", flush=True)
            await asyncio.sleep(1.5 * attempt)


def normalise(path: Path) -> None:
    """Trim dead air, then mono 64 kbps MP3.

    Edge TTS pads every clip with ~1.2 s of trailing silence; leaving it in
    makes an eight-digit ticket take fifteen seconds to read out. We trim the
    head/tail silence and add a fixed 60 ms tail so consecutive digits do not
    run into each other.
    """
    tmp = path.with_suffix(".tmp.mp3")
    audio_filter = (
        "silenceremove=start_periods=1:start_duration=0.02:start_threshold=-45dB"
        ":stop_periods=-1:stop_duration=0.10:stop_threshold=-45dB,"
        "apad=pad_dur=0.06,"
        "loudnorm=I=-16:TP=-1.5:LRA=11"
    )
    subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-i", str(path),
            "-ac", "1", "-ar", "22050", "-codec:a", "libmp3lame", "-b:a", "64k",
            "-af", audio_filter,
            str(tmp),
        ],
        check=True,
    )
    tmp.replace(path)


def write_pause(path: Path, seconds: float = 0.30) -> None:
    """A real (silent) pause clip so the player can hold a beat between phrases."""
    subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono",
            "-t", str(seconds),
            "-codec:a", "libmp3lame", "-b:a", "64k",
            str(path),
        ],
        check=True,
    )


def verify(out: Path) -> int:
    """Fail loudly when the on-disk clips no longer match the manifest.

    This exists because a failed TTS run once looked successful: the script was
    piped into `tail`, so the non-zero exit status was discarded and only the
    stack trace hinted at the problem. `--verify` needs no network.
    """
    problems: list[str] = []
    specs = clip_specs()
    expected = {f"{clip_id}.mp3" for clip_id, _ in specs}
    manifest_path = out / "manifest.json"
    if not manifest_path.exists():
        problems.append("manifest.json tidak ada")
        clips: dict[str, dict[str, str]] = {}
    else:
        clips = json.loads(manifest_path.read_text(encoding="utf-8")).get("clips", {})
        if set(clips) != {clip_id for clip_id, _ in specs}:
            problems.append("daftar klip di manifest tidak sama dengan clip_specs()")

    actual = {path.name for path in out.glob("*.mp3")}
    for name in sorted(expected - actual):
        problems.append(f"hilang: {name}")
    for name in sorted(actual - expected):
        problems.append(f"tidak dikenal: {name}")
    for name in sorted(expected & actual):
        size = (out / name).stat().st_size
        if size < 1024:
            problems.append(f"terlalu kecil ({size} B): {name}")

    total = sum(path.stat().st_size for path in out.glob("*.mp3"))
    print(f"Voice {clips.get('voice', '?')} — {len(expected)} klip, {total / 1024:.0f} KiB")
    if problems:
        for problem in problems:
            print(f"  x {problem}")
        print("GAGAL: klip audio tidak lengkap, jalankan ulang tanpa --verify")
        return 1
    print("OK: semua klip ada, non-kosong, dan cocok dengan manifest")
    return 0


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="public/audio/id")
    parser.add_argument("--voice", default="id-ID-GadisNeural")
    parser.add_argument("--no-normalise", action="store_true")
    parser.add_argument("--force", action="store_true", help="render ulang klip yang sudah ada")
    parser.add_argument(
        "--verify",
        action="store_true",
        help="hanya periksa klip + manifest yang ada, tanpa memanggil TTS",
    )
    args = parser.parse_args()

    out = Path(args.out)
    if args.verify:
        return verify(out)
    out.mkdir(parents=True, exist_ok=True)
    if edge_tts is None:
        print(
            "edge-tts belum terpasang; tidak bisa membuat klip baru. "
            "Jalankan: pip install edge-tts (atau pakai --verify untuk memeriksa klip yang ada)",
            flush=True,
        )
        return 1
    specs = clip_specs()
    print(f"Voice {args.voice} -> {out} ({len(specs)} klip)")

    manifest: dict[str, object] = {"voice": args.voice, "clips": {}}
    for index, (clip_id, text) in enumerate(specs, start=1):
        target = out / f"{clip_id}.mp3"
        skip = target.exists() and target.stat().st_size > 0 and not args.force
        if skip:
            print(f"[{index}/{len(specs)}] {clip_id} (ada, dilewati)")
        else:
            print(f"[{index}/{len(specs)}] {clip_id} <- \"{text}\"", flush=True)
            if clip_id == "jeda":
                write_pause(target)
            else:
                await render(args.voice, text, target)
                if not args.no_normalise:
                    normalise(target)
        manifest["clips"][clip_id] = {"file": target.name, "text": text}  # type: ignore[index]

    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    total = sum(path.stat().st_size for path in out.glob("*.mp3"))
    print(f"Selesai: {len(manifest['clips'])} klip, {total / 1024:.0f} KiB")  # type: ignore[arg-type]
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
