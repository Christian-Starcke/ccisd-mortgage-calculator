import { searchParcels } from "@/lib/lookups/parcelSearch";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 4) {
    return Response.json(
      { error: "Type at least a house number and street name." },
      { status: 400 },
    );
  }

  const result = await searchParcels(query);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  // `partial` is set when one of the two appraisal districts answered and the
  // other did not. The results are still worth showing; the caller says so.
  return Response.json({
    candidates: result.candidates,
    partial: result.partial,
  });
}
