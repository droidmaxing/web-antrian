# Rancangan Teknis — web-antrian sebagai SaaS Antrean

Dokumen ini adalah hasil audit kode menyeluruh (bukan asumsi) dan rancangan perbaikan
sebelum implementasi. Setiap temuan menyebut file dan baris agar bisa diverifikasi.

Status basis kode: Next.js 16 App Router, TypeScript strict, Prisma 6 + MySQL 8,
NextAuth v5, Docker Compose, gate CI `prisma generate → lint → tsc → test → build`.

---

## 1. Ringkasan temuan audit

### 1.1 Fitur yang benar-benar berfungsi

| Area | Bukti |
|---|---|
| Antrean inti (ambil nomor, panggil, mulai, selesai, lewati) | `src/modules/queue/application/queue-service.ts`, `domain/state-machine.ts`, 12 unit test |
| Ambil nomor publik via QR | `src/modules/queue/application/public-queue.ts`, halaman `/q/[token]` |
| Status antrean publik | `/q/status/[token]`, token akses per-antrean |
| Display TV + SSE | `src/modules/display/display-service.ts`, `/display/[token]`, `/api/v1/public/displays/[token]/events` |
| Booking | `src/modules/booking/application/booking-service.ts`, `/book/[token]` |
| Layanan (CRUD) | `src/modules/catalog/catalog-service.ts` + `api/.../services` + `components/manage/services-manager.tsx` |
| Loket (CRUD) | `catalog-service.ts` (baris 209–333) + `api/.../counters` + `components/manage/counters-manager.tsx` |
| Cabang, tim, laporan | `tenancy/branch-service.ts`, `tenancy/team-service.ts`, `report/report-service.ts` + UI masing-masing |
| Audit log | `modules/shared/audit.ts`, ditulis pada setiap mutasi |
| Feature gate per tenant | `modules/feature/feature-gate.ts`, `components/feature-settings.tsx` |

Kesimpulan: backend manajemen **sudah ada**. Keluhan "loket tidak bisa tambah/edit"
bukan karena API hilang.

### 1.2 Penyebab sebenarnya keluhan pengguna

**A. Hak akses UI salah — OWNER lebih rendah dari SUPER_ADMIN.**
`src/components/dashboard.tsx:145`

```ts
const canConfigure = role === "SUPER_ADMIN";
```

`OWNER` (pemilik bisnis) **tidak** mendapat tombol tambah/edit layanan, loket, cabang,
maupun pengaturan. Ini bug hak akses, bukan bug CRUD. Akibatnya pemilik workspace melihat
semua panel manajemen dalam mode baca-saja.

**B. Akun demo yang dipakai untuk mencoba adalah ADMIN.**
`prisma/seed.ts` membuat `admin@antrian.test` dengan `MembershipRole.ADMIN`. ADMIN
memang tidak boleh mengubah katalog (`catalog-service.ts` → `requireRole(..., ["SUPER_ADMIN"])`).
Jadi saat login dengan akun demo, tombol tambah/edit memang tidak muncul.

**C. Manajemen pelanggan tidak ada sama sekali.**
Model `Customer` sudah ada di `prisma/schema.prisma:235` dan dipakai untuk membuat
pelanggan dari form publik (`public-queue.ts:114–135`) serta booking
(`booking-service.ts:268`), tetapi:

- tidak ada service bisnis untuk pelanggan,
- tidak ada route `/api/v1/businesses/[businessSlug]/customers`,
- tidak ada komponen UI; kata "Pelanggan" hanya muncul sebagai label kolom (15 kemunculan).

Jadi permintaan "pelanggan tidak bisa tambah/edit" benar: fiturnya belum pernah dibuat.

**D. Kontrol UI statis (dekoratif) di dashboard.**
Hasil hitung `<button` vs `onClick` pada `dashboard.tsx`: 17 tombol, 7 handler.
Tombol tanpa handler: Command/⌘, workspace switcher, "Pelajari sistem", bell notifikasi,
filter tanggal "Hari ini", filter "Hari ini" pada grafik, "Semua status", "Lihat semua",
serta `MoreHorizontal` pada panel loket. Selain itu state `queueQuery`/`statusFilter`
(`dashboard.tsx:155–156`) dan `visibleQueues` (`:263–274`) sudah dihitung tetapi tabel
masih me-render `queues` (`:696`) → pencarian tidak berpengaruh dan `visibleQueues`
memicu error `no-unused-vars`.

**E. Suara panggilan masih memakai `speechSynthesis` (TTS browser), bukan audio.**
`dashboard.tsx:161–198` dan `tv-display.tsx:57–75`. Konsekuensi: kualitas suara
bergantung perangkat, tidak ada suara Indonesia di banyak browser/OS, dan istilah
"dari audio/rekaman" belum terpenuhi.

### 1.3 `localhost` yang tersisa (dihitung ulang, hanya kode & konfigurasi)

`src/` → **0 kemunculan** (sudah bersih, semua lewat `src/lib/app-url.ts`).

Sisa 9 kemunculan, semuanya bukan URL aplikasi yang di-hardcode di runtime:

| File | Baris | Isi | Keputusan |
|---|---|---|---|
| `docker-compose.yml` | 16 | `mysqladmin ping -h localhost` | benar, di dalam container MySQL |
| `docker-compose.yml` | 32–33 | `${APP_URL:-http://localhost:3000}` | default dev; produksi wajib mengisi env |
| `tests/error-handling.test.ts` | 40 | `new Request("http://localhost/api")` | fixture unit test |
| `AGENTS.md` | 19, 78 | perintah dokumentasi | dokumentasi |
| `README.md` | 20, 33, 61 | panduan lokal | dokumentasi |

Tidak ada lagi `http://localhost` yang dipakai untuk redirect, callback, QR, atau API.
Yang perlu diperbaiki hanya: jadikan default compose eksplisit "wajib env" agar tidak
ada default localhost yang ikut ke produksi, dan pastikan `NEXT_PUBLIC_APP_URL` di-inline
saat build (bukan hanya runtime).

### 1.4 Risiko teknis lain yang ditemukan

1. `Dockerfile:6` memakai `RUN npm run build || true` — build gagal tetap menghasilkan image.
2. `docker-compose.yml:38` menjalankan `migrate deploy && generate && seed && build && start`
   setiap container naik; seed berisi password demo dan selalu dijalankan di produksi.
3. Tidak ada route registrasi tenant. Bisnis baru harus dibuat lewat seed/DB manual.
4. `middleware.ts` tidak ada; proteksi hanya per-halaman (`auth()` di page/route), sudah
   konsisten tetapi belum ada pertahanan terpusat.
5. `SERVICE_NOT_FOUND` pada ambil nomor publik membocorkan ada/tidaknya layanan (minor).
6. Belum ada test untuk modul baru (`catalog`, `tenancy`, `report`, `customer`, audio).

---

## 2. Kebutuhan yang harus dipenuhi

1. **Semua fitur statis menjadi nyata** — setiap tombol/elemen interaktif punya efek,
   atau dihapus bila memang tidak dibutuhkan.
2. **Suara panggilan berasal dari audio/rekaman dan otomatis** — nomor + loket,
   sinkron dengan display, tanpa pemanggilan ganda.
3. **Tidak ada `localhost` hardcoded** — base URL dari environment.
4. **Pelanggan & loket bisa tambah/edit dari UI** — termasuk hak akses yang benar.
5. Standar SaaS: multi-tenant, otorisasi berlapis, audit trail, validasi input, rate limit.

---

## 3. Rancangan solusi

### 3.1 Hak akses (perbaikan inti)

Matriks peran yang dipakai konsisten di UI dan service:

| Aksi | OWNER | SUPER_ADMIN | ADMIN |
|---|---|---|---|
| Panggil/selesaikan antrean | ✅ | ✅ | ✅ |
| Kelola layanan, loket, cabang, pelanggan | ✅ | ✅ | ❌ |
| Kelola tim & lihat laporan | ✅ | ✅ | ❌ |
| Pengaturan fitur, link akses, display | ✅ | ✅ | ❌ |
| Tagihan/billing (roadmap) | ✅ | ❌ | ❌ |

Perubahan: `canConfigure = role === "OWNER" || role === "SUPER_ADMIN"`.
Service `requireRole` untuk katalog/cabang/pelanggan ditambah `OWNER`.
Seed menambah akun demo `owner@antrian.test` (OWNER) agar fitur manajemen bisa dicoba
langsung, dan `admin@antrian.test` tetap ADMIN untuk menguji pembatasan.

### 3.2 Modul pelanggan (baru)

Model sudah ada; tidak perlu migrasi.

```
src/modules/customer/customer-service.ts
  listCustomers(context, { branchId?, query?, page? })   // OWNER|SUPER_ADMIN|ADMIN (baca)
  createCustomer(context, input)                          // OWNER|SUPER_ADMIN
  updateCustomer(context, id, input)                      // OWNER|SUPER_ADMIN
  archiveCustomer(context, id)                            // OWNER|SUPER_ADMIN (soft: tak ada kolom aktif → hard delete hanya jika tanpa riwayat)
```

Aturan:
- `name` wajib 2–80 karakter; `phone` opsional, dinormalisasi (`+62…`, spasi/strip dibuang),
  unik per bisnis bila diisi (cek manual + index `[businessId, phone]` sudah ada).
- `email` opsional, validasi zod, lowercase.
- Pelanggan dengan riwayat `Queue`/`Booking` tidak dihapus, hanya dilepas dari daftar aktif?
  → karena skema tidak punya `active`, keputusan: **hapus hanya bila tidak punya riwayat**;
  bila punya, kembalikan 409 `CUSTOMER_HAS_HISTORY` dengan pesan agar diarsipkan lewat
  penonaktifan kontak (atau biarkan). Ini menjaga integritas laporan.
- Setiap mutasi menulis `AuditLog` (`CUSTOMER_CREATED/UPDATED/DELETED`).
- Daftar menyertakan agregat: jumlah antrean, kunjungan terakhir, layanan terakhir.

API:
```
GET    /api/v1/businesses/[slug]/customers?query=&page=
POST   /api/v1/businesses/[slug]/customers
PATCH  /api/v1/businesses/[slug]/customers/[customerId]
DELETE /api/v1/businesses/[slug]/customers/[customerId]
```

UI `src/components/manage/customers-manager.tsx`: tabel + pencarian + form inline
(nama, telepon, email), tombol Tambah/Edit/Hapus dengan konfirmasi, state loading/empty/error,
mengikuti pola `counters-manager.tsx` (fetch + `InlineNotice`) agar konsisten.
Dipasang di dashboard pada anchor `#customers`, ditambah NavLink "Pelanggan".
ADMIN melihat daftar tanpa tombol mutasi.

### 3.3 Suara panggilan berbasis audio (bukan TTS runtime)

**Keputusan:** klip audio pra-render (neural Indonesian voice), diputar berurutan oleh
`HTMLAudioElement`/Web Audio. Alasan:
- benar-benar "dari audio/rekaman", bukan sintesis runtime,
- identik di semua perangkat (tidak bergantung voice OS seperti sekarang),
- tidak butuh internet saat operasi; file disajikan dari `/audio/id/…`,
- bebas masalah kutipan/angka: "012" dibaca "nol satu dua" karena dipotong per digit.

Aset yang dihasilkan (`public/audio/id/`):
```
digit-0 … digit-9.mp3      angka
letter-a … letter-z.mp3    awalan tiket (A-012)
nomor-antrean.mp3          "nomor antrean"
menuju.mp3                 "silakan menuju"
loket.mp3                  "loket"
counter-<slug>.mp3         nama loket kustom (di-generate saat build/deploy)
silence-300.mp3            jeda antar frasa
```
Manifest `public/audio/id/manifest.json` berisi daftar file + versi, sehingga klien bisa
memuat sekali dan memvalidasi ketersediaan.

Pemutar (`src/modules/announcement/audio-player.ts`, tanpa dependensi baru):

```ts
class AnnouncementAudioPlayer {
  prime(): Promise<void>            // dipanggil pada gesture pertama (unlock autoplay)
  play(text: string): Promise<void> // antrean berurutan, tidak tumpang tindih
  stop(): void
}
buildAnnouncementClips(ticket, counterName): string[] // ["nomor-antrean","letter-a","digit-0",…]
```

Alur otomatis:
1. Operator menekan "Panggil berikutnya" (gesture) → audio di-unlock sekali.
2. Server menulis `OutboxEvent` `queue.called` dan mengembalikan `eventId`
   (`queue-service.ts:208–214`, `:346–352`).
3. Dashboard memanggil `announce({eventId, ticketNumber, counterName})`:
   `shouldAnnounce(status)` → `ledger.claim(eventId)` → `player.play(clips)`.
4. Display TV menerima SSE yang sama dan memakai `AnnouncementLedger` sendiri
   dengan `eventId` dari payload, sehingga **satu event = satu suara**.
5. Bila klip tidak tersedia/gagal dimuat → fallback `speechSynthesis` (tetap satu kali,
   karena dedup sudah dilakukan lebih dulu).

Indikator status di UI: "Suara siap", "Suara terkunci (klik aktifkan)", "Dimatikan",
plus teks terakhir yang diumumkan. Tidak ada klaim "otomatis" palsu: browser tetap
butuh satu gesture; setelah itu semua pemanggilan otomatis.

Nama loket dinamis ditangani dengan aturan klip:
- `"Loket 01"` → `loket` + `digit-0` + `digit-1`
- `"Loket A"` → `loket` + `letter-a`
- nama bebas lain → dipecah per kata; kata tanpa klip dilewati (dan dicatat di UI),
  atau di-generate sebagai klip saat deploy lewat `scripts/generate-announcement-audio.py`.

### 3.4 Dashboard: kontrol statis menjadi nyata

| Kontrol | Perilaku baru |
|---|---|
| Kotak cari | Memfilter tabel (`visibleQueues`), `⌘K`/`Ctrl+K` fokus ke input, Esc reset |
| "Semua status" | Dropdown nyata: Semua, Menunggu, Dipanggil, Dilayani, Selesai, Lewat |
| "Lihat semua" | Toggle menampilkan seluruh baris vs 8 baris pertama |
| Switcher workspace/cabang | Select cabang → `router.push('?branch=…')` (sudah ada mekanisme `searchParams.branch`) |
| "Hari ini" (header & grafik) | Select rentang waktu nyata (`Hari ini`, `1 jam`, `3 jam`, `8 jam`) yang menyaring tabel sekaligus grafik aktivitas |
| Bell | Menampilkan jumlah antrean menunggu → klik menggulir ke `#queue` (bukan notifikasi palsu) |
| Command (⌘) | Membuka/menutup kotak cari |
| "Pelajari sistem" | Menghapus tombol dekoratif, diganti tautan dokumentasi `README` |
| MoreHorizontal | Menghapus (tidak ada menu) |
| "Kelola antrean" | Sudah `<a href="#queue">` (nyata) |

Prinsip: tidak ada tombol tanpa efek. Elemen yang tidak punya fungsi bisnis dihapus.

Selain itu tabel memakai `visibleQueues` dan footer menampilkan
"Menampilkan X dari Y antrean".

### 3.5 Environment URL

- `src/lib/app-url.ts` tetap satu-satunya sumber (`APP_URL` → `NEXT_PUBLIC_APP_URL` →
  header proxy → error `APP_URL_MISSING`).
- `docker-compose.yml`: default `localhost` dihapus. `APP_URL`/`NEXT_PUBLIC_APP_URL`
  dibiarkan kosong bila tidak diisi, sehingga aplikasi menurunkan origin dari header
  proxy (`X-Forwarded-Host`/`Host`) — deployment tidak pernah mewarisi origin localhost
  secara diam-diam. Untuk produksi tetap disarankan mengisi `APP_URL` eksplisit.
- `Dockerfile`: build arg `NEXT_PUBLIC_APP_URL` agar nilai ter-inline saat build.
- `README.md` + `.env.example`: contoh produksi dan penjelasan.
- `access-links.tsx:70` (`window.location.origin`) dipertahankan hanya sebagai fallback
  klien bila `baseUrl` dari server kosong; server selalu mengirim `resolveAppUrl`.

### 3.6 Perbaikan operasional (kecil, berdampak)

- `Dockerfile`: buang `|| true`.
- Pisahkan seed demo dari startup produksi: `SEED_DEMO_DATA=true` untuk mengaktifkan.
- Naikkan `statement_timeout` tidak relevan (MySQL); cukup pastikan `prisma migrate deploy`
  idempoten (sudah).
- Tambah unit test: `customer-service` (validasi & scoping), `announcement` clip builder,
  `app-url` (env-first), filter antrean.

---

## 4. Urutan implementasi

| Fase | Isi | Gate |
|---|---|---|
| 1 | Perbaikan hak akses (`canConfigure` + `requireRole` OWNER) & seed akun owner | tsc, lint |
| 2 | Dashboard: `visibleQueues`, filter status, pencarian ⌘K, hapus kontrol mati | tsc, lint |
| 3 | Modul pelanggan: service + 2 route + UI + nav | tsc, lint, test |
| 4 | Audio panggilan: generator klip, manifest, `audio-player.ts`, wiring dashboard + TV | tsc, lint, test, build |
| 5 | Env/deploy: compose wajib env, Dockerfile build-arg, dokumentasi | build |
| 6 | Verifikasi runtime: seed, login tiap peran, CRUD pelanggan/loket, panggil antrean, cek audio & SSE, responsif | manual + log |
| 7 | Manajemen display: `renameDisplay`/`rotateDisplayToken`/`setDisplayActive`/`deleteDisplay` + route `[displayId]` + `displays-manager.tsx` + nav | tsc, lint, test, E2E DB |

Definisi selesai mengikuti `AGENTS.md` §7: gate hijau, fitur diverifikasi di browser
pada stack yang berjalan, `git status` bersih dari secret, migrasi (bila ada) ter-commit.

---

## 5. Yang tidak diubah

- Kontrak URL publik `/q/[token]`, `/q/status/[token]`, `/display/[token]`, `/book/...`
  (token adalah kunci akses; perubahan akan memutus QR yang sudah dicetak).
- Skema database: `Customer` sudah ada, tidak perlu migrasi untuk fase 1–5.
- State machine antrean dan 12 unit test yang sudah lulus.

---

## 6. Hasil verifikasi (bukti nyata, 2026-10-21)

Gate statis:

| Gate | Perintah | Hasil |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | `TSC_EXIT:0` |
| ESLint | `npm run lint` | `LINT_EXIT:0` |
| Unit test | `npm test` | `# pass 20`, `# fail 0` |
| Build produksi | `npm run build` (di dalam image) | exit 0 |

Verifikasi runtime (stack Docker berjalan, sesi OWNER asli):

- **Klip audio** — 72 MP3 + manifest ada di `public/audio/id`, semuanya non-kosong
  (tidak ada file < 1 KB), `jeda.mp3` = 0,300 s. Disajikan nyata oleh server:
  `/audio/id/digit-1.mp3`, `/nomor-antrean.mp3`, `/manifest.json` → 200.
  Sebelum rebuild, klip ini 404 karena image lama belum memuat `public/audio`
  (`|| true` di Dockerfile membuat kegagalan build tidak terlihat) — sudah diperbaiki.
- **Panggilan otomatis** — `POST /queues` (call-next) mengembalikan
  `{ ticketNumber, counterName, eventId }`. `eventId` **identik** dengan baris
  `OutboxEvent.id`, jadi kuncinya benar-benar berasal dari server.
- **SSE real-time** — saat `call-next` dijalankan, stream
  `/api/v1/public/displays/[token]/events` mengirim `queue.called` berisi
  `UMUM-002` → `Loket 02` dalam hitungan detik; halaman `/display/[token]`
  langsung menampilkan nomor tersebut dan menghapus antrean yang sudah selesai.
- **Anti pemanggilan ganda** — `shouldAnnounce()` hanya `CALLED`, sehingga transisi
  `CALLED → SERVING` tidak memicu suara kedua; setiap klien punya
  `AnnouncementLedger` sendiri dan mengklaim `eventId`.
- **CRUD loket** — lewat HTTP sebagai OWNER: `POST` 201 → `PATCH` 200 → `DELETE` 200,
  baris benar-benar hilang dari tabel.
- **CRUD pelanggan** — `POST` → `GET` (cari) → `PATCH` → duplikat ditolak → `DELETE`.
- **CRUD display** — `scripts/verify-display-flow.ts`: token disimpan sebagai hash
  (`storedPlaintext=false`), rename, nonaktif (token langsung ditolak), rotasi
  (token lama ditolak, token baru diterima), hapus, dan 6 entri audit.
- **Skrip E2E DB** — `verify-customer-flow.ts`, `verify-counter-flow.ts`,
  `verify-display-flow.ts` semuanya exit 0 terhadap MySQL nyata.
- **Integritas klip audio** — 72 MP3 terdekode semua (`ffprobe` 0 gagal), manifest
  cocok persis dengan `clip_specs()` (0 hilang, 0 tak terdaftar). Perintah
  `npm run audio:verify` memeriksa ini tanpa jaringan dan exit 1 bila ada yang
  hilang. Semua klip disajikan `/audio/id/*.mp3` → 200 dengan ukuran wajar.
- **Pelajaran:** pembuatan audio pernah tampak "berhasil" padahal gagal
  (`NoAudioReceived`) karena output dipipe ke `tail` sehingga exit code tertelan,
  dan `--verify` sempat butuh `edge-tts` padahal tidak memakainya. Keduanya sudah
  diperbaiki: import TTS sekarang lazy, dan kegagalan render melempar pesan jelas.

### 6.1 Uji manual lewat browser (peran pengguna, 2026-10-21)

Semua langkah di bawah dijalankan pada stack Docker yang berjalan, memakai sesi
OWNER asli (cookie yang sudah ada, bukan kredensial yang diketik ulang).

| Langkah | Hasil |
|---|---|
| Buka `/dashboard/klinik-sehat` | Halaman termuat, `h1` "Selamat pagi, Dewi" |
| Tambah pelanggan dari form | Tersimpan; daftar berubah 5 → 6 kontak, notifikasi "Pelanggan baru ditambahkan." |
| Edit pelanggan | Form terisi data lama, simpan berhasil |
| Simpan nomor duplikat | Ditolak 409, form tetap terbuka, input bertanda `aria-invalid="true"` + pesan per field |
| Ambil tiket dari `/q/<token>` publik | `UMUM-003` terbit, halaman status menampilkan estimasi tunggu |
| Klik "Panggil berikutnya" | Tombol aktif dengan label "Panggil berikutnya · 1", status DB `UMUM-003 → CALLED` |
| Suara otomatis | Urutan klip: `nomor-antrean → umum → digit-0 → digit-0 → digit-3 → jeda → silakan-menuju → loket → dua` |
| Layar TV `/display/<token>` | Menampilkan `UMUM-003` → `Loket 02` dalam hitungan detik |
| Filter waktu (`1h`, `3h`, `8h`) | Tabel dan grafik aktivitas ikut menyempit; pesan kosong menyebut rentang waktu |
| Menu loket, bantuan, pemilih cabang | Semua `<details>` membuka isi nyata; tidak ada tautan `#` yang mati (0 dari 22 anchor) |
| Status loket | `SERVING` → "Melayani", `CALLED` → "Dipanggil" (sebelumnya keduanya "Melayani") |
| Sidebar desktop 1280×480, 1280×600, 1440×900 | Daftar nav punya scroll sendiri; "Keluar" tetap terlihat di semua tinggi layar |
| Sidebar isi terpanjang | `scrollHeight` 943 vs `clientHeight` 410 → scroll 533px, tautan terakhir ("Pelajari sistem") tercapai |
| Tablet 820×1180 & HP 390×844 | Menu akun di header membuka panel dengan `Pengaturan akun`, `Tim & akses`, `Keluar`; semuanya di dalam viewport |
| Klik "Keluar" (desktop, tablet, HP) | Sesi berakhir, dialihkan ke `/login` pada origin yang sama (`127.0.0.1`, bukan `localhost`); membuka `/dashboard` setelahnya langsung dikembalikan ke `/login` |

### 6.2 Perbaikan aksesibilitas navigasi (2026-10-21)

Dua cacat nyata yang dilaporkan pengguna dan penyebabnya:

1. **Desktop:** `<aside>` memakai `fixed inset-y-0` dengan `flex-col` tetapi tanpa
   `overflow-y-auto`. Isi setinggi ±943px terpotong di layar 600px, sehingga
   tombol "Keluar" yang berada paling bawah tidak pernah terlihat. Perbaikan:
   header sidebar dan footer (profil + "Keluar") dipatok `shrink-0`, sedangkan
   daftar nav dibungkus `.dashboard-sidebar-scroll` (`flex-1 overflow-y-auto
   min-h-0`) sehingga hanya daftar yang bergulir.
2. **Tablet/HP:** tombol "Keluar" memang **tidak pernah dirender** di bawah
   breakpoint `xl` — tidak ada drawer maupun menu akun. Perbaikan: avatar di
   header menjadi `<details>` berisi identitas, tautan Pengaturan/Tim, dan
   tombol "Keluar" (bukan lagi sekadar dekorasi).
3. **Bonus temuan saat uji:** `signOut({ callbackUrl: "/login" })` membuat Auth.js
   menyusun URL absolut dari sisi server sehingga logout mendarat di
   `http://localhost:3000/login`. Diganti `signOut({ redirect: false })` lalu
   `router.replace("/login")`, sehingga operator tetap di origin yang sedang
   dibuka.


Perbaikan data yang ikut dilakukan: `Customer` 40 baris (5 orang, masing-masing 8×)
dibersihkan menjadi 5 baris; nomor telepon seed yang sebelumnya bertopeng
(`+628****5678…`) diganti nomor valid sehingga deteksi duplikat benar-benar bekerja.

### 6.3 Urutan antrean, akses loket, dan cakupan layar (2026-10-21)

Empat keluhan pengguna dan cara masing-masing diselesaikan.

**1. Tiket selesai & dibatalkan menutupi antrean yang masih hidup.**
Urutan sekarang dipusatkan di modul baru `src/modules/queue/domain/queue-order.ts`
(`QUEUE_ATTENTION_RANK`: `SERVING` 0, `CALLED` 1, `WAITING` 2, `SKIPPED` 3,
`NO_SHOW` 4, `CANCELLED` 5, `COMPLETED` 6). Di dalam grup yang masih hidup urutan
tetap terlama-dulu (adil), di grup tiket selesai urutan dibalik menjadi
terbaru-dulu (riwayat terdekat lebih berguna). UI antrean juga dibuka pada filter
**"Aktif & menunggu"** (`LIVE`), sehingga tiket selesai/batal tidak pernah lagi
menempati baris teratas kecuali diminta.

Bukti browser (data nyata `2026-10-22`):

| Kondisi | Hasil |
|---|---|
| Buka dashboard (default `Aktif & menunggu`) | `UMUM-001` Dilayani, `GIGI-001` Dipanggil, `GIGI-002` Menunggu — **"Menampilkan 3 dari 3 antrean (total 5)"** |
| `LAB-001` di-`complete`, `UMUM-002` di-`cancel` lalu filter **Semua status** | Urutan tetap hidup dulu, tiket selesai/batal turun ke bawah: `UMUM-001` → `GIGI-001` → `GIGI-002` → `UMUM-002` (Dibatalkan) → `LAB-001` (Selesai) |

**2. Filter per loket.** Toolbar antrean punya `<select>` "Filter loket" berisi
`Semua loket`, `Belum ditugaskan`, dan tiap loket cabang. Bukti: `Belum ditugaskan`
→ 2 baris, `Loket 03` → 1 baris (`GIGI-001`), `Loket 01` → 1 baris (`UMUM-001`).

**3. Hak akses loket per pengguna.** Tabel join baru `CounterMember`
(`membershipId` + `counterId`), semantik **opt-out**: pengguna tanpa baris tidak
dibatasi, `OWNER`/`SUPER_ADMIN` selalu bebas, dan daftar kosong berarti "semua
loket" — sehingga akun yang sudah ada tetap bekerja setelah migrasi. Penegakannya
di lapisan layanan (`assertCounterAccess` → `403 COUNTER_FORBIDDEN`), bukan di UI,
jadi permintaan manual pun ditolak. Tiket `WAITING` yang belum punya loket
dianggap milik operator bila salah satu loketnya melayani layanan tiket tersebut
(`canOperateUnassigned`).

Bukti nyata `scripts/verify-counter-access.ts` (peran ADMIN dibatasi ke Loket 02):

```
transitionQueue(UMUM-001 milik Loket 01, action=complete) -> DITOLAK 403 COUNTER_FORBIDDEN
status tiket setelah ditolak -> SERVING => SERVING (harus sama)
callNext(Loket 01) -> DITOLAK 403 COUNTER_FORBIDDEN
callNext(Loket 02) -> loket dikenali, tidak ada nomor bebas (COUNTER_BUSY)
cleanup -> counterIds=[] (harus [])
COUNTER_ACCESS_OK
```

Temuan penting saat menulis uji itu: filter `...{ id: { in: context.counterIds } }`
yang digabung dengan `id: input.counterId` pada objek `where` yang sama saling
menimpa (urutan spread), sehingga `callNext` ke loket di luar wewenang justru
memproses loket lain. Pemeriksaan sekarang berdiri sendiri sebagai
`assertCounterAccess(context, counter.id)` — lihat komentar di `queue-service.ts`.

**4. Cakupan layar display + daftar menunggu.** Tabel `DisplayCounter` menentukan
layar menampilkan semua loket (tanpa baris) atau loket tertentu
(`assertCountersInBranch` memastikan loket berasal dari cabang layar itu).
Snapshot layar kini mengirim `scope` (`"branch"`/`"counter"`), `counterCount`,
daftar `queues` (hanya `CALLED`/`SERVING` di layar itu) dan daftar `waiting` berisi
`ahead` yang dihitung server. Komponen TV menyegarkan daftar menunggu lewat polling
15 detik (SSE hanya membawa peristiwa `queue.issued`/`queue.called`, bukan payload
daftar).

Bukti: badge header TV berubah `Semua loket` → `Loket terpilih · 1` setelah cakupan
diubah ke Loket 03 lewat tombol "Semua loket" pada kartu display; JSON publik
mengembalikan `scope: "counter"`, `counterCount: 1`, `queues` hanya `GIGI-001`
(Loket 03), dan `waiting` berisi `GIGI-002` dengan `ahead: 0`.

**5. UI saat data mulai banyak.** Pelanggan: `PAGE_SIZE = 20` dengan tombol
"Muat N pelanggan lagi" dan teks "Menampilkan X dari Y kontak". Tim: kotak cari
nama/email + editor akses loket per anggota + paginasi 10 anggota per muat. Loket:
kotak cari (nama, kode, atau layanan; muncul bila cabang punya lebih dari 3 loket)
+ paginasi 12 loket per muat. Antrean:
pembatas 8 baris dengan tombol "Lihat semua", filter loket, dan tombol muat ulang.
Semua dinilai ulang pada HP 390×844 — tidak ada elemen yang melewati lebar viewport
pada `#queue`, `#counters-manage`, `#team`, `#displays-manage`.

Uji beban data (dibuat lewat API, lalu dihapus kembali sehingga data klien tidak
berubah):

| Data uji | Sebelum interaksi | Setelah "Muat lagi" | Catatan |
|---|---|---|---|
| 19 loket (3 asli + 16 uji) | "Menampilkan 12 dari 19 loket" + tombol "Muat 7 loket lagi" | 19 kartu, teks berubah "Menampilkan 19 dari 19 loket" | saat dicari "Uji 1": "Menampilkan 10 dari 10 loket (total 19 di cabang ini)" dan hanya 10 kartu dirender |
| 12 anggota tim (3 asli + 9 uji) | "Menampilkan 10 dari 12 anggota" + "Muat 2 anggota lagi" | 12 anggota; cari "uji3" → "Menampilkan 1 dari 1 anggota (total 12)" | editor akses loket tetap bekerja pada anggota hasil pencarian |
| 39 pelanggan (14 asli + 25 uji) | "Menampilkan 20 dari 39 kontak" + "Muat 19 pelanggan lagi" | 39 kartu, "Menampilkan 39 dari 39 kontak", tombol hilang | pencarian "Pelanggan Uji 1" → "Menampilkan 37 dari 37 kontak (hasil pencarian …)" |

Setelah pengujian, semua data uji dihapus (`Counter`, `CounterMember`,
`DisplayCounter`, anggota uji, dan pelanggan uji) sehingga basis data kembali ke
3 loket / 3 anggota / 14 pelanggan dan tidak ada baris sisa.

Migrasi `20261021160000_counter_access_and_display_scope` bersifat aditif
(`CREATE TABLE` + FK `ON DELETE CASCADE`) dan sudah diterapkan ke basis data hidup.

### 6.4 Kebocoran panggilan antar loket lewat aliran SSE (2026-10-23)

Keluhan pengguna: *"loket 01 dengan layanan A, loket 02 dengan layanan B — pelanggan
layanan B di loket 02 ikut dipanggil/diumumkan di kedua loket, padahal layanan B
hanya ada di loket 02."*

**Akar masalah.** Snapshot layar (`getDisplaySnapshot`) sudah menyaring per cakupan
loket, sehingga tampilan awal benar. Yang bocor adalah **aliran peristiwa SSE**:
`getDisplayEvents` dan loop `publicDisplayStream` hanya menyaring `branchId`
(`queryDisplayEvents(display.branchId, cursor)`), tidak menyaring cakupan loket.
Akibatnya layar loket 01 tetap menerima `queue.called` loket 02 setelah halaman
termuat dan **memutar audio pengumumannya**. Bukan nomor tiket ganda: query
`Queue GROUP BY ticketNumber, serviceDate HAVING COUNT(*) > 1` mengembalikan 0 baris.

**Perbaikan.** Modul domain baru `src/modules/display/domain/display-scope.ts`
berisi `isEventVisibleOnDisplay(payload, counterIds)`:

- `counterIds` kosong → `true` (layar lobi memang menampilkan semua loket);
- peristiwa tanpa `counterId` → `true` (mis. `queue.issued` belum terikat loket;
  kalau diblokir, panel "Menunggu" layar ber-scope jadi basi sampai polling 15 detik,
  padahal snapshot-nya toh sudah tersaring);
- selain itu → `counterIds.includes(counterId)`.

`getDisplayEvents` memakai `display.counters` sebagai `counterIds`; loop SSE memakai
`scopedCounterIds = display.counters.map(r => r.counterId)`.

**Jebakan penting (cursor).** Di loop SSE, `cursor = event.id` **harus** maju untuk
setiap peristiwa, *sebelum* `continue` akibat filter. Kalau cursor tidak maju,
peristiwa yang tersaring dibaca ulang selamanya dan dapat menutupi peristiwa nyata.

**Bukti (dijalankan pada basis data hidup, umpan dikembalikan sesudahnya).**

`npx tsx scripts/verify-display-scope.ts` (lapisan layanan):

```
Loket diuji: 01 (Loket 01) vs 02 (Loket 02)
Umpan loket sendiri (harus lolos): UMUM-002 dipanggil di 01.
Umpan loket lain (harus diblokir): GIGI-006 dipanggil di 02.
Event diterima layar 01: 1
Event loket sendiri lolos: true
Event loket lain bocor: 0
PASS
```

`npx tsx scripts/verify-display-http.ts` (lewat HTTP, endpoint yang benar-benar
dipakai TV: `GET /api/v1/public/displays/<token>/events` — SSE, dibaca 6 detik lalu
koneksi ditutup):

```
GET /events -> HTTP 200, content-type=text/event-stream
Event SSE terbaca: 1
Event loket sendiri lolos via HTTP: true
Event loket lain bocor via HTTP: 0
GET /snapshot -> HTTP 200, scope=counter, counterCount=1, queues=1
Snapshot memuat antrean loket lain: 0
PASS
```

`tests/display-scope.test.ts` (4 uji regresi, ikut `npm test`): lobi tanpa cakupan
melihat semua; layar ber-cakupan hanya melihat loketnya; satu layar dengan beberapa
loket; peristiwa tanpa `counterId` tetap tampil.

**Bukti browser sebagai pengguna.** Layar TV dibuka di
`http://127.0.0.1:3000/display/<token>` dengan cakupan Loket 01, lalu:

| Aksi | Hasil di layar TV |
|---|---|
| Panggil tiket di **Loket 02** (loket lain) | Blok "NOMOR DIPANGGIL" tetap **"Belum ada panggilan"** — tidak diumumkan |
| Panggil tiket di **Loket 01** (loket sendiri) | Blok menampilkan `UMUM-002 → Loket 01` **dan** teks suara "Nomor antrean U M U M, nol nol dua, silakan menuju Loket 01." |

### 6.5 Satu layar = satu tautan (2026-10-23)

Pertanyaan pengguna: *"TV display itu hanya bisa 1 link ya? Misal ada 4 loket dengan
4 display."* Jawabannya: **tidak** — tiap baris `Display` punya token sendiri
(`Display.tokenHash`), dan halaman TV adalah `/display/<token>`. Yang kurang hanya
**kejelasan di UI**: tombol ganti tautan pada kartu layar tadinya ikon tanpa label,
sehingga tidak terlihat bahwa tiap layar punya tautannya sendiri. Sekarang tombol itu
berlabel **"Tautan baru"** dan keterangan bagian berbunyi "Tiap layar punya tautannya
sendiri, jadi tiap loket bisa punya layarnya masing-masing."

**Bukti.** `npx tsx scripts/verify-display-multi.ts` membuat 4 layar (satu per loket):

```
Loket aktif: 4 (01, 02, 03, 04)
Display dibuat: 4
Token unik: 4 dari 4
  01: HTTP 200, scope=counter, counterCount=1, antrean loket lain=0
  02: HTTP 200, scope=counter, counterCount=1, antrean loket lain=0
  03: HTTP 200, scope=counter, counterCount=1, antrean loket lain=0
  04: HTTP 200, scope=counter, counterCount=1, antrean loket lain=0
PASS: 4 loket -> 4 layar -> 4 tautan berbeda, masing-masing hanya menampilkan loketnya.
```

Layar uji dihapus setelah verifikasi; display operasional (`TV Loket 01`–`TV Loket 04`)
tidak berubah.

