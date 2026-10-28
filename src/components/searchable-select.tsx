"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useId, useMemo, useState } from "react";

export type SearchableOption = {
  value: string;
  label: string;
  description?: string;
};

export function SearchableSelect({
  value,
  options,
  onChange,
  ariaLabel,
  invalid = false,
  describedBy,
  className,
}: {
  value: string;
  options: SearchableOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  invalid?: boolean;
  describedBy?: string;
  className: string;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) =>
      `${option.label} ${option.description ?? ""}`
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [options, query]);

  if (options.length <= 5) {
    return (
      <select
        aria-label={ariaLabel}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        className={`${className} ${invalid ? "border-[#d98a80]" : ""}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
            {option.description ? ` · ${option.description}` : ""}
          </option>
        ))}
      </select>
    );
  }

  function choose(option: SearchableOption) {
    onChange(option.value);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#91a09a]" />
        <input
          role="combobox"
          aria-label={ariaLabel}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            open && filteredOptions[activeIndex]
              ? `${listboxId}-option-${activeIndex}`
              : undefined
          }
          autoComplete="off"
          value={open ? query : selected?.label ?? ""}
          placeholder="Cari dan pilih..."
          onFocus={() => {
            setQuery("");
            setActiveIndex(0);
            setOpen(true);
          }}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) =>
                Math.min(index + 1, filteredOptions.length - 1),
              );
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter" && open) {
              const option = filteredOptions[activeIndex];
              if (option) {
                event.preventDefault();
                choose(option);
              }
            } else if (event.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
          className={`${className} pl-10 pr-10 ${invalid ? "border-[#d98a80]" : ""}`}
        />
        <ChevronDown
          aria-hidden="true"
          className={`pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-[#91a09a] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </div>
      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-[#e1e8e4] bg-white p-1.5 shadow-[0_12px_32px_rgba(25,48,40,.14)]"
        >
          {filteredOptions.length ? (
            filteredOptions.map((option, index) => (
              <button
                id={`${listboxId}-option-${index}`}
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(option)}
                className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition ${
                  index === activeIndex
                    ? "bg-[#f1f7f4]"
                    : "hover:bg-[#f8faf9]"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[#344440]">
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="mt-0.5 block text-[11px] text-[#899591]">
                      {option.description}
                    </span>
                  )}
                </span>
                {option.value === value && (
                  <Check className="size-4 shrink-0 text-brand-700" />
                )}
              </button>
            ))
          ) : (
            <p className="px-3 py-5 text-center text-xs text-[#899591]">
              Tidak ada pilihan yang cocok.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
