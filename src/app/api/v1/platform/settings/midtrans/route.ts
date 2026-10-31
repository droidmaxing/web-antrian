import { z } from "zod";
import { requirePlatformAdmin } from "@/modules/platform/access";
import { midtransServerKeyStatus, removeMidtransServerKey, saveMidtransServerKey, validateSandboxServerKey, readMidtransMode, saveMidtransMode } from "@/modules/billing/midtrans-settings";
import { AppError, errorResponse, readJsonRequest } from "@/modules/shared/errors";

const inputSchema = z.object({
  serverKey: z.string().trim().refine(validateSandboxServerKey, "Masukkan Server Key sandbox Midtrans (diawali SB-Mid-server-)."),
});

const modeSchema = z.object({
  mode: z.enum(["sandbox", "production"]),
});

export async function GET() {
  try {
    await requirePlatformAdmin();
    const [keyStatus, mode] = await Promise.all([midtransServerKeyStatus(), readMidtransMode()]);
    return Response.json({ data: { keyStatus, mode } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requirePlatformAdmin();
    const body = await readJsonRequest(request);
    
    // Mode toggle
    if (typeof body === "object" && body !== null && "mode" in body && !("serverKey" in body)) {
      const parsed = modeSchema.safeParse(body);
      if (!parsed.success) throw new AppError("Mode harus 'sandbox' atau 'production'.", 400, "INVALID_INPUT");
      
      // Validate serverKey exists before allowing production mode
      if (parsed.data.mode === "production") {
        const status = await midtransServerKeyStatus();
        if (!status.configured) {
          throw new AppError(
            "Mode production memerlukan Server Key yang valid. Silakan atur Server Key terlebih dahulu.",
            400,
            "MIDTRANS_KEY_REQUIRED"
          );
        }
      }
      
      const mode = await saveMidtransMode(parsed.data.mode);
      return Response.json({ data: { mode } }, { headers: { "Cache-Control": "no-store" } });
    }
    
    // Server key
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) throw new AppError("Masukkan Server Key sandbox yang valid.", 400, "INVALID_INPUT");
    const keyStatus = await saveMidtransServerKey(parsed.data.serverKey);
    return Response.json({ data: { keyStatus } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    await requirePlatformAdmin();
    return Response.json({ data: await removeMidtransServerKey() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
