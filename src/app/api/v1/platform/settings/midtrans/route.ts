import { z } from "zod";
import { requirePlatformAdmin } from "@/modules/platform/access";
import {
  midtransServerKeyStatus,
  readMidtransEnabled,
  readMidtransMode,
  removeMidtransServerKey,
  saveMidtransEnabled,
  saveMidtransMode,
  saveMidtransServerKey,
} from "@/modules/billing/midtrans-settings";
import { AppError, errorResponse, readJsonRequest } from "@/modules/shared/errors";

const inputSchema = z
  .object({
    /** Mode yang dituju untuk `serverKey`, atau mode yang akan diaktifkan. */
    mode: z.enum(["sandbox", "production"]).optional(),
    serverKey: z.string().trim().min(1).max(300).optional(),
    enabled: z.boolean().optional(),
    removeKey: z.enum(["sandbox", "production"]).optional(),
  })
  .refine(
    (value) => Boolean(value.serverKey || value.mode || value.removeKey || typeof value.enabled === "boolean"),
    "Tidak ada perubahan yang dikirim.",
  );

/** Satu payload mengembalikan seluruh keadaan Midtrans supaya UI tak perlu menebak. */
async function midtransState() {
  const mode = await readMidtransMode();
  const [enabled, sandbox, production] = await Promise.all([
    readMidtransEnabled(),
    midtransServerKeyStatus("sandbox"),
    midtransServerKeyStatus("production"),
  ]);
  return { mode, enabled, keys: { sandbox, production } };
}

export async function GET() {
  try {
    await requirePlatformAdmin();
    return Response.json({ data: await midtransState() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requirePlatformAdmin();
    const parsed = inputSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) throw new AppError("Perubahan Midtrans tidak valid.", 400, "INVALID_INPUT");
    const body = parsed.data;

    if (body.serverKey) {
      // Kunci wajib cocok dengan lingkungan tujuannya, jadi mode bisa ikut dikirim
      // sekaligus (menyiapkan kunci production tanpa harus mengaktifkannya dulu).
      await saveMidtransServerKey(body.serverKey, body.mode ?? (await readMidtransMode()));
    }

    if (body.removeKey) {
      const activeMode = await readMidtransMode();
      if (body.removeKey === activeMode && (await readMidtransEnabled())) {
        throw new AppError(
          `Kunci ${body.removeKey} sedang dipakai. Nonaktifkan pembayaran online atau pindah mode sebelum menghapusnya.`,
          409,
          "MIDTRANS_KEY_IN_USE",
        );
      }
      await removeMidtransServerKey(body.removeKey);
    }

    if (body.mode) {
      const status = await midtransServerKeyStatus(body.mode);
      if (!status.configured) {
        throw new AppError(
          status.unreadable
            ? `Kunci ${body.mode} tersimpan tetapi tidak dapat dibuka. Simpan ulang kuncinya sebelum memakai mode ini.`
            : `Mode ${body.mode} memerlukan Server Key ${body.mode === "sandbox" ? "sandbox (SB-Mid-server-)" : "production (Mid-server-)"}. Simpan kunci tersebut lebih dulu.`,
          400,
          "MIDTRANS_KEY_REQUIRED",
        );
      }
      await saveMidtransMode(body.mode);
    }

    if (typeof body.enabled === "boolean") {
      if (body.enabled) {
        const mode = await readMidtransMode();
        const status = await midtransServerKeyStatus(mode);
        if (!status.configured) {
          throw new AppError(
            "Pembayaran online belum bisa diaktifkan karena Server Key untuk mode aktif belum ada.",
            400,
            "MIDTRANS_KEY_REQUIRED",
          );
        }
      }
      await saveMidtransEnabled(body.enabled);
    }

    return Response.json({ data: await midtransState() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
