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
      <p className="mt-2 text-xs text-ink-500">Uses exactly the cash you listed.</p>
    );
  }
  if (delta > 0) {
    return (
      <p className="mt-2 text-xs text-amber-800">
        Needs {formatUSD(delta)} more than the cash you listed.
      </p>
    );
  }
  return (
    <p className="mt-2 text-xs text-ink-500">
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
    <Card
      title="Best pair"
      subtitle={`${bestCombined.scenario.program.shortName} · ${assistanceLabel(bestCombined.assistanceIds)}`}
    >
      <p className="text-sm leading-relaxed text-ink-500">
        Closest to both lowest monthly payment and least cash to close on the
        same loan and assistance stack.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <div className="field-label !mb-0">Monthly</div>
          <div className="tnum text-xl font-semibold text-brand-700">
            {formatUSD(bestCombined.effectiveMonthly)}
          </div>
        </div>
        <div>
          <div className="field-label !mb-0">Cash to close</div>
          <div className="tnum text-xl font-semibold text-brand-700">
            {formatUSD(bestCombined.netCashDue)}
          </div>
        </div>
      </div>
      <CashNote path={bestCombined} cashAvailable={state.cashAvailable} />

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

      {showExtremes && (monthlyIsDifferent || cashIsDifferent) && (
        <div className="mt-4 space-y-1 text-xs leading-relaxed text-ink-500">
          {monthlyIsDifferent && (
            <p>
              Lowest monthly alone is {lowestMonthly.scenario.program.shortName} at{" "}
              {formatUSD(lowestMonthly.effectiveMonthly)}, with{" "}
              {formatUSD(lowestMonthly.netCashDue)} to close.
            </p>
          )}
          {cashIsDifferent && (
            <p>
              Least cash alone is {lowestCash.scenario.program.shortName} at{" "}
              {formatUSD(lowestCash.netCashDue)}, with{" "}
              {formatUSD(lowestCash.effectiveMonthly)} a month.
            </p>
          )}
        </div>
      )}

      {state.manualOverride && (
        <p className="mt-3 text-xs text-ink-500">
          Manual override is on — the breakdown below uses your pick. This card
          still shows the auto-ranked pair.
        </p>
      )}
    </Card>
  );
}
