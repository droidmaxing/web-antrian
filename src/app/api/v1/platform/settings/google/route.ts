import { requirePlatformAdmin } from "@/modules/platform/access";
import {
  googleApiKeyStatus,
  saveGoogleApiKey,
  removeGoogleApiKey,
  setGoogleApiKeyEnabled,
  GoogleApiKeyInput,
  GoogleApiKeyToggleInput,
} from "@/modules/billing/google-settings";
import { AppError, errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { validationAppError } from "@/modules/shared/validation-error";

export async function GET() {
  try {
    await requirePlatformAdmin();
    return Response.json({ data: await googleApiKeyStatus() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requirePlatformAdmin();
    const json = await readJsonRequest(request);

    if (typeof json === "object" && json !== null && "enabled" in json && !("apiKey" in json)) {
      const toggle = GoogleApiKeyToggleInput.safeParse(json);
      if (!toggle.success) throw new AppError("Nilai aktif/nonaktif tidak valid.", 400, "INVALID_INPUT");
      return Response.json({ data: await setGoogleApiKeyEnabled(toggle.data.enabled) }, { headers: { "Cache-Control": "no-store" } });
    }

    const parsed = GoogleApiKeyInput.safeParse(json);
    if (!parsed.success) {
      throw validationAppError(parsed.error, "Periksa kembali Google API key.", { apiKey: "API key" });
    }
    return Response.json({ data: await saveGoogleApiKey(parsed.data.apiKey) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    await requirePlatformAdmin();
    return Response.json({ data: await removeGoogleApiKey() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
