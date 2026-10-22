import type { ZodError } from "zod";
import { AppError } from "@/modules/shared/errors";

export function validationAppError(
  error: ZodError,
  message: string,
  labels: Record<string, string> = {},
) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0]?.toString();
    if (!key || fields[key]) continue;
    const label =
      labels[key] ??
      key.replace(/([a-z])([A-Z])/g, "$1 $2").toLocaleLowerCase();
    fields[key] = `Periksa kembali ${label} — nilainya belum sesuai.`;
  }
  return new AppError(message, 400, "INVALID_INPUT", fields);
}
