import { AlertTriangle, CheckCircle2 } from "lucide-react";

export function InlineNotice({
  message,
  variant = "error",
  className = "",
}: {
  message: string;
  variant?: "error" | "success" | "warning";
  className?: string;
}) {
  const success = variant === "success";
  const warning = variant === "warning";
  const Icon = success ? CheckCircle2 : AlertTriangle;
  return (
    <div
      role={success || warning ? "status" : "alert"}
      className={`flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 text-xs leading-5 ${
        success
          ? "border-brand-200 bg-brand-50 text-brand-700"
          : warning
            ? "border-accent-300 bg-accent-100 text-accent-900"
            : "border-[#f2d9d5] bg-[#fff7f5] text-[#a5463d]"
      } ${className}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-xs leading-5 text-[#b4473d]">
      {message}
    </p>
  );
}
