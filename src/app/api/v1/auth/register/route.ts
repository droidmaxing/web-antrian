import { registrationSchema, registerAccount } from "@/modules/tenancy/registration-service";
import { clientAddress, enforceRateLimit } from "@/modules/shared/rate-limit";
import { errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { validationAppError } from "@/modules/shared/validation-error";

export async function POST(request: Request) {
  try {
    await enforceRateLimit(`register:${clientAddress(request)}`, 5, 60 * 60);
    const parsed = registrationSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      throw validationAppError(parsed.error, "Periksa kembali data pendaftaran.", {
        name: "Nama lengkap", companyName: "Nama bisnis", email: "Email", password: "Kata sandi",
      });
    }
    const data = await registerAccount(parsed.data);
    return Response.json({ data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
