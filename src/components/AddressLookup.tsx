"use client";

import { useEffect, useRef, useState } from "react";
import { findLocationPreset } from "@/data/clearCreekTaxRates";
import {
  DEFAULT_MUD_UTILITY_MONTHLY,
  type CalculatorState,
  type UpdateState,
} from "@/lib/defaults";
import { formatUSD } from "@/lib/money";
import {
  encodeParcelRef,
  type AddressCandidate,
  type ResolvedParcel,
} from "@/lib/lookups/types";
import {
  assessWindExposure,
  HOMEOWNERS_RATE_PER_THOUSAND,
} from "@/lib/windstorm";
import { Badge, Callout, Field, TextInput } from "./ui";

const CCISD_MAP_URL = "https://www.ccisd.net/district-map";

function countyLabel(county: "harris" | "galveston"): string {
  return county === "harris" ? "Harris County" : "Galveston County";
}

function clearParcelSelection(update: UpdateState, locationId: string) {
  update("resolvedParcel", null);
  update("lookupStatus", "idle");
  update("lookupError", null);
  update("usdaAddressConfirmed", null);
  update("taxAppraisedValueOverride", null);
  update("monthlyMudUtility", 0);
  update("unknownRateOverrides", {});
  update("inFloodZone", false);
  update("annualFloodInsurance", 0);
  update("isNewConstruction", false);

  // Wind exposure came from the parcel, so it has to go back to whatever the
  // location preset implies. Leaving a League City windstorm premium attached
  // to the next address the buyer types would be worse than having none.
  const preset = findLocationPreset(locationId);
  update("separateWindstormPolicy", preset.windExposure !== "inland");
  update("windstormUncertain", preset.windExposure === "boundary-uncertain");
  update(
    "insuranceRatePerThousand",
    HOMEOWNERS_RATE_PER_THOUSAND[preset.windExposure],
  );
}

function applyParcel(
  parcel: ResolvedParcel,
  update: UpdateState,
  state: CalculatorState,
) {
  update("resolvedParcel", parcel);
  update("lookupStatus", parcel.isClearCreekIsd ? "resolved" : "outside-ccisd");
  update("lookupError", null);
  update("addressQuery", parcel.situs);
  update("locationId", parcel.inferredLocationId);
  update("usdaAddressConfirmed", parcel.usdaEligible);

  if (parcel.totalValue && parcel.totalValue > 0) {
    update("taxAppraisedValueOverride", parcel.totalValue);
  } else {
    update("taxAppraisedValueOverride", null);
  }

  if (parcel.flood) {
    update("inFloodZone", parcel.flood.inSpecialFloodHazardArea);
    if (parcel.flood.inSpecialFloodHazardArea && state.annualFloodInsurance === 0) {
      update("annualFloodInsurance", 1_200);
    }
    if (!parcel.flood.inSpecialFloodHazardArea) {
      update("annualFloodInsurance", 0);
    }
  } else {
    update("inFloodZone", false);
    update("annualFloodInsurance", 0);
  }

  if (parcel.hasUtilityDistrict) {
    if (state.monthlyMudUtility === 0) {
      update("monthlyMudUtility", DEFAULT_MUD_UTILITY_MONTHLY);
    }
  } else {
    update("monthlyMudUtility", 0);
  }

  // Windstorm follows the county and the city, so it is derived from the
  // parcel's own taxing units rather than from the address string.
  const wind = assessWindExposure({
    county: parcel.ref.county,
    taxUnitCodes: parcel.taxUnitCodes,
  });
  update("separateWindstormPolicy", wind.separatePolicyRequired);
  update("windstormUncertain", wind.verifyByAddress);
  update("insuranceRatePerThousand", wind.homeownersRatePerThousand);

  const year = new Date().getFullYear();
  update(
    "isNewConstruction",
    (parcel.yearBuilt != null && parcel.yearBuilt >= year - 1) ||
      (parcel.improvementValue === 0 && (parcel.landValue ?? 0) > 0),
  );
}

export function AddressLookup({
  state,
  update,
}: {
  state: CalculatorState;
  update: UpdateState;
}) {
  const [candidates, setCandidates] = useState<AddressCandidate[]>([]);
  const [partial, setPartial] = useState<string | null>(null);
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
          partial?: string | null;
          error?: string;
        };
        if (id !== requestId.current) return;
        if (!response.ok) {
          update("lookupStatus", "error");
          update("lookupError", body.error ?? "Address search failed.");
          return;
        }
        setCandidates(body.candidates ?? []);
        setPartial(body.partial ?? null);
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
        `/api/property?parcel=${encodeURIComponent(encodeParcelRef(candidate.ref))}`,
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
      setPartial(null);
    } catch {
      update("lookupStatus", "error");
      update("lookupError", "Parcel lookup failed.");
    }
  };

  const clear = () => {
    clearParcelSelection(update, state.locationId);
    setCandidates([]);
    setPartial(null);
  };

  const parcel = state.resolvedParcel;

  return (
    <div className="space-y-3">
      <Field
        label="Street address"
        htmlFor="address"
        hint="Type the listing address. I search both appraisal districts this school district spans — Harris and Galveston — and you pick the matching parcel. I will not guess."
      >
        <TextInput
          id="address"
          value={state.addressQuery}
          placeholder="1234 Example Ln, League City TX"
          autoComplete="street-address"
          onChange={(value) => {
            update("addressQuery", value);
            setCandidates([]);
            if (state.resolvedParcel) {
              clearParcelSelection(update, state.locationId);
            }
          }}
        />
      </Field>

      <div role="status" aria-live="polite" className="space-y-3">
        {state.lookupStatus === "searching" && (
          <p className="text-xs text-ink-500">
            Searching Harris and Galveston CAD…
          </p>
        )}
        {state.lookupStatus === "looking-up" && (
          <p className="text-xs text-ink-500">
            Pulling taxing units, flood zone and wind exposure…
          </p>
        )}
        {state.lookupError && (
          <Callout tone="warn" title="Address lookup failed">
            {state.lookupError} Use the location and utility district pickers
            below as a fallback.
          </Callout>
        )}
        {partial && (
          <Callout tone="warn" title="Only one county could be searched">
            {partial}
          </Callout>
        )}

        {state.lookupStatus === "awaiting-pick" && candidates.length === 0 && (
          <Callout tone="warn" title="No matching parcels">
            Try the house number plus the street name, without the city.
            Neither appraisal district stores the city the way a listing writes
            it, so the street on its own matches more reliably.
          </Callout>
        )}
      </div>

      {candidates.length > 0 && state.lookupStatus === "awaiting-pick" && (
        <div className="space-y-2 rounded-lg border border-ink-200 bg-white p-2">
          <Callout tone="warn" title="Typing the address is not enough">
            Choose the matching parcel. Until you do, the payment uses a
            location preset instead of this house’s own taxing districts.
          </Callout>
          <p className="px-2 pt-1 text-xs font-medium uppercase tracking-wide text-ink-500">
            Pick the matching parcel
          </p>
          {candidates.map((candidate) => (
            <button
              key={encodeParcelRef(candidate.ref)}
              type="button"
              onClick={() => void pick(candidate)}
              className="flex min-h-11 w-full flex-col justify-center rounded-md px-3 py-2.5 text-left text-sm hover:bg-brand-50"
            >
              <span className="font-medium text-ink-900">
                {candidate.situs}
              </span>
              <span className="text-xs text-ink-500">
                {countyLabel(candidate.ref.county)}
                {candidate.totalValue
                  ? ` · appraised ${formatUSD(candidate.totalValue, 0)}`
                  : " · no appraised value"}
                {candidate.inDistrict
                  ? ""
                  : ` · ${candidate.schoolName ?? "not Clear Creek ISD"}`}
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
            {parcel.isClearCreekIsd ? (
              <Badge tone="good">Clear Creek ISD</Badge>
            ) : (
              <Badge tone="bad">
                {parcel.schoolNames[0] ?? "Not Clear Creek ISD"}
              </Badge>
            )}
            <Badge tone="neutral">{countyLabel(parcel.ref.county)}</Badge>
            {parcel.inWindstormArea && (
              <Badge tone="warn">Windstorm area</Badge>
            )}
            {parcel.flood?.inSpecialFloodHazardArea && (
              <Badge tone="warn">
                Flood zone {parcel.flood.zone ?? "SFHA"}
              </Badge>
            )}
            {parcel.hasUtilityDistrict && (
              <Badge tone="neutral">Utility district</Badge>
            )}
          </div>

          {!parcel.isClearCreekIsd && (
            <Callout tone="bad" title="This address is not in Clear Creek ISD">
              The parcel is billed by{" "}
              {parcel.schoolNames[0] ?? "another school district"}
              {parcel.schoolCodes[0] ? ` (${parcel.schoolCodes[0]})` : ""}. This
              calculator is built for Clear Creek ISD tax rates and assistance
              geography. Confirm the district on the{" "}
              <a
                href={CCISD_MAP_URL}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                CCISD school finder
              </a>{" "}
              before you trust any number here.
            </Callout>
          )}

          {parcel.splitBetweenSchoolDistricts && (
            <Callout tone="bad" title="This parcel is split between school districts">
              The appraisal record bills it by {parcel.schoolNames.join(" and ")}
              , apportioning the value between them. That happens on parcels
              straddling a district line, and this calculator does not model the
              split — it prices the whole value in Clear Creek ISD. Ask the
              appraisal district for the apportionment before relying on the tax
              figure.
            </Callout>
          )}

          {parcel.ref.county === "galveston" && (
            <Callout tone="warn" title="Galveston County data is a yearly snapshot">
              Galveston CAD publishes no live parcel service, so this record
              comes from its {parcel.vintage} download rather than a live query.
              Values and districts were correct at that drop. Harris County
              addresses are queried live.
            </Callout>
          )}

          {parcel.sellerExemptions && (
            <Callout
              tone="warn"
              title="The exemptions on this record belong to the seller"
            >
              The appraisal district shows {parcel.sellerExemptions}. Homestead
              resets on sale, so I am ignoring those and using your own
              homestead filing instead.
            </Callout>
          )}

          {parcel.ref.county === "harris" && (
            <Callout tone="warn" title="Check the seller's exemptions yourself">
              HCAD’s parcel service does not publish exemptions, so I cannot
              read the seller’s off the record the way I can in Galveston
              County. Whatever exemption the seller holds does not transfer:
              homestead resets on sale and you must file your own.
            </Callout>
          )}

          {parcel.totalValue != null &&
            state.purchasePrice > 0 &&
            Math.abs(parcel.totalValue - state.purchasePrice) /
              state.purchasePrice >
              0.15 && (
              <Callout
                tone="warn"
                title="Appraised value and listing price diverge"
              >
                The appraisal district has this parcel at{" "}
                {formatUSD(parcel.totalValue, 0)} against a listing price of{" "}
                {formatUSD(state.purchasePrice, 0)}. Tax is estimated from the
                appraised value; the loan is sized from the price. New
                construction is often assessed on an unimproved lot the first
                year.
              </Callout>
            )}

          {parcel.missingRateCodes.length > 0 && (
            <Callout
              tone="warn"
              title="Some districts are not on the county rate roll"
            >
              {parcel.missingRateCodes.map((r) => r.code).join(", ")}{" "}
              {parcel.missingRateCodes.length === 1 ? "is" : "are"} billed by a
              private collector or missing from the county table. Enter{" "}
              {parcel.missingRateCodes.length === 1 ? "its" : "their"} rate
              below rather than treating{" "}
              {parcel.missingRateCodes.length === 1 ? "it" : "them"} as zero.
            </Callout>
          )}

          {parcel.nonLevyingCodes.length > 0 && (
            <Callout
              tone="neutral"
              title="Overlay zones on this parcel, not billed"
            >
              {parcel.nonLevyingCodes.map((r) => r.name).join(", ")}.{" "}
              {parcel.nonLevyingCodes.length === 1 ? "It is" : "They are"}{" "}
              recorded on the parcel but{" "}
              {parcel.nonLevyingCodes.length === 1 ? "levies" : "levy"} nothing
              of {parcel.nonLevyingCodes.length === 1 ? "its" : "their"} own, so{" "}
              {parcel.nonLevyingCodes.length === 1 ? "it is" : "they are"} left
              out of the bill. If your closing disclosure shows an assessment
              you do not recognise, ask the appraisal district about{" "}
              {parcel.nonLevyingCodes.length === 1 ? "this one" : "these"}.
            </Callout>
          )}
        </div>
      )}
    </div>
  );
}
