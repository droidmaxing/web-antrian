"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Pager, usePaged } from "@/components/pagination";
import { PlatformBusinessStatus } from "@/components/platform-business-status";
import { Pill, TD, TH, type Tone } from "@/components/platform-ui";

export type PlatformCell = {
  text: string;
  sub?: string;
  tone?: Tone;
  mono?: boolean;
  strong?: boolean;
  muted?: boolean;
};

export type PlatformRow = {
  id: string;
  cells: PlatformCell[];
  /** Diisi hanya untuk baris yang statusnya bisa diubah (suspend/aktifkan). */
  action?: { businessId: string; active: boolean };
};

/** Daftar pendek tidak perlu kotak cari; paginasi tetap aktif. */
const SEARCH_FROM = 10;

/**
 * Tabel konsol: pencarian teks, paginasi klien (10/50/100), dan kolom status
 * yang bisa diubah. Semua halaman daftar memakai komponen ini supaya perilaku
 * tiap fitur seragam.
 */
export function PlatformTable({
  columns,
  rows,
  unit,
  empty,
  minWidth = 720,
}: {
  columns: string[];
  rows: PlatformRow[];
  unit: string;
  empty: string;
  minWidth?: number;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      row.cells.some((cell) => `${cell.text} ${cell.sub ?? ""}`.toLowerCase().includes(needle)),
    );
  }, [rows, query]);
  const paged = usePaged(filtered);
  const hasAction = rows.some((row) => row.action);
  const columnCount = columns.length + (hasAction ? 1 : 0);

  return (
    <div className="grid gap-3">
      {rows.length >= SEARCH_FROM && (
        <label className="relative block max-w-xs">
          <span className="sr-only">Cari {unit}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#5d6b67]" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Cari ${unit}…`}
            className="h-9 w-full rounded-lg bubble-field bg-white pl-9 pr-3 text-xs text-[#344440] outline-none"
          />
        </label>
      )}

      <div className="overflow-x-auto">
        <table className="w-full" style={{ minWidth }}>
          <thead className="border-b border-brand-100">
            <tr>
              {columns.map((column) => (
                <th key={column} className={TH} scope="col">
                  {column}
                </th>
              ))}
              {hasAction && (
                <th className={TH} scope="col">
                  Aksi
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td className={TD} colSpan={columnCount}>
                  {rows.length === 0 ? empty : `Tidak ada ${unit} yang cocok dengan pencarian.`}
                </td>
              </tr>
            )}
            {paged.rows?.map((row) => (
              <tr key={row.id} className="border-b border-[#f4f6f5] last:border-0">
                {row.cells.map((cell, index) => (
                  <td key={columns[index] ?? index} className={cell.mono ? `${TD} font-mono text-[11px] text-[#687570]` : TD}>
                    {cell.tone ? (
                      <Pill label={cell.text} tone={cell.tone} />
                    ) : (
                      <span className={cell.strong ? "font-semibold text-[#182321]" : cell.muted ? "text-[#606765]" : undefined}>{cell.text}</span>
                    )}
                    {cell.sub && <span className="mt-0.5 block text-[11px] text-[#606765]">{cell.sub}</span>}
                  </td>
                ))}
                {hasAction && (
                  <td className={TD}>
                    {row.action && <PlatformBusinessStatus businessId={row.action.businessId} active={row.action.active} />}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pager
        total={paged.total}
        page={paged.page}
        pageCount={paged.pageCount}
        pageSize={paged.pageSize}
        unit={unit}
        onPage={paged.setPage}
        onPageSize={paged.setPageSize}
      />
    </div>
  );
}
