# AGENTS.md — web-antrian

Panduan kerja untuk agent AI (dan manusia) di repo ini. Baca sebelum menulis kode.

## 1. Fakta repo

- Remote: `git@github.com:droidmaxing/web-antrian.git` — branch kerja: `master`
- Stack: Next.js (App Router, TypeScript strict), Prisma ORM, MySQL 8.0
- Test: unit/integrasi via `tsx --test` — 12 test di `tests/*.test.ts` (belum ada suite E2E)
- Database: MySQL 8.0, schema `queue_management`
- Struktur: `src/app/` (halaman publik `/q/[token]`, `/q/status/[token]`, dashboard), `src/lib/`, `prisma/schema.prisma`

## 2. Menjalankan (Docker Compose)

```bash
cp .env.example .env
docker compose up -d --build      # mysql -> app
docker compose ps                 # web-antrian-mysql (healthy), web-antrian-app
curl -fsS http://127.0.0.1:3000
docker compose logs -f --tail=50 app
docker compose down               # JANGAN pakai -v: volume data MySQL ikut terhapus
```

Port host: web `3000:3000`, mysql `3307:3306`.
Lokal tanpa compose: `npm install && npx prisma generate && npx prisma migrate dev && npm run dev`.

## 3. Gate wajib sebelum commit (harus hijau)

```bash
npx prisma generate
npm run lint            # ESLint
npx tsc --noEmit        # Typecheck
npm test                # 12 unit test (node --test)
npm run build           # Next.js production build
```

Kelima langkah (generate, lint, typecheck, test 12/12 lulus, build) sudah diverifikasi exit 0 di host ini (Node 22); CI menjalankannya di Ubuntu + Node 20.
Tidak ada dependency Playwright/E2E di repo ini; verifikasi UI dilakukan manual di browser (lihat bagian 7).

CI: `.github/workflows/ci.yml` (generate prisma → lint → typecheck → unit test → build).

## 4. Database & migrasi

- Skema di `prisma/schema.prisma`; migrasi di `prisma/migrations/`.
- Perubahan skema: edit schema → `npx prisma migrate dev --name <deskripsi>` → `npx prisma generate` → sesuaikan seed bila perlu.
- Migrasi yang sudah ter-commit jangan diedit; buat migrasi baru.
- Seed idempoten (`prisma/seed.ts`), dilarang `DROP`/`TRUNCATE` data nyata.

## 5. Aturan wajib

Lakukan:
- Periksa kode & komponen yang ada sebelum menambah yang baru; pakai ulang utilitas di `src/lib/`.
- Pertahankan kontrak URL publik (`/q/[token]`, `/q/status/[token]`) — token di URL adalah kunci akses antrean; jangan mengubah format tanpa migrasi data.
- Setiap fitur baru yang menyentuh logika antrean wajib punya unit test di file `*.test.ts` yang sesuai.
- Laporkan hasil gate apa adanya (perintah + exit code).

Jangan:
- Commit `.env`, kredensial DB, atau `AUTH_SECRET`.
- Menambah dependency berat tanpa alasan; repo ini sengaja ringan (Next.js + Prisma saja).
- Mengklaim test lulus tanpa menjalankan `npm test`.
- Memakai `docker compose down -v` (menghapus volume data).

## 6. Konvensi commit

Format: `<tipe>: <deskripsi bahasa Indonesia>` — `feat`, `fix`, `refactor`, `docs`, `test`.
Contoh: `feat: halaman status antrean realtime`, `fix: validasi token kadaluarsa`.

## 7. Definisi selesai

1. Gate bagian 3 hijau.
2. Fitur diverifikasi di browser pada stack yang jalan (port 3000), termasuk state loading/empty/error.
3. `git status` bersih, tidak ada secret ikut ter-commit.
4. Bila menyentuh skema DB: ada file migrasi baru + `npx prisma generate` sudah dijalankan.

## 8. Jebakan yang diketahui

- Prisma client harus di-generate ulang setelah setiap perubahan `schema.prisma`, kalau tidak `tsc`/build gagal dengan error tipe `Prisma.*` tidak dikenal.
- MySQL host di dalam compose adalah `mysql`, bukan `localhost`.
- Container app menunggu MySQL healthy; jangan panik kalau request pertama gagal ~10 detik pertama.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
