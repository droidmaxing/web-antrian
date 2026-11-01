import { compare } from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { changePasswordSchema, hashPassword } from "@/modules/shared/password";
import { enforceRateLimit } from "@/modules/shared/rate-limit";
import { validationAppError } from "@/modules/shared/validation-error";

/**
 * Ganti sandi akun yang sedang masuk. Sandi lama wajib benar supaya sesi yang
 * ditinggalkan di komputer bersama tidak bisa dipakai orang lain untuk mengambil
 * alih akun.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new AppError("Masuk terlebih dahulu untuk mengganti kata sandi.", 401, "UNAUTHENTICATED");
    }
    await enforceRateLimit(`password:${session.user.id}`, 5, 15 * 60);

    const parsed = changePasswordSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      throw validationAppError(parsed.error, "Periksa kembali kata sandi Anda.", {
        currentPassword: "Kata sandi saat ini",
        newPassword: "Kata sandi baru",
      });
    }
    const { currentPassword, newPassword } = parsed.data;
    if (currentPassword === newPassword) {
      throw new AppError("Kata sandi baru harus berbeda dari kata sandi saat ini.", 400, "PASSWORD_UNCHANGED");
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true },
    });
    if (!user?.passwordHash) {
      throw new AppError(
        "Akun ini masuk lewat Google dan belum punya kata sandi. Gunakan pemulihan sandi untuk membuatnya.",
        400,
        "PASSWORD_NOT_SET",
      );
    }
    if (!(await compare(currentPassword, user.passwordHash))) {
      throw new AppError("Kata sandi saat ini tidak sesuai.", 400, "INVALID_CURRENT_PASSWORD");
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });

    // ponytail: sesi JWT yang sedang aktif tidak bisa dicabut dari server; sandi
    // baru berlaku untuk login berikutnya. Naikkan ke sesi database bila nanti
    // logout massal setelah ganti sandi memang dibutuhkan.
    return Response.json({ data: { updated: true } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
