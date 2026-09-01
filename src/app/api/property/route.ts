import { lookupProperty } from "@/lib/lookups/property";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const objectIdRaw = request.nextUrl.searchParams.get("objectId") ?? "";
  const objectId = Number.parseInt(objectIdRaw, 10);
  if (!Number.isFinite(objectId) || objectId <= 0) {
    return Response.json({ error: "A parcel objectId is required." }, { status: 400 });
  }

  const result = await lookupProperty(objectId);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  return Response.json({ parcel: result.parcel });
}
