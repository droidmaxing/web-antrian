/**
 * Shape of the JSON body produced by `errorResponse` / `validationAppError`.
 * Kept separate from the server module so client components never import
 * `node:` built-ins through a type-only path.
 */
export type ApiErrorBody = {
  code: string;
  message: string;
  fields?: Record<string, string>;
};

/**
 * Reads a failed response into a single object the UI can act on: one message
 * for the banner plus optional per-field messages so the user can see which
 * input is wrong instead of guessing.
 */
export async function readApiError(response: Response): Promise<ApiErrorBody> {
  try {
    const body = (await response.json()) as { error?: ApiErrorBody };
    if (body?.error?.message) {
      return body.error;
    }
  } catch {
    // Non-JSON body (proxy error, HTML 502, aborted request).
  }
  if (response.status === 401) {
    return { code: "UNAUTHENTICATED", message: "Sesi Anda berakhir. Silakan masuk kembali." };
  }
  if (response.status === 403) {
    return { code: "FORBIDDEN", message: "Anda tidak memiliki izin untuk tindakan ini." };
  }
  if (response.status === 429) {
    return { code: "RATE_LIMITED", message: "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi." };
  }
  if (response.status >= 500) {
    return { code: "INTERNAL_ERROR", message: "Server sedang bermasalah. Coba lagi beberapa saat lagi." };
  }
  return { code: "REQUEST_FAILED", message: `Permintaan gagal (${response.status}).` };
}
