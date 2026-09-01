"use client";

import { ASSISTANCE_PROGRAMS } from "@/data/assistancePrograms";
import { findLocationPreset } from "@/data/fortBendTaxRates";
import type { CalculatorState } from "@/lib/defaults";
import { formatUSD } from "@/lib/money";
import type { PathRanking, RankedPath } from "@/lib/pathRank";
import { Callout, Card } from "./ui";

function assistanceLabel(ids: string[]): string {
  if (ids.length === 0) return "No down-payment assistance";
  return ids
    .map(
      (id) =>
        ASSISTANCE_PROGRAMS.find((program) => program.id === id)?.name ?? id,
    )
    .join(" + ");
}

function pathKey(path: RankedPath): string {
  return `${path.programId}|${[...path.assistanceIds].sort().join(",")}`;
}

function CashNote({
  path,
  cashAvailable,
}: {
  path: RankedPath;
  cashAvailable: number;
}) {
  if (cashAvailable <= 0) return null;
  const delta = path.netCashDue - cashAvailable;
  if (Math.abs(delta) < 0.5) {
    return (
      <p className="mt-3 text-xs text-brand-200">
        Uses exactly the cash you listed.
      </p>
    );
  }
  if (delta > 0) {
    return (
      <p className="mt-3 text-xs font-medium text-flag-100">
        Needs {formatUSD(delta)} more than the cash you listed.
      </p>
    );
  }
  return (
    <p className="mt-3 text-xs text-brand-200">
      Leaves {formatUSD(-delta)} after closing, given the cash you listed.
    </p>
  );
}

export function AnswerCards({
  ranking,
  state,
}: {
  ranking: PathRanking;
  state: CalculatorState;
}) {
  const { lowestMonthly, lowestCash, bestCombined, samePath } = ranking;

  if (!bestCombined || !lowestMonthly || !lowestCash) {
    return (
      <Card title="Your numbers">
        <Callout tone="bad">
          None of the loan programs currently qualify on these numbers. Raise
          income, lower debts or the purchase price, then look again.
        </Callout>
      </Card>
    );
  }

  const showExtremes = !samePath;
  const combinedKey = pathKey(bestCombined);
  const monthlyIsDifferent = pathKey(lowestMonthly) !== combinedKey;
  const cashIsDifferent = pathKey(lowestCash) !== combinedKey;

  return (
    <div>
      <section
        aria-label="Best loan and assistance pair"
        className="card border-brand-900 bg-brand-900 p-5 text-white shadow-lg shadow-brand-900/20 sm:p-7"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-base font-semibold tracking-tight">
            Your best pair
          </h2>
          <p className="text-xs text-brand-300">
            Closest to lowest monthly and least cash on one loan and assistance
            stack.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:gap-x-8">
          <div className="min-w-0">
            <div className="hero-label">Monthly payment</div>
            <div className="tnum break-words text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              {formatUSD(bestCombined.effectiveMonthly)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="hero-label">Cash to close</div>
            <div className="tnum break-words text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              {formatUSD(bestCombined.netCashDue)}
            </div>
          </div>
        </div>

        <CashNote path={bestCombined} cashAvailable={state.cashAvailable} />

        <dl className="mt-6 grid gap-4 border-t border-brand-800 pt-5 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="hero-label">Loan</dt>
            <dd className="break-words text-sm font-semibold leading-snug">
              {bestCombined.scenario.program.shortName}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="hero-label">Assistance</dt>
            <dd className="break-words text-sm font-semibold leading-snug">
              {assistanceLabel(bestCombined.assistanceIds)}
            </dd>
          </div>
        </dl>

        {(state.manualOverride ||
          (showExtremes && (monthlyIsDifferent || cashIsDifferent))) && (
          <div className="mt-4 space-y-1 text-xs leading-relaxed text-brand-200">
            {showExtremes && monthlyIsDifferent && (
              <p>
                Lowest monthly alone is{" "}
                {lowestMonthly.scenario.program.shortName} at{" "}
                {formatUSD(lowestMonthly.effectiveMonthly)}, with{" "}
                {formatUSD(lowestMonthly.netCashDue)} to close.
              </p>
            )}
            {showExtremes && cashIsDifferent && (
              <p>
                Least cash alone is {lowestCash.scenario.program.shortName} at{" "}
                {formatUSD(lowestCash.netCashDue)}, with{" "}
                {formatUSD(lowestCash.effectiveMonthly)} a month.
              </p>
            )}
            {state.manualOverride && (
              <p>
                Manual override is on — the breakdown below uses your pick.
                This card still shows the auto-ranked pair.
              </p>
            )}
          </div>
        )}
      </section>

      {!state.resolvedParcel && state.addressQuery.trim().length > 0 && (
        <div className="mt-4">
          <Callout tone="warn" title="These taxes are a location guess">
            Pick the matching parcel from the address search. Until you do, the
            monthly payment and cash to close use the{" "}
            {findLocationPreset(state.locationId).name} preset instead of this
            house’s actual tax districts — and that can change which assistance
            program wins.
          </Callout>
        </div>
      )}
    </div>
  );
}
