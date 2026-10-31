import { requirePlatformAdmin } from "@/modules/platform/access";
import {
  GoogleLoginInput,
  GoogleLoginToggleInput,
  googleLoginStatus,
  removeGoogleLoginCredentials,
  saveGoogleLoginCredentials,
  setGoogleLoginEnabled,
} from "@/modules/platform/google-login";
import { AppError, errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { validationAppError } from "@/modules/shared/validation-error";

/**
 * Kredensial "Masuk dengan Google" tingkat platform (konsol Master Admin):
 * GET status, PUT simpan kredensial atau `{ enabled }`, DELETE hapus.
 */
export async function GET() {
  try {
    await requirePlatformAdmin();
    return Response.json({ data: await googleLoginStatus() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requirePlatformAdmin();
    const json = await readJsonRequest(request);

    if (typeof json === "object" && json !== null && "enabled" in json && !("clientId" in json)) {
      const toggle = GoogleLoginToggleInput.safeParse(json);
      if (!toggle.success) throw new AppError("Nilai aktif/nonaktif tidak valid.", 400, "INVALID_INPUT");
      if (toggle.data.enabled && !(await googleLoginStatus()).configured) {
        throw new AppError("Isi Client ID dan Client Secret terlebih dahulu.", 400, "GOOGLE_LOGIN_UNCONFIGURED");
      }
      return Response.json({ data: await setGoogleLoginEnabled(toggle.data.enabled) }, { headers: { "Cache-Control": "no-store" } });
    }

    const parsed = GoogleLoginInput.safeParse(json);
    if (!parsed.success) throw validationAppError(parsed.error, "Periksa kembali kredensial Google.", {
      clientId: "Client ID",
      clientSecret: "Client Secret",
    });
    return Response.json(
      { data: await saveGoogleLoginCredentials(parsed.data.clientId, parsed.data.clientSecret) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    await requirePlatformAdmin();
    return Response.json({ data: await removeGoogleLoginCredentials() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
