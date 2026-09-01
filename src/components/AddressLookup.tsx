"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_MUD_UTILITY_MONTHLY,
  type CalculatorState,
  type UpdateState,
} from "@/lib/defaults";
import { formatUSD } from "@/lib/money";
import type { AddressCandidate, ResolvedParcel } from "@/lib/lookups/types";
import { Badge, Callout, Field, TextInput } from "./ui";

function applyParcel(parcel: ResolvedParcel, update: UpdateState, state: CalculatorState) {
  update("resolvedParcel", parcel);
  update("lookupStatus", parcel.isFortBendIsd ? "resolved" : "outside-fbisd");
  update("lookupError", null);
  update("addressQuery", parcel.situs);
  update("locationId", parcel.inferredLocationId);
  update("usdaAddressConfirmed", parcel.usdaEligible);

  if (parcel.totalValue && parcel.totalValue > 0) {
    update("taxAppraisedValueOverride", parcel.totalValue);
  }

  if (parcel.flood) {
    update("inFloodZone", parcel.flood.inSpecialFloodHazardArea);
    if (parcel.flood.inSpecialFloodHazardArea && state.annualFloodInsurance === 0) {
      update("annualFloodInsurance", 1_200);
    }
  }

  if (parcel.hasMud && state.monthlyMudUtility === 0) {
    update("monthlyMudUtility", DEFAULT_MUD_UTILITY_MONTHLY);
  }

  const year = new Date().getFullYear();
  if (
    (parcel.yearBuilt != null && parcel.yearBuilt >= year - 1) ||
    (parcel.improvementValue === 0 && (parcel.landValue ?? 0) > 0)
  ) {
    update("isNewConstruction", true);
  }
}

export function AddressLookup({
  state,
  update,
}: {
  state: CalculatorState;
  update: UpdateState;
}) {
  const [candidates, setCandidates] = useState<AddressCandidate[]>([]);
  const requestId = useRef(0);

  useEffect(() => {
    const query = state.addressQuery.trim();
    if (state.resolvedParcel && query === state.resolvedParcel.situs) return;
    if (query.length < 4) {
      requestId.current += 1;
      return;
    }

    const handle = window.setTimeout(async () => {
      const id = ++requestId.current;
      update("lookupStatus", "searching");
      update("lookupError", null);
      try {
        const response = await fetch(
          `/api/address?q=${encodeURIComponent(query)}`,
        );
        const body = (await response.json()) as {
          candidates?: AddressCandidate[];
          error?: string;
        };
        if (id !== requestId.current) return;
        if (!response.ok) {
          update("lookupStatus", "error");
          update("lookupError", body.error ?? "Address search failed.");
          return;
        }
        setCandidates(body.candidates ?? []);
        update("lookupStatus", "awaiting-pick");
      } catch {
        if (id !== requestId.current) return;
        update("lookupStatus", "error");
        update("lookupError", "Address search failed.");
      }
    }, 400);

    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- search only when the typed query changes
  }, [state.addressQuery, state.resolvedParcel]);

  const pick = async (candidate: AddressCandidate) => {
    update("lookupStatus", "looking-up");
    update("lookupError", null);
    try {
      const response = await fetch(
        `/api/property?objectId=${candidate.objectId}`,
      );
      const body = (await response.json()) as {
        parcel?: ResolvedParcel;
        error?: string;
      };
      if (!response.ok || !body.parcel) {
        update("lookupStatus", "error");
        update("lookupError", body.error ?? "Parcel lookup failed.");
        return;
      }
      applyParcel(body.parcel, update, state);
      setCandidates([]);
    } catch {
      update("lookupStatus", "error");
      update("lookupError", "Parcel lookup failed.");
    }
  };

  const clear = () => {
    update("resolvedParcel", null);
    update("lookupStatus", "idle");
    update("lookupError", null);
    update("usdaAddressConfirmed", null);
    setCandidates([]);
  };

  const parcel = state.resolvedParcel;

  return (
    <div className="space-y-3">
      <Field
        label="Street address"
        htmlFor="address"
        hint="Type the listing address. I will search Fort Bend CAD and you pick the matching parcel — I will not guess."
      >
        <TextInput
          id="address"
          value={state.addressQuery}
          placeholder="1234 Example Ln, Rosharon TX"
          autoComplete="street-address"
          onChange={(value) => {
            update("addressQuery", value);
            setCandidates([]);
            if (state.resolvedParcel) {
              update("resolvedParcel", null);
              update("lookupStatus", "idle");
            }
          }}
        />
      </Field>

      {state.lookupStatus === "searching" && (
        <p className="text-xs text-ink-500">Searching Fort Bend CAD…</p>
      )}
      {state.lookupStatus === "looking-up" && (
        <p className="text-xs text-ink-500">
          Pulling tax units, USDA eligibility and flood zone…
        </p>
      )}
      {state.lookupError && (
        <Callout tone="warn" title="Address lookup failed">
          {state.lookupError} Use the location and MUD pickers below as a
          fallback.
        </Callout>
      )}

      {state.lookupStatus === "awaiting-pick" && candidates.length === 0 && (
        <Callout tone="warn" title="No matching Fort Bend parcels">
          Try the house number plus the street name, without the city. FBCAD
          often stores a different city than the mailing address.
        </Callout>
      )}

      {candidates.length > 0 && state.lookupStatus === "awaiting-pick" && (
        <div className="space-y-2 rounded-lg border border-ink-200 bg-white p-2">
          <p className="px-2 pt-1 text-xs font-medium uppercase tracking-wide text-ink-500">
            Pick the matching parcel
          </p>
          {candidates.map((candidate) => (
            <button
              key={candidate.objectId}
              type="button"
              onClick={() => void pick(candidate)}
              className="flex min-h-11 w-full flex-col justify-center rounded-md px-3 py-2.5 text-left text-sm hover:bg-brand-50"
            >
              <span className="font-medium text-ink-900">{candidate.situs}</span>
              <span className="text-xs text-ink-500">
                {candidate.totalValue
                  ? `Appraised ${formatUSD(candidate.totalValue, 0)}`
                  : "No appraised value"}
                {candidate.yearBuilt ? ` · built ${candidate.yearBuilt}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}

      {parcel && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 break-words text-sm font-medium text-ink-800">
              {parcel.situs}
            </p>
            <button
              type="button"
              onClick={clear}
              className="-mx-2 inline-flex min-h-11 items-center px-2 text-sm font-medium text-ink-500 underline underline-offset-2"
            >
              Change address
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {parcel.isFortBendIsd ? (
              <Badge tone="good">Fort Bend ISD</Badge>
            ) : (
              <Badge tone="bad">
                {parcel.schoolName ?? "Not Fort Bend ISD"}
              </Badge>
            )}
            {parcel.usdaEligible === true && (
              <Badge tone="good">USDA eligible</Badge>
            )}
            {parcel.usdaEligible === false && (
              <Badge tone="neutral">Not USDA</Badge>
            )}
            {parcel.flood?.inSpecialFloodHazardArea && (
              <Badge tone="warn">
                Flood zone {parcel.flood.zone ?? "SFHA"}
              </Badge>
            )}
            {parcel.hasMud && <Badge tone="neutral">Utility district</Badge>}
          </div>

          {!parcel.isFortBendIsd && (
            <Callout tone="bad" title="This address is not in Fort Bend ISD">
              The parcel is billed by {parcel.schoolName ?? "another school district"}
              {parcel.schoolCode ? ` (${parcel.schoolCode})` : ""}. This
              calculator is built for Fort Bend ISD tax rates and assistance
              geography. Confirm the district on the{" "}
              <a
                href="https://www.fortbendisd.com/interactivemap"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                Fort Bend ISD attendance map
              </a>{" "}
              before you trust any number here.
            </Callout>
          )}

          {parcel.sellerExemptions && (
            <Callout tone="warn" title="The exemptions on this record belong to the seller">
              The CAD shows {parcel.sellerExemptions}. Homestead resets on sale,
              so I am ignoring those and using your own homestead filing instead.
            </Callout>
          )}

          {parcel.totalValue != null &&
            state.purchasePrice > 0 &&
            Math.abs(parcel.totalValue - state.purchasePrice) /
              state.purchasePrice >
              0.15 && (
              <Callout tone="warn" title="Appraised value and listing price diverge">
                CAD has this parcel at {formatUSD(parcel.totalValue, 0)} against
                a listing price of {formatUSD(state.purchasePrice, 0)}. Tax is
                estimated from the appraised value; the loan is sized from the
                price. New construction is often assessed on an unimproved lot
                the first year.
              </Callout>
            )}

          {parcel.missingRateCodes.length > 0 && (
            <Callout tone="warn" title="Some districts are not on the county rate roll">
              {parcel.missingRateCodes.join(", ")} {parcel.missingRateCodes.length === 1 ? "is" : "are"} billed by a private collector. Enter {parcel.missingRateCodes.length === 1 ? "its" : "their"} rate below rather than treating {parcel.missingRateCodes.length === 1 ? "it" : "them"} as zero.
            </Callout>
          )}
        </div>
      )}
    </div>
  );
}
