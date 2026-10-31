import { z } from "zod";
import { errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { validationAppError } from "@/modules/shared/validation-error";
import { requireBusinessContext } from "@/modules/tenancy/context";
import { LOGO_MAX_LENGTH, TITLE_MAX_LENGTH } from "@/modules/tenancy/brand";
import { resetTheme, updateTheme } from "@/modules/tenancy/theme-service";

type RouteContext = { params: Promise<{ businessSlug: string }> };

/** Both handlers are Super Admin only; the role check lives in theme-service. */
const updateSchema = z
  .object({
    /** Judul aplikasi; null mengembalikannya ke nama bisnis. */
    title: z.string().max(TITLE_MAX_LENGTH).nullable().optional(),
    primaryColor: z
      .string()
      .trim()
      .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
      .optional(),
    secondaryColor: z
      .string()
      .trim()
      .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
      .optional(),
    /** `data:` URL from the settings form; null removes the current logo. */
    logo: z.string().startsWith("data:image/").max(LOGO_MAX_LENGTH + 64).nullable().optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.primaryColor !== undefined ||
      value.secondaryColor !== undefined ||
      value.logo !== undefined,
    "Tidak ada perubahan yang dikirim.",
  );

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const { businessSlug } = await params;
    const parsed = updateSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      throw validationAppError(parsed.error, "Periksa kembali pengaturan tampilan.", {
        title: "judul aplikasi",
        primaryColor: "warna utama",
        secondaryColor: "warna sekunder",
        logo: "logo",
      });
    }
    const context = await requireBusinessContext(businessSlug);
    return Response.json({ data: await updateTheme(context, parsed.data) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Restores the default colours and drops the logo. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { businessSlug } = await params;
    const context = await requireBusinessContext(businessSlug);
    return Response.json({ data: await resetTheme(context) });
  } catch (error) {
    return errorResponse(error);
  }
}
