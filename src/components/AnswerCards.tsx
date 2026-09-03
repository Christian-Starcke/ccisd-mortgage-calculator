"use client";

import { ASSISTANCE_PROGRAMS } from "@/data/assistancePrograms";
import { findLocationPreset } from "@/data/clearCreekTaxRates";
import { resolveStateTaxUnits } from "@/lib/buildFromState";
import type { CalculatorState } from "@/lib/defaults";
import type { HouseholdUtilities } from "@/lib/householdUtilities";
import { formatUSD } from "@/lib/money";
import type { PathRanking, RankedPath } from "@/lib/pathRank";
import type { ScenarioResult } from "@/lib/scenario";
import { Badge, Callout, Card } from "./ui";

function pathKey(path: RankedPath): string {
  return `${path.programId}|${[...path.assistanceIds].sort().join(",")}`;
}

function acceptedLabel(scenario: ScenarioResult): string {
  const accepted = scenario.assistance.accepted;
  if (accepted.length === 0) return "No down-payment assistance";
  return accepted.map((ev) => ev.program.name).join(" + ");
}

function CashNote({
  netCashDue,
  cashAvailable,
}: {
  netCashDue: number;
  cashAvailable: number;
}) {
  if (cashAvailable <= 0) return null;
  const delta = netCashDue - cashAvailable;
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
  scenario,
  ranking,
  state,
  utilities,
  onSelectPath,
  onAutoPick,
}: {
  scenario: ScenarioResult;
  ranking: PathRanking;
  state: CalculatorState;
  utilities: HouseholdUtilities;
  onSelectPath: (path: RankedPath) => void;
  onAutoPick: () => void;
}) {
  const { lowestMonthly, lowestCash, bestCombined } = ranking;
  const usesParcelTax = resolveStateTaxUnits(state).fromParcel;

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

  const acceptedIds = scenario.assistance.accepted.map((ev) => ev.program.id);
  const selectedKey = `${scenario.program.id}|${[...acceptedIds].sort().join(",")}`;
  const monthly =
    scenario.monthly.totalAfterTaxCredit < scenario.monthly.total
      ? scenario.monthly.totalAfterTaxCredit
      : scenario.monthly.total;

  const alternatives: { path: RankedPath; reason: string }[] = [];
  if (pathKey(lowestMonthly) !== selectedKey) {
    alternatives.push({ path: lowestMonthly, reason: "Lowest monthly" });
  }
  if (
    pathKey(lowestCash) !== selectedKey &&
    !alternatives.some(
      (candidate) => pathKey(candidate.path) === pathKey(lowestCash),
    )
  ) {
    alternatives.push({ path: lowestCash, reason: "Least cash" });
  }

  return (
    <div>
      <section
        aria-label="Selected loan and assistance pair"
        className="card border-brand-900 bg-brand-900 p-5 text-white shadow-lg shadow-brand-900/20 sm:p-7"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-base font-semibold tracking-tight">
            {state.manualOverride ? "Your pick" : "Your best pair"}
          </h2>
          <p className="text-xs text-brand-300">
            {state.manualOverride
              ? "The path you picked, priced out."
              : "Closest to lowest monthly and least cash on one loan and assistance stack."}
          </p>
        </div>

        {/*
          * Same definition as "All in, monthly" in the TrueMonthlyCostCard:
          * the mortgage payment plus the household utilities. The utilities
          * are not part of the payment and no lender counts them, but they
          * come out of the same paycheque, so the headline pair above is not
          * the whole cost of the house. Sized one notch below the two heroes
          * to keep the payment as the headline.
          */}
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:gap-x-8 lg:grid-cols-3">
          <div className="min-w-0">
            <div className="hero-label">Monthly payment</div>
            <div className="tnum break-words text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              {formatUSD(monthly)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="hero-label">Cash to close</div>
            <div className="tnum break-words text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              {formatUSD(scenario.cashToClose.netCashDue)}
            </div>
          </div>
          <div className="col-span-2 min-w-0 lg:col-span-1">
            <div className="hero-label">All in, monthly</div>
            <div className="tnum break-words text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
              {formatUSD(scenario.monthly.total + utilities.monthlyTotal)}
            </div>
            <p className="mt-1 text-xs text-brand-300">
              Payment plus utilities — about{" "}
              {formatUSD(
                scenario.monthly.total + utilities.peakMonthlyTotal,
              )}{" "}
              in August.
            </p>
          </div>
        </div>

        <CashNote
          netCashDue={scenario.cashToClose.netCashDue}
          cashAvailable={state.cashAvailable}
        />

        <dl className="mt-6 grid gap-4 border-t border-brand-800 pt-5 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="hero-label">Loan</dt>
            <dd className="break-words text-sm font-semibold leading-snug">
              {scenario.program.shortName}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="hero-label">Assistance</dt>
            <dd className="break-words text-sm font-semibold leading-snug">
              {acceptedLabel(scenario)}
            </dd>
          </div>
        </dl>

        {state.manualOverride && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-brand-800 pt-4">
            <p className="text-xs text-brand-200">
              You picked this path yourself. The ranker’s pick is one tap away.
            </p>
            <button
              type="button"
              onClick={onAutoPick}
              className="inline-flex min-h-11 items-center rounded-md border border-brand-700 px-3 text-xs font-semibold text-white hover:bg-brand-800"
            >
              Back to the auto pick
            </button>
          </div>
        )}
      </section>

      {alternatives.length > 0 && (
        <div className="mt-4">
          <Card
            title="Other top picks"
            subtitle="Same house, different tradeoff. Pick one to re-price everything below."
          >
            <div className="divide-y divide-ink-100">
              {alternatives.map(({ path, reason }) => (
                <button
                  key={pathKey(path)}
                  type="button"
                  onClick={() => onSelectPath(path)}
                  className="flex w-full items-center gap-3 py-3 text-left hover:bg-ink-50 sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink-900">
                        {path.scenario.program.shortName}
                      </span>
                      <Badge tone="neutral">{reason}</Badge>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-ink-500">
                      {path.assistanceIds.length === 0
                        ? "No down-payment assistance"
                        : path.assistanceIds
                            .map(
                              (id) =>
                                ASSISTANCE_PROGRAMS.find(
                                  (program) => program.id === id,
                                )?.name ?? id,
                            )
                            .join(" + ")}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tnum text-sm font-semibold text-ink-900">
                      {formatUSD(path.effectiveMonthly)}
                      <span className="font-normal text-ink-500">/mo</span>
                    </div>
                    <div className="tnum text-xs text-ink-500">
                      {formatUSD(path.netCashDue)} to close
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/*
        * Gated on whether the preset is actually billing the tax, not on
        * whether a parcel is selected. A Harris account with no row in the
        * stored footprint resolves as a parcel but carries no taxing units, so
        * the preset is still in force and the buyer still needs telling.
        */}
      {!usesParcelTax && state.addressQuery.trim().length > 0 && (
        <div className="mt-4">
          <Callout tone="warn" title="These taxes are a location guess">
            {state.resolvedParcel
              ? `This parcel's appraisal record lists no Clear Creek ISD taxing units, so the monthly payment and cash to close fall back to the ${findLocationPreset(state.locationId).name} preset instead of this house's actual tax districts. Confirm the district before you rely on the tax figure.`
              : null}
            {!state.resolvedParcel ? (
              <>
                Pick the matching parcel from the address search. Until you do,
                the monthly payment and cash to close use the{" "}
                {findLocationPreset(state.locationId).name} preset instead of
                this house’s actual tax districts — and that can change which
                assistance program wins.
              </>
            ) : null}
          </Callout>
        </div>
      )}
    </div>
  );
}
