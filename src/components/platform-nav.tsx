"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CreditCard, KeyRound, LayoutDashboard, Package, ReceiptText, Users2 } from "lucide-react";

const LINKS = [
  { href: "/platform", label: "Ringkasan", icon: LayoutDashboard },
  { href: "/platform/perusahaan", label: "Perusahaan", icon: Building2 },
  { href: "/platform/paket", label: "Paket", icon: Package },
  { href: "/platform/langganan", label: "Langganan", icon: CreditCard },
  { href: "/platform/pembayaran", label: "Pembayaran", icon: ReceiptText },
  { href: "/platform/pengguna", label: "Pengguna", icon: Users2 },
  { href: "/platform/integrasi", label: "Integrasi", icon: KeyRound },
];

/** Satu fitur satu halaman: navigasi ini satu-satunya jalan pindah antar bagian. */
export function PlatformNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Menu konsol platform"
      className="flex gap-1.5 overflow-x-auto bubble-card p-2 md:sticky md:top-20 md:w-56 md:shrink-0 md:flex-col md:self-start"
    >
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${
              active ? "bg-brand-50 text-brand-700" : "text-[#52615b] hover:bg-brand-50"
            }`}
          >
            <link.icon className="size-3.5" aria-hidden />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
