import { z } from "zod";
import { AppError, errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { validationAppError } from "@/modules/shared/validation-error";
import { clientAddress, enforceRateLimit } from "@/modules/shared/rate-limit";
import {
  createPublicBooking,
  getAvailableBookingSlots,
  getBookingConfiguration,
  getPublicBookingStatus,
} from "@/modules/booking/application/booking-service";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { token } = await params;
    const url = new URL(request.url);
    if (url.searchParams.has("status")) {
      const data = await getPublicBookingStatus(token, request);
      return Response.json({ data }, { headers: { "Cache-Control": "no-store" } });
    }
    const serviceId = url.searchParams.get("serviceId");
    const date = url.searchParams.get("date");
    if (serviceId || date) {
      if (!serviceId || !date) {
        throw new AppError("Layanan dan tanggal wajib dipilih.", 400, "INVALID_INPUT");
      }
      const data = await getAvailableBookingSlots(token, request, serviceId, date);
      return Response.json({ data }, { headers: { "Cache-Control": "no-store" } });
    }
    const data = await getBookingConfiguration(token, request);
    return Response.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

const bookingSchema = z.object({
  serviceId: z.string().min(1).max(64),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z
    .string()
    .trim()
    .min(8)
    .max(24)
    .regex(/^[0-9+()\s.-]+$/)
    .refine((value) => {
      const digits = value.replace(/\D/g, "").length;
      return digits >= 8 && digits <= 15;
    }),
  customerEmail: z.email().max(254).optional(),
});

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { token } = await params;
    const parsed = bookingSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      throw validationAppError(parsed.error, "Periksa kembali data booking Anda.", {
        serviceId: "Layanan",
        date: "Tanggal kunjungan",
        time: "Waktu kunjungan",
        customerName: "Nama lengkap",
        customerPhone: "Nomor telepon",
        customerEmail: "Email",
      });
    }
    // Public booking form: same abuse surface as QR issuance (someone could
    // reserve every slot), so throttle per IP before creating anything.
    await enforceRateLimit(`booking:${token}:${clientAddress(request)}`, 10, 60);
    const data = await createPublicBooking(token, request, parsed.data);
    return Response.json(
      {
        data: {
          ...data,
          statusUrl: `/book/status/${data.statusToken}`,
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
