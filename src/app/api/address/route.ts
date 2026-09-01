import { searchParcels } from "@/lib/lookups/fbcad";
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

  return Response.json({ candidates: result.candidates });
}
