"use client";

import { formatPercent, formatUSD } from "@/lib/money";
import type { EligibilityFinding } from "@/lib/loanPrograms";
import type { ScenarioResult } from "@/lib/scenario";
import type { CalculatorState } from "@/lib/defaults";
import type { AssistanceEvaluation } from "@/lib/assistance";
import type { LoanProgramId } from "@/lib/types";
import { Badge, Callout, Card, Disclosure, Stat } from "./ui";

export interface ProgramComparisonRow {
  scenario: ScenarioResult;
  eligibility: EligibilityFinding;
}

export function rankEligiblePrograms(rows: ProgramComparisonRow[]) {
  const eligible = rows.filter((row) => row.eligibility.status !== "ineligible");

  const cheapestMonthly = eligible.reduce<ProgramComparisonRow | null>(
    (best, row) =>
      best == null || row.scenario.monthly.total < best.scenario.monthly.total
        ? row
        : best,
    null,
  );
  const cheapestCash = eligible.reduce<ProgramComparisonRow | null>(
    (best, row) =>
      best == null ||
      row.scenario.cashToClose.netCashDue < best.scenario.cashToClose.netCashDue
        ? row
        : best,
    null,
  );
  const cheapestTotal = eligible.reduce<ProgramComparisonRow | null>(
    (best, row) =>
      best == null ||
      row.scenario.totalCostOverHorizon < best.scenario.totalCostOverHorizon
        ? row
        : best,
    null,
  );

  return { eligible, cheapestMonthly, cheapestCash, cheapestTotal };
}

export function ProgramRecommendation({
  rows,
  state,
  selectedId,
  onSelect,
}: {
  rows: ProgramComparisonRow[];
  state: CalculatorState;
  selectedId: LoanProgramId;
  onSelect: (id: LoanProgramId) => void;
}) {
  const { eligible, cheapestMonthly, cheapestCash, cheapestTotal } =
    rankEligiblePrograms(rows);
  const cashFits = (row: ProgramComparisonRow | null) =>
    row != null && row.scenario.cashToClose.netCashDue <= state.cashAvailable + 0.5;

  const recommended =
    (cashFits(cheapestTotal) ? cheapestTotal : null) ??
    (cashFits(cheapestCash) ? cheapestCash : null) ??
    cheapestCash ??
    cheapestMonthly ??
    cheapestTotal;

  if (!recommended) {
    return (
      <Card title="Recommended program">
        <Callout tone="bad">
          None of the loan programs currently qualify on these numbers. Relax
          cash, debts, or the purchase price, then look again.
        </Callout>
      </Card>
    );
  }

  const sameMonthly =
    cheapestMonthly?.scenario.program.id === recommended.scenario.program.id;
  const sameCash =
    cheapestCash?.scenario.program.id === recommended.scenario.program.id;
  const sameTotal =
    cheapestTotal?.scenario.program.id === recommended.scenario.program.id;
  const cashShort =
    state.cashAvailable > 0 &&
    recommended.scenario.cashToClose.netCashDue > state.cashAvailable;

  return (
    <Card
      title="Recommended program"
      subtitle="Ranked from the same house, rate, and cash you entered. The table below is the full comparison if you want a different tradeoff."
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <Stat
          label="Use this"
          value={recommended.scenario.program.shortName}
          size="lg"
          tone="good"
          sub={recommended.scenario.program.name}
        />
        <div className="grid w-full grid-cols-2 gap-4 sm:flex sm:w-auto sm:flex-wrap sm:gap-6">
          <Stat
            label="Monthly"
            value={formatUSD(recommended.scenario.monthly.total)}
            sub={
              sameMonthly
                ? "Lowest of the programs you qualify for"
                : cheapestMonthly
                  ? `${formatUSD(cheapestMonthly.scenario.monthly.total)} on ${cheapestMonthly.scenario.program.shortName} is lower`
                  : undefined
            }
          />
          <Stat
            label="Cash to close"
            value={formatUSD(recommended.scenario.cashToClose.netCashDue)}
            tone={cashShort ? "bad" : "good"}
            sub={
              cashShort
                ? `${formatUSD(recommended.scenario.cashToClose.netCashDue - state.cashAvailable)} more than you have`
                : sameCash
                  ? "Least cash of the programs you qualify for"
                  : cheapestCash
                    ? `${cheapestCash.scenario.program.shortName} needs ${formatUSD(cheapestCash.scenario.cashToClose.netCashDue)}`
                    : undefined
            }
          />
          <Stat
            label={`${state.horizonYears}-year cost`}
            value={formatUSD(recommended.scenario.totalCostOverHorizon)}
            sub={
              sameTotal
                ? "Cheapest over the years you plan to stay"
                : cheapestTotal
                  ? `${cheapestTotal.scenario.program.shortName} is ${formatUSD(cheapestTotal.scenario.totalCostOverHorizon)}`
                  : undefined
            }
          />
        </div>
      </div>

      {eligible.length > 1 && (!sameMonthly || !sameCash || !sameTotal) && (
        <div className="mt-4">
          <Callout tone="neutral">
            {cheapestCash &&
            cheapestMonthly &&
            cheapestCash.scenario.program.id !==
              cheapestMonthly.scenario.program.id
              ? `If cash is the constraint, ${cheapestCash.scenario.program.shortName} needs the least at closing. If the monthly payment is, ${cheapestMonthly.scenario.program.shortName} is lower.`
              : "The cheapest program on cash, monthly payment, and total cost are not the same loan. Use the table below to pick the tradeoff."}{" "}
            {cheapestTotal &&
            recommended.scenario.program.id !== cheapestTotal.scenario.program.id
              ? `Over ${state.horizonYears} years ${cheapestTotal.scenario.program.shortName} still costs the least if you can fund the extra cash.`
              : null}
          </Callout>
        </div>
      )}

      {recommended.scenario.program.id !== selectedId && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => onSelect(recommended.scenario.program.id)}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 sm:w-auto"
          >
            Switch the calculator to {recommended.scenario.program.shortName}
          </button>
        </div>
      )}
    </Card>
  );
}

export function ProgramComparison({
  rows,
  selectedId,
  onSelect,
  state,
}: {
  rows: ProgramComparisonRow[];
  selectedId: LoanProgramId;
  onSelect: (id: LoanProgramId) => void;
  state: CalculatorState;
}) {
  const { cheapestMonthly, cheapestCash, cheapestTotal } =
    rankEligiblePrograms(rows);

  return (
    <Card
      title="Every loan program, side by side"
      subtitle={`All priced on the same ${formatUSD(state.purchasePrice)} home at ${formatPercent(state.interestRate, 3)}. Real quotes will differ by program, so treat the ordering as the signal rather than the exact dollars.`}
    >
      {cheapestTotal && (
        <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat
            label="Lowest monthly"
            value={cheapestMonthly?.scenario.program.shortName ?? "—"}
            tone="good"
            sub={
              cheapestMonthly
                ? formatUSD(cheapestMonthly.scenario.monthly.total)
                : undefined
            }
          />
          <Stat
            label="Least cash needed"
            value={cheapestCash?.scenario.program.shortName ?? "—"}
            tone="good"
            sub={
              cheapestCash
                ? formatUSD(cheapestCash.scenario.cashToClose.netCashDue)
                : undefined
            }
          />
          <Stat
            label={`Cheapest over ${state.horizonYears}y`}
            value={cheapestTotal.scenario.program.shortName}
            tone="good"
            sub={formatUSD(cheapestTotal.scenario.totalCostOverHorizon)}
          />
        </div>
      )}

      <div className="space-y-3 md:hidden">
        {rows.map(({ scenario, eligibility }) => {
          const isSelected = scenario.program.id === selectedId;
          const isIneligible = eligibility.status === "ineligible";

          return (
            <button
              key={scenario.program.id}
              type="button"
              onClick={() => onSelect(scenario.program.id)}
              aria-pressed={isSelected}
              className={`w-full rounded-lg border p-3 text-left ${
                isSelected
                  ? "border-brand-500 bg-brand-50"
                  : isIneligible
                    ? "border-ink-200 opacity-60"
                    : "border-ink-200 bg-white active:bg-ink-50"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 font-medium text-ink-900">
                    {scenario.program.shortName}
                    {isSelected && <Badge tone="brand">Selected</Badge>}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-500">
                    {scenario.program.pitch}
                  </p>
                </div>
                {eligibility.status === "eligible" && (
                  <Badge tone="good">Eligible</Badge>
                )}
                {eligibility.status === "needs-check" && (
                  <Badge tone="warn">Check</Badge>
                )}
                {eligibility.status === "ineligible" && (
                  <Badge tone="bad">No</Badge>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                <div>
                  <dt className="field-label !mb-0">Monthly</dt>
                  <dd className="tnum text-sm font-semibold text-ink-900">
                    {formatUSD(scenario.monthly.total)}
                  </dd>
                </div>
                <div>
                  <dt className="field-label !mb-0">Cash to close</dt>
                  <dd className="tnum text-sm font-semibold text-ink-900">
                    {formatUSD(scenario.cashToClose.netCashDue)}
                  </dd>
                </div>
                <div>
                  <dt className="field-label !mb-0">Down</dt>
                  <dd className="tnum text-sm text-ink-700">
                    {formatPercent(scenario.downPaymentFraction, 1)}
                  </dd>
                </div>
                <div>
                  <dt className="field-label !mb-0">{state.horizonYears}y cost</dt>
                  <dd className="tnum text-sm text-ink-700">
                    {formatUSD(scenario.totalCostOverHorizon)}
                  </dd>
                </div>
              </dl>
            </button>
          );
        })}
        <p className="text-xs leading-relaxed text-ink-500">
          Tap a program to price the rest of the page on it.
        </p>
      </div>

      <div className="table-scroll hidden md:block">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500">
              <th className="pb-2 pr-3 font-semibold">Program</th>
              <th className="pb-2 px-2 text-right font-semibold">Down</th>
              <th className="pb-2 px-2 text-right font-semibold">Monthly</th>
              <th className="pb-2 px-2 text-right font-semibold">Mtg. ins.</th>
              <th className="pb-2 px-2 text-right font-semibold">Cash to close</th>
              <th className="pb-2 px-2 text-right font-semibold">
                {state.horizonYears}y cost
              </th>
              <th className="pb-2 pl-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map(({ scenario, eligibility }) => {
              const isSelected = scenario.program.id === selectedId;
              const isIneligible = eligibility.status === "ineligible";

              return (
                <tr
                  key={scenario.program.id}
                  onClick={() => onSelect(scenario.program.id)}
                  className={`cursor-pointer transition-colors duration-150 ${
                    isSelected
                      ? "bg-brand-50"
                      : isIneligible
                        ? "opacity-50 hover:bg-ink-50"
                        : "hover:bg-ink-50"
                  }`}
                >
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2 font-medium text-ink-900">
                      {scenario.program.shortName}
                      {isSelected && <Badge tone="brand">Selected</Badge>}
                    </div>
                    <div className="mt-0.5 max-w-sm text-xs leading-relaxed text-ink-500">
                      {scenario.program.pitch}
                    </div>
                  </td>
                  <td className="tnum px-2 py-3 text-right text-ink-700">
                    {formatPercent(scenario.downPaymentFraction, 1)}
                    <div className="text-xs text-ink-400">
                      {formatUSD(scenario.downPayment)}
                    </div>
                  </td>
                  <td className="tnum px-2 py-3 text-right font-medium text-ink-900">
                    {formatUSD(scenario.monthly.total)}
                  </td>
                  <td className="tnum px-2 py-3 text-right text-ink-700">
                    {scenario.monthly.mortgageInsurance > 0
                      ? formatUSD(scenario.monthly.mortgageInsurance)
                      : "None"}
                  </td>
                  <td className="tnum px-2 py-3 text-right text-ink-700">
                    {formatUSD(scenario.cashToClose.netCashDue)}
                  </td>
                  <td className="tnum px-2 py-3 text-right text-ink-700">
                    {formatUSD(scenario.totalCostOverHorizon)}
                  </td>
                  <td className="py-3 pl-2">
                    {eligibility.status === "eligible" && (
                      <Badge tone="good">Eligible</Badge>
                    )}
                    {eligibility.status === "needs-check" && (
                      <Badge tone="warn">Check</Badge>
                    )}
                    {eligibility.status === "ineligible" && (
                      <Badge tone="bad">No</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 space-y-1 border-t border-ink-200 pt-4">
        {rows
          .filter(
            (row) =>
              row.eligibility.reasons.length > 0 ||
              row.eligibility.checks.length > 0,
          )
          .map(({ scenario, eligibility }) => (
            <Disclosure
              key={scenario.program.id}
              summary={`${scenario.program.shortName}: ${
                eligibility.status === "ineligible"
                  ? "why you don't qualify"
                  : "what to verify"
              }`}
            >
              <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed text-ink-600">
                {eligibility.reasons.map((reason) => (
                  <li key={reason} className="text-alert-700">
                    {reason}
                  </li>
                ))}
                {eligibility.checks.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
            </Disclosure>
          ))}
      </div>
    </Card>
  );
}

export function AssistancePlaybook({
  scenario,
}: {
  scenario: ScenarioResult;
}) {
  const { evaluations, accepted, rejected } = scenario.assistance;

  const acceptedIds = new Set(accepted.map((ev) => ev.program.id));
  const eligibleUnused = evaluations.filter(
    (ev) => ev.eligible && !acceptedIds.has(ev.program.id),
  );
  const ineligible = evaluations.filter((ev) => !ev.eligible);

  return (
    <Card
      title="Assistance programs"
      subtitle="Ranked by what each one is actually worth to you. Anything marked for verification needs a phone call before you count on it."
    >
      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat
          label="Assistance at closing"
          value={formatUSD(scenario.assistance.totalFundsAtClosing)}
          tone={scenario.assistance.totalFundsAtClosing > 0 ? "good" : "neutral"}
        />
        <Stat
          label="Annual tax credit"
          value={formatUSD(scenario.assistance.annualTaxCredit)}
          tone={scenario.assistance.annualTaxCredit > 0 ? "good" : "neutral"}
          sub={
            scenario.assistance.annualTaxCredit > 0
              ? `${formatUSD(scenario.assistance.annualTaxCredit * 10)} over ten years`
              : undefined
          }
        />
        <Stat
          label="New monthly payment created"
          value={formatUSD(scenario.assistance.totalMonthlyPayment)}
          tone={scenario.assistance.totalMonthlyPayment > 0 ? "warn" : "good"}
          sub="From any repayable second lien"
        />
      </div>

      {accepted.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Applied to this scenario
          </h3>
          {accepted.map((ev) => (
            <ProgramRow key={ev.program.id} evaluation={ev} tone="good" />
          ))}
        </div>
      )}

      {rejected.length > 0 && (
        <div className="mt-5 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Selected but cannot be combined
          </h3>
          {rejected.map(({ evaluation, reason }) => (
            <div key={evaluation.program.id}>
              <ProgramRow evaluation={evaluation} tone="warn" />
              <p className="mt-1 pl-1 text-xs text-flag-700">{reason}</p>
            </div>
          ))}
        </div>
      )}

      {eligibleUnused.length > 0 && (
        <div className="mt-5 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            You appear to qualify but have not selected these
          </h3>
          {eligibleUnused.map((ev) => (
            <ProgramRow key={ev.program.id} evaluation={ev} tone="neutral" />
          ))}
        </div>
      )}

      {ineligible.length > 0 && (
        <div className="mt-5">
          <Disclosure summary={`${ineligible.length} programs you do not qualify for`}>
            <div className="space-y-3 pt-1">
              {ineligible.map((ev) => (
                <div key={ev.program.id}>
                  <div className="text-sm font-medium text-ink-700">
                    {ev.program.name}
                  </div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-ink-500">
                    {ev.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Disclosure>
        </div>
      )}
    </Card>
  );
}

function ProgramRow({
  evaluation,
  tone,
}: {
  evaluation: AssistanceEvaluation;
  tone: "good" | "warn" | "neutral";
}) {
  const { program, potentialAward } = evaluation;

  const kindLabel: Record<string, string> = {
    grant: "Grant, never repaid",
    "forgivable-second": `Forgivable after ${program.forgivenessYears ?? "?"} years`,
    "deferred-second": "Deferred, repaid when you sell or refinance",
    "repayable-second": "Second lien with a monthly payment",
    "tax-credit": "Annual federal tax credit",
    "closing-credit": "Credit applied at closing",
  };

  const borderTone = {
    good: "border-brand-200 bg-brand-50",
    warn: "border-flag-100 bg-flag-50",
    neutral: "border-ink-200 bg-white",
  }[tone];

  const value =
    program.kind === "tax-credit"
      ? `${formatUSD(potentialAward.annualTaxCredit)}/yr`
      : formatUSD(potentialAward.fundsAtClosing);

  return (
    <div className={`rounded-lg border px-4 py-3 ${borderTone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={program.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-ink-900 underline decoration-ink-300 underline-offset-2 hover:decoration-ink-600"
            >
              {program.name}
            </a>
            {program.confidence === "verified" ? (
              <Badge tone="good">Verified</Badge>
            ) : (
              <Badge tone="warn">Verify by phone</Badge>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">
            {program.summary}
          </p>
          <p className="mt-1 text-xs font-medium text-ink-500">
            {kindLabel[program.kind]} · {program.administrator}
          </p>
        </div>
        <div className="tnum shrink-0 text-right text-base font-semibold text-brand-700">
          {value}
        </div>
      </div>

      {(program.notes.length > 0 || evaluation.manualChecks.length > 0) && (
        <Disclosure summary="Details and fine print">
          <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-ink-600">
            {program.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
            {evaluation.manualChecks.map((check) => (
              <li key={check} className="font-medium text-flag-700">
                {check}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </div>
  );
}

export interface SavingsAction {
  title: string;
  detail: string;
  value: number | null;
  valueLabel?: string;
  effort: "call" | "negotiate" | "paperwork" | "decision";
}

export function SavingsPlaybook({ actions }: { actions: SavingsAction[] }) {
  if (actions.length === 0) return null;

  const effortLabel: Record<SavingsAction["effort"], string> = {
    call: "One phone call",
    negotiate: "Negotiate",
    paperwork: "Paperwork",
    decision: "A decision to make",
  };

  return (
    <Card
      title="Your cheapest path to owning this house"
      subtitle="Ordered by how much money each move is worth, largest first."
    >
      <ol className="space-y-4">
        {actions.map((action, index) => (
          <li key={action.title} className="flex gap-4">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
              {index + 1}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-sm font-semibold text-ink-900">
                  {action.title}
                </h3>
                {action.value != null && (
                  <span className="tnum shrink-0 text-sm font-semibold text-brand-700">
                    {action.valueLabel ?? formatUSD(action.value)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">
                {action.detail}
              </p>
              <span className="mt-1.5 inline-block">
                <Badge tone="neutral">{effortLabel[action.effort]}</Badge>
              </span>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6">
        <Callout tone="neutral">
          None of this is financial advice, and none of these figures are a loan
          offer. Every program has fine print that changes without notice, and
          the only numbers that bind anyone are the ones on a Loan Estimate.
        </Callout>
      </div>
    </Card>
  );
}
