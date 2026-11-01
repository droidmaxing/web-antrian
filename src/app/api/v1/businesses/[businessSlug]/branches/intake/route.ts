import { z } from "zod";
import { errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { validationAppError } from "@/modules/shared/validation-error";
import { requireBusinessContext } from "@/modules/tenancy/context";
import { setBranchIntake } from "@/modules/tenancy/branch-service";

type RouteContext = { params: Promise<{ businessSlug: string }> };

const intakeSchema = z.object({
  branchId: z.string().min(1),
  mode: z.enum(["AUTO", "OPEN", "CLOSED"]),
});

/** Buka/tutup pengambilan nomor di lokasi. Semua peran boleh memakainya. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { businessSlug } = await params;
    const parsed = intakeSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      throw validationAppError(parsed.error, "Periksa kembali mode buka/tutup.", {
        branchId: "Cabang",
        mode: "Mode",
      });
    }
    const context = await requireBusinessContext(businessSlug, parsed.data.branchId);
    const branch = await setBranchIntake(context, parsed.data.branchId, parsed.data.mode);
    return Response.json({ data: branch });
  } catch (error) {
    return errorResponse(error);
  }
}
