# Panduan Agent untuk Project

## Tentang project

- **Nama project:** Antrian (web-antrian)
- **Tujuan:** Fondasi SaaS manajemen antrean sebagai modular monolith Next.js. Satu model bisnis melayani berbagai jenis usaha lewat konfigurasi (bukan aplikasi per industri): pengambilan nomor/booking pelanggan, pemanggilan antrean, display/TV, QR, dan halaman status publik. Halaman publik: `/q/[token]` dan `/q/status/[token]` — token di URL adalah kunci akses antrean.
- **Stack:** Next.js (App Router), React, TypeScript strict, Tailwind CSS, shadcn/ui, MySQL + Prisma, Auth.js (credentials), Zod untuk validasi input.
- **Struktur penting:** `src/app/`, `src/components/`, `src/lib/`, `src/modules/`, `src/types/`, `prisma/schema.prisma`, `tests/`, `docs/`, `scripts/`, `Dockerfile`, `docker-compose.yml`.
- **Perintah yang sudah tersedia:** `npm install`, `npm run dev`, `npm run db:generate` (`prisma generate`), `npm run db:migrate` (`prisma migrate dev`), `npm run db:seed`, `npm run lint` (ESLint), `npm run typecheck` (`tsc --noEmit`), `npm test` (`tsx --test tests/*.test.ts`), `npm run build`, `npm run audio:verify`. Gate sebelum commit: `npx prisma generate` → `npm run lint` → `npm run typecheck` → `npm test` → `npm run build`. Docker: lihat bagian **Docker Compose dan port**.

Jangan mengasumsikan stack, struktur, atau perintah yang belum diverifikasi dari repository.

## Cara bekerja

1. Pahami permintaan, lalu periksa struktur dan dokumentasi yang relevan sebelum mengubah kode.
2. Gunakan konteks repository yang sudah tersedia. Periksa implementasi terkait, pola penamaan, dan konvensi yang digunakan project.
3. Buat perubahan sekecil mungkin untuk memenuhi permintaan. Hindari refactor atau perubahan yang tidak diperlukan.
4. Jangan menimpa perubahan pengguna yang sudah ada. Periksa status dan diff Git bila tersedia.
5. Setelah mengubah kode, jalankan pemeriksaan yang relevan dan aman—misalnya test, lint, atau build—berdasarkan dokumentasi project. Jangan mengarang hasil pemeriksaan.
6. Jika ada ketidakjelasan yang berdampak besar, risiko kehilangan data, atau langkah yang memerlukan izin, berhenti dan tanyakan terlebih dahulu.

## MCP dan skills yang tersedia

Gunakan hanya MCP dan skills yang relevan dengan tugas. Jangan menganggap tool atau kemampuan tersedia jika tidak dapat diakses pada sesi ini.

### MCP

- **`codebase-memory-mcp`**
  Manfaatkan untuk memahami struktur, komponen, relasi, atau konteks codebase jika tool ini tersedia. Cocok untuk orientasi awal dan menelusuri area yang terdampak. Tetap verifikasi temuan terhadap file aktual sebelum mengubah kode.

### Skills untuk pengembangan

- **`codebase-inspection`** — memahami repository dan menelusuri implementasi.
- **`systematic-debugging`** — mencari akar masalah secara bertahap sebelum memperbaiki bug.
- **`test-driven-development`** — gunakan pendekatan test-first bila sesuai dengan jenis perubahan dan test yang tersedia.
- **`webapp-testing`** — menguji alur dan perilaku website/aplikasi.
- **`requesting-code-review`** — meninjau perubahan untuk menemukan risiko dan kekurangan.
- **`simplify-code`** — menyederhanakan perubahan tanpa mengubah perilaku yang diminta.
- **`frontend-design`** — merancang atau mengimplementasikan antarmuka frontend.
- **`web-design-guidelines`** — memeriksa kualitas dan konsistensi antarmuka web.
- **`dogfood`** — mencoba aplikasi sebagai pengguna jika konteks dan tool yang diperlukan tersedia.
- **`github`** — gunakan untuk pekerjaan GitHub yang diminta, seperti meninjau issue atau pull request.
- **`node-inspect-debugger`** / **`python-debugpy`** — gunakan hanya jika debugging runtime Node.js atau Python memang diperlukan.
- **`spike`** — lakukan eksplorasi teknis terbatas bila diperlukan untuk menjawab pertanyaan kelayakan.
- **`codebase-memory`** — gunakan jika relevan dengan memori atau dokumentasi codebase yang tersedia.

### Skills lain

Gunakan skill bawaan lain hanya bila tugas memang cocok, misalnya `architecture-diagram` untuk diagram arsitektur, `design-md` untuk panduan desain, atau skill dokumen seperti `docx`, `pdf`, dan `xlsx` bila diminta membuat atau mengolah format tersebut.

Jangan menjalankan skill hanya karena tersedia. Jika suatu skill atau MCP tidak dapat diakses, lanjutkan dengan kemampuan yang tersedia dan jelaskan keterbatasannya bila berpengaruh pada hasil.

## Aturan implementasi

### Kode dan struktur

- Ikuti pola, arsitektur, dan gaya kode yang sudah digunakan project.
- Gunakan kembali komponen, fungsi, dan utilitas yang ada — khususnya utilitas di `src/lib/`.
- Hindari menambah dependency baru kecuali diperlukan. Repo ini sengaja ringan (Next.js + Prisma). Jika perlu, jelaskan alasannya dan minta izin sebelum menambahkannya.
- Jangan menghapus fitur atau mengubah perilaku yang tidak termasuk dalam permintaan.
- Pertahankan kontrak URL publik (`/q/[token]`, `/q/status/[token]`) dan format token; jangan mengubahnya tanpa migrasi data.
- Setiap fitur baru yang menyentuh logika antrean wajib punya unit test di file `*.test.ts` yang sesuai.
- Jangan menambahkan data rahasia, kredensial, token, atau informasi sensitif ke source code maupun log.

### Frontend dan aksesibilitas

- Pertahankan konsistensi desain dengan halaman dan komponen yang sudah ada.
- Pastikan antarmuka tetap responsif dan mempertimbangkan aksesibilitas, termasuk label yang jelas, navigasi keyboard, serta kontras yang memadai.
- Tampilkan kondisi penting seperti loading, error, kosong, dan berhasil jika relevan.
- Jangan mengklaim antarmuka sudah diuji di browser jika pengujian tersebut tidak benar-benar dilakukan. Repo ini tidak punya suite E2E/Playwright; verifikasi UI manual di browser.

### Pengujian dan verifikasi

- Pilih pengujian yang berkaitan langsung dengan perubahan.
- Jika pemeriksaan tidak dapat dijalankan, sebutkan pemeriksaan yang terlewat dan alasannya.
- Laporkan hasil berdasarkan output nyata; jangan menyatakan test atau build berhasil tanpa menjalankannya.
- Jangan melakukan tindakan yang berisiko menghapus data atau mengubah layanan bersama tanpa izin.

## Database dan migrasi

- Skema: `prisma/schema.prisma`; migrasi: `prisma/migrations/`.
- Alur perubahan skema: edit schema → `npm run db:migrate -- --name <deskripsi>` → `npm run db:generate` → sesuaikan seed bila perlu.
- Migrasi yang sudah ter-commit jangan diedit; buat migrasi baru.
- Seed idempoten (`prisma/seed.ts`), dilarang `DROP`/`TRUNCATE` data nyata.

## Batasan konfigurasi

- Jangan mengubah konfigurasi atau setup Docker, Docker Compose, file `.env`, environment variables, maupun konfigurasi deployment.
- Jika perubahan pada hal-hal tersebut diperlukan, berhenti dan tanyakan kepada saya terlebih dahulu apakah perubahan itu diizinkan.
- Jangan commit `.env`, kredensial DB, atau `AUTH_SECRET`.
- `APP_URL` (dan `NEXT_PUBLIC_APP_URL`) adalah sumber tunggal untuk semua link absolut yang dihasilkan aplikasi (QR, link status pelanggan, link display/TV, callback auth); `APP_PROTOCOL` opsional memaksa `http`/`https`.

## Docker Compose dan port

- Setelah setiap perubahan pada project, jalankan rebuild dan restart melalui Docker Compose: `docker compose up -d --build` (dijalankan dari folder project). Sesuaikan perintah dengan prosedur project yang sudah ada.
- Sebelum menjalankan aplikasi, periksa port yang digunakan project serta port yang sedang terpakai agar tidak terjadi bentrok.
- Port project ini (dari `docker-compose.yml`): aplikasi `0.0.0.0:3000:3000`, MySQL `127.0.0.1:3307:3306` (hanya host ini; dari luar pakai SSH tunnel). Container: `web-antrian-mysql` (healthy), `web-antrian-app`.
- Isi `APP_URL` dengan IP host (`http://<IP-host>:3000`) agar link QR/antrean tetap benar saat dibuka dari HP/laptop lain di LAN.
- Host MySQL di dalam container adalah `mysql`, bukan `localhost`/`127.0.0.1`. Container `app` menunggu MySQL healthy — request pertama bisa gagal ~10 detik pertama.
- `docker compose down` tanpa `-v`: volume `web_antrian_db` terhapus bila memakai `-v`.

## Laporan akhir

Setelah menyelesaikan tugas, berikan ringkasan singkat yang memuat:

- File yang diubah.
- Perubahan yang dilakukan dan hasilnya.
- Pemeriksaan atau test yang dijalankan beserta hasilnya.
- Hal yang belum dapat diverifikasi atau masih memerlukan tindak lanjut.

Jangan menyebut file sebagai "diubah" jika tidak benar-benar diubah.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
