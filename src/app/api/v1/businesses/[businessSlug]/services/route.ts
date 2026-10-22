import { z } from "zod";
import { errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { validationAppError } from "@/modules/shared/validation-error";
import { requireBusinessContext } from "@/modules/tenancy/context";
import {
  createService,
  listServices,
} from "@/modules/catalog/catalog-service";

type RouteContext = { params: Promise<{ businessSlug: string }> };

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z
    .string()
    .trim()
    .min(1)
    .max(8)
    .regex(/^[A-Z0-9]+$/, "Kode hanya boleh huruf kapital dan angka."),
  description: z.string().trim().max(500).optional().nullable(),
  averageMinutes: z.coerce.number().int().min(1).max(240).default(10),
  active: z.boolean().optional(),
});

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { businessSlug } = await params;
    const context = await requireBusinessContext(businessSlug);
    const services = await listServices(context);
    return Response.json({ data: services }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { businessSlug } = await params;
    const parsed = createSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      throw validationAppError(parsed.error, "Periksa kembali data layanan.", {
        name: "Nama layanan",
        code: "Kode layanan",
        averageMinutes: "Estimasi durasi",
      });
    }
    const context = await requireBusinessContext(businessSlug);
    const service = await createService(context, parsed.data);
    return Response.json({ data: service }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
