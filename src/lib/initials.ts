/**
 * Inisial untuk avatar: dua kata pertama, tanpa spasi, maksimal dua huruf.
 * Dipakai sidebar, navbar dashboard, dan konsol platform supaya satu orang
 * tidak muncul dengan inisial berbeda di tiap halaman.
 */
export function initials(name: string) {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return letters || "?";
}
