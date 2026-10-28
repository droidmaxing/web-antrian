"use client";

import { useState } from "react";
import { PAGE_SIZES, paginate } from "@/modules/shared/pagination";

/**
 * State halaman untuk daftar yang sudah dimuat penuh di klien. `rows` bernilai
 * null selama daftar belum termuat, supaya loading tetap dibedakan dari kosong.
 */
export function usePaged<T>(items: readonly T[] | null) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const result = paginate(items ?? [], pageSize, page);
  return {
    page: result.page,
    pageCount: result.pageCount,
    pageSize: result.pageSize,
    total: items?.length ?? 0,
    rows: items ? result.rows : null,
    setPage,
    setPageSize,
  };
}

/**
 * Kontrol halaman + pemilih jumlah baris (10/50/100) yang dipakai ulang di
 * daftar mana pun. Paginasi sisi klien: daftar yang sudah dimuat tidak dirender
 * seluruhnya sekaligus.
 */
export function Pager({
  total,
  page,
  pageCount,
  pageSize,
  unit,
  onPage,
  onPageSize,
}: {
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  unit: string;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
}) {
  if (total === 0) return null;
  const firstRow = (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eff2f0] pt-3">
      <p className="text-[10px] text-[#a1aca8]">
        Menampilkan {firstRow}–{lastRow} dari {total} {unit}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[10px] text-[#7d8a85]">
          Tampil
          <select
            value={pageSize}
            onChange={(event) => {
              onPageSize(Number(event.target.value));
              onPage(1);
            }}
            aria-label={`Jumlah ${unit} per halaman`}
            className="h-8 rounded-lg border border-[#e0e6e3] bg-white px-2 text-[11px] text-[#41524c] outline-none focus:border-[#78b6a4]"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          per halaman
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="h-8 rounded-lg border border-[#e0e6e3] px-2.5 text-[11px] font-medium text-[#41524c] hover:bg-[#f6f9f7] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Sebelumnya
          </button>
          <span className="text-[11px] font-semibold text-[#41524c]">
            Halaman {page} dari {pageCount}
          </span>
          <button
            type="button"
            onClick={() => onPage(Math.min(pageCount, page + 1))}
            disabled={page >= pageCount}
            className="h-8 rounded-lg border border-[#e0e6e3] px-2.5 text-[11px] font-medium text-[#41524c] hover:bg-[#f6f9f7] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Berikutnya
          </button>
        </div>
      </div>
    </div>
  );
}
