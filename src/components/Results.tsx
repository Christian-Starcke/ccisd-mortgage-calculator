"use client";

import { formatPercent, formatUSD } from "@/lib/money";
import type { ScenarioResult } from "@/lib/scenario";
import type { AffordabilityResult } from "@/lib/affordability";
import type { CalculatorState } from "@/lib/defaults";
import { Badge, Callout, Card, Disclosure, LineItem, Stat } from "./ui";

const PAYMENT_COLORS = {
  principalAndInterest: "#1f6349",
  propertyTax: "#b8791a",
  homeownersInsurance: "#479a76",
  windstormInsurance: "#3d8fb0",
  floodInsurance: "#74bb9a",
  mortgageInsurance: "#c0392b",
  hoa: "#7a7a73",
  mudUtility: "#5b6e8c",
  pidAssessment: "#8a6a4a",
  assistanceSecondLien: "#2b2b28",
} as const;

function monthsToYearsMonths(months: number): string {
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  if (years === 0) return `${remainder} month${remainder === 1 ? "" : "s"}`;
  if (remainder === 0) return `${years} year${years === 1 ? "" : "s"}`;
  return `${years}y ${remainder}m`;
}

export function PaymentSummary({
  scenario,
  cashAvailable = 0,
}: {
  scenario: ScenarioResult;
  cashAvailable?: number;
}) {
  const { monthly } = scenario;

  const segments = (
    [
      ["Principal & interest", monthly.principalAndInterest, PAYMENT_COLORS.principalAndInterest],
      ["Property tax", monthly.propertyTax, PAYMENT_COLORS.propertyTax],
      ["Homeowners insurance", monthly.homeownersInsurance, PAYMENT_COLORS.homeownersInsurance],
      ["Windstorm insurance", monthly.windstormInsurance, PAYMENT_COLORS.windstormInsurance],
      ["Flood insurance", monthly.floodInsurance, PAYMENT_COLORS.floodInsurance],
      ["Mortgage insurance", monthly.mortgageInsurance, PAYMENT_COLORS.mortgageInsurance],
      ["HOA dues", monthly.hoa, PAYMENT_COLORS.hoa],
      ["Utility district water bill", monthly.mudUtility, PAYMENT_COLORS.mudUtility],
      ["PID assessment", monthly.pidAssessment, PAYMENT_COLORS.pidAssessment],
      ["Assistance second lien", monthly.assistanceSecondLien, PAYMENT_COLORS.assistanceSecondLien],
    ] as [string, number, string][]
  ).filter(([, amount]) => amount > 0);

  const taxShare =
    monthly.total > 0 ? monthly.propertyTax / monthly.total : 0;

  return (
    <Card>
      <div className="flex flex-col gap-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <Stat
          label="Estimated monthly payment"
          value={formatUSD(monthly.total)}
          size="lg"
          sub={
            monthly.totalAfterTaxCredit < monthly.total
              ? `${formatUSD(monthly.totalAfterTaxCredit)} after the mortgage tax credit is spread across the year`
              : "Principal, interest, taxes, insurance, mortgage insurance and HOA"
          }
        />
        <div className="grid grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:gap-6">
          <Stat
            label="Cash to close"
            value={formatUSD(scenario.cashToClose.netCashDue)}
            tone={
              cashAvailable > 0 && scenario.cashToClose.shortfall > 0
                ? "bad"
                : "good"
            }
            sub={
              cashAvailable > 0
                ? scenario.cashToClose.shortfall > 0
                  ? `${formatUSD(scenario.cashToClose.shortfall)} more than you have`
                  : `${formatUSD(scenario.cashToClose.cashRemaining)} left over`
                : undefined
            }
          />
          <Stat
            label="Loan amount"
            value={formatUSD(scenario.totalLoanAmount)}
            sub={`${formatPercent(scenario.loanToValue, 1)} loan-to-value`}
          />
        </div>
      </div>

      {/* Stacked bar showing what the payment is actually made of. */}
      <div
        aria-hidden="true"
        className="mt-6 flex h-3 w-full overflow-hidden rounded-full bg-ink-100"
      >
        {segments.map(([label, amount, color]) => (
          <div
            key={label}
            style={{
              width: `${(amount / monthly.total) * 100}%`,
              backgroundColor: color,
            }}
            title={`${label}: ${formatUSD(amount)}`}
          />
        ))}
      </div>

      <div className="mt-4 divide-y divide-ink-100">
        {segments.map(([label, amount, color]) => (
          <LineItem
            key={label}
            label={label}
            amount={formatUSD(amount)}
            swatch={color}
            note={
              label === "Mortgage insurance" && scenario.pmiQuote
                ? `${formatPercent(scenario.pmiQuote.annualRate, 2)} a year${
                    scenario.pmiQuote.reducedCoverage ? ", at the reduced coverage level" : ""
                  }`
                : label === "HOA dues" && scenario.hoaEstimated
                  ? "Estimate — confirm on the listing"
                  : undefined
            }
          />
        ))}
        <LineItem
          label="Total"
          amount={formatUSD(monthly.total)}
          emphasis
        />
      </div>

      {taxShare > 0.3 && (
        <div className="mt-4">
          <Callout tone="warn">
            Property tax is {formatPercent(taxShare, 0)} of your payment. That is
            normal for this area and it is the reason a Texas payment feels high
            relative to the loan size. It also means shopping the tax rate, by
            choosing where you buy, moves your payment more than shopping the
            interest rate does.
          </Callout>
        </div>
      )}

      {scenario.warnings.length > 0 && (
        <div className="mt-4">
          {scenario.warnings.length === 1 ? (
            <Callout tone="warn">{scenario.warnings[0]}</Callout>
          ) : (
            <Callout
              tone="warn"
              title={`${scenario.warnings.length} things to check before you trust this number`}
            >
              <ul className="list-disc space-y-1.5 pl-4">
                {scenario.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Callout>
          )}
        </div>
      )}
    </Card>
  );
}

export function CashToCloseCard({
  scenario,
  cashAvailable = 0,
}: {
  scenario: ScenarioResult;
  cashAvailable?: number;
}) {
  const { cashToClose, closingCosts } = scenario;

  return (
    <Card
      title="Cash to close"
      subtitle="What you owe at the table, and everything that can be used to knock it down."
    >
      <div className="divide-y divide-ink-100">
        <LineItem
          label="Down payment"
          amount={formatUSD(cashToClose.downPayment)}
          note={`${formatPercent(scenario.downPaymentFraction, 1)} of the purchase price`}
        />
        <LineItem
          label="Lender and third-party closing costs"
          amount={formatUSD(cashToClose.closingCosts)}
        />
        <LineItem
          label="Prepaids and escrow deposits"
          amount={formatUSD(cashToClose.prepaidsAndEscrow)}
          note={`Includes ${closingCosts.taxEscrowMonths} months of property tax and ${closingCosts.prepaidInterestDayCount} days of prepaid interest`}
        />
        {cashToClose.discountPointsCost > 0 && (
          <LineItem
            label="Discount points"
            amount={formatUSD(cashToClose.discountPointsCost)}
          />
        )}
        <LineItem
          label="Total due at closing"
          amount={formatUSD(cashToClose.totalRequired)}
          emphasis
        />

        {cashToClose.assistanceFunds > 0 && (
          <LineItem
            label="Down payment assistance"
            amount={`− ${formatUSD(cashToClose.assistanceFunds)}`}
            tone="good"
          />
        )}
        {cashToClose.sellerConcessions > 0 && (
          <LineItem
            label="Seller concessions"
            amount={`− ${formatUSD(cashToClose.sellerConcessions)}`}
            tone="good"
            note={`This loan allows up to ${formatUSD(scenario.maxSellerConcessionAllowed)}`}
          />
        )}
        {cashToClose.lenderCredit > 0 && (
          <LineItem
            label="Lender credit"
            amount={`− ${formatUSD(cashToClose.lenderCredit)}`}
            tone="good"
          />
        )}
        {cashToClose.giftFunds > 0 && (
          <LineItem
            label="Gift funds"
            amount={`− ${formatUSD(cashToClose.giftFunds)}`}
            tone="good"
          />
        )}
        <LineItem
          label="Cash you actually bring"
          amount={formatUSD(cashToClose.netCashDue)}
          emphasis
          tone={
            cashAvailable > 0 && cashToClose.shortfall > 0 ? "bad" : "neutral"
          }
        />
      </div>

      {scenario.financedUpfrontFee > 0 && (
        <div className="mt-4">
          <Callout tone="neutral">
            {formatUSD(scenario.financedUpfrontFee)} of upfront{" "}
            {scenario.program.id === "va" ? "VA funding fee" : "mortgage insurance"} was
            added to your loan balance rather than paid in cash, which is why the
            loan amount is higher than the price minus your down payment.
          </Callout>
        </div>
      )}

      <div className="mt-4">
        <Disclosure summary="Itemize every closing cost">
          <div className="divide-y divide-ink-100">
            {closingCosts.lineItems.map((item) => (
              <LineItem
                key={item.id}
                label={
                  <span className="flex flex-wrap items-center gap-2">
                    {item.label}
                    {item.negotiable && <Badge tone="warn">Negotiable</Badge>}
                  </span>
                }
                amount={formatUSD(item.amount)}
                note={item.note}
              />
            ))}
          </div>
        </Disclosure>
      </div>
    </Card>
  );
}

export function TaxBreakdown({ scenario }: { scenario: ScenarioResult }) {
  const { propertyTax } = scenario;

  return (
    <Card
      title="Property tax, unit by unit"
      subtitle="Each taxing unit bills you separately and each grants its own homestead exemption. Harris County bills six units before any city; Galveston bills three. This is where the money actually goes."
    >
      <div className="mb-5 grid grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:gap-6">
        <Stat
          label="Annual tax"
          value={formatUSD(propertyTax.annualTax)}
          sub={`${formatUSD(propertyTax.monthlyTax)} a month`}
        />
        <Stat
          label="Effective rate"
          value={formatPercent(propertyTax.effectiveRate, 2)}
          sub={`Down from ${formatPercent(propertyTax.combinedNominalRate, 2)} before exemptions`}
        />
        <Stat
          label="Homestead saves you"
          value={formatUSD(propertyTax.homesteadSavings)}
          tone="good"
          sub="Every year, for as long as you live there"
        />
      </div>

      <div className="md:hidden divide-y divide-ink-100">
        {propertyTax.lineItems.map((row) => (
          <div key={row.unit.id} className="py-3">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium leading-snug text-ink-800">
                  {row.unit.name}
                </div>
                <div className="mt-0.5 text-xs tabular-nums text-ink-500">
                  ${row.unit.ratePer100.toFixed(4)}/$100
                  {row.exemptionApplied > 0
                    ? ` · ${formatUSD(row.exemptionApplied)} exempt`
                    : ""}
                </div>
                {row.unit.note && (
                  <div className="mt-0.5 text-xs leading-relaxed text-ink-500">
                    {row.unit.note}
                  </div>
                )}
              </div>
              <div className="tnum shrink-0 text-sm font-medium text-ink-900">
                {formatUSD(row.annualTax)}
              </div>
            </div>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 pt-3 font-semibold">
          <span>Total</span>
          <span className="tnum">{formatUSD(propertyTax.annualTax)}</span>
        </div>
      </div>

      <div className="table-scroll hidden md:block">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500">
              <th className="pb-2 pr-3 font-semibold">Taxing unit</th>
              <th className="px-2 pb-2 text-right font-semibold">Rate</th>
              <th className="px-2 pb-2 text-right font-semibold">Exemption</th>
              <th className="px-2 pb-2 text-right font-semibold">Taxable</th>
              <th className="pb-2 pl-2 text-right font-semibold">Annual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {propertyTax.lineItems.map((row) => (
              <tr key={row.unit.id}>
                <td className="py-2 pr-3 align-top">
                  <div className="font-medium text-ink-800">{row.unit.name}</div>
                  {row.unit.note && (
                    <div className="mt-0.5 max-w-sm text-xs leading-relaxed text-ink-500">
                      {row.unit.note}
                    </div>
                  )}
                </td>
                <td className="tnum px-2 py-2 text-right align-top text-ink-600">
                  ${row.unit.ratePer100.toFixed(4)}
                </td>
                <td className="tnum px-2 py-2 text-right align-top text-ink-600">
                  {row.exemptionApplied > 0
                    ? formatUSD(row.exemptionApplied)
                    : "—"}
                </td>
                <td className="tnum px-2 py-2 text-right align-top text-ink-600">
                  {formatUSD(row.taxableValue)}
                </td>
                <td className="tnum py-2 pl-2 text-right align-top font-medium text-ink-900">
                  {formatUSD(row.annualTax)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-ink-200 font-semibold">
              <td className="pr-3 pt-3">Total</td>
              <td className="tnum px-2 pt-3 text-right">
                ${(propertyTax.combinedNominalRate * 100).toFixed(4)}
              </td>
              <td />
              <td />
              <td className="tnum pl-2 pt-3 text-right">
                {formatUSD(propertyTax.annualTax)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {!propertyTax.homesteadApplied && (
        <div className="mt-4">
          <Callout tone="bad" title="You are not claiming the homestead exemption">
            This is leaving {formatUSD(
              scenario.propertyTax.appraisedValue *
                propertyTax.combinedNominalRate -
                propertyTax.annualTax,
            )}{" "}
            or more on the table every year. File the application with the Fort
            Bend Central Appraisal District as soon as you close.
          </Callout>
        </div>
      )}
    </Card>
  );
}

export function Milestones({
  scenario,
  state,
}: {
  scenario: ScenarioResult;
  state: CalculatorState;
}) {
  const { amortization, program } = scenario;
  const horizonMonths = Math.min(
    state.horizonYears * 12,
    amortization.schedule.length,
  );
  const atHorizon = amortization.schedule[horizonMonths - 1];

  const miEnds = amortization.mortgageInsuranceEndsMonth;
  const miNeverEnds =
    miEnds != null && miEnds >= amortization.schedule.length;

  return (
    <Card
      title="How this plays out"
      subtitle={`Over the ${state.horizonYears} years you said you plan to stay.`}
    >
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={`Total cost over ${state.horizonYears}y`}
          value={formatUSD(scenario.totalCostOverHorizon)}
          sub="Cash to close, interest, mortgage insurance, taxes, insurance and HOA, less any tax credit"
        />
        <Stat
          label="Equity if you sold then"
          value={formatUSD(scenario.projectedEquityAtHorizon)}
          tone={scenario.projectedEquityAtHorizon > 0 ? "good" : "bad"}
          sub={`Assumes ${formatPercent(state.annualAppreciationRate, 1)} appreciation and 7% selling costs`}
        />
        <Stat
          label="Loan balance then"
          value={formatUSD(atHorizon?.closingBalance ?? 0)}
          sub={`${formatUSD(atHorizon?.cumulativePrincipal ?? 0)} of principal paid down`}
        />
        <Stat
          label="Interest paid by then"
          value={formatUSD(atHorizon?.cumulativeInterest ?? 0)}
        />
      </div>

      <div className="mt-6 space-y-3 border-t border-ink-200 pt-5">
        {program.mortgageInsuranceKind === "conventional-pmi" && (
          <>
            {scenario.pmiRequestMonth != null ? (
              <Callout tone="good" title="Your PMI is cancellable">
                You reach 80% loan-to-value in{" "}
                {monthsToYearsMonths(scenario.pmiRequestMonth)}, at which point
                you can ask your servicer in writing to remove PMI. If you do
                nothing, it comes off automatically at 78% in{" "}
                {monthsToYearsMonths(scenario.pmiAutomaticMonth ?? 0)}. Requesting
                it saves you{" "}
                {formatUSD(
                  scenario.monthly.mortgageInsurance *
                    ((scenario.pmiAutomaticMonth ?? 0) -
                      scenario.pmiRequestMonth),
                )}
                . An appraisal showing appreciation can get you there sooner.
              </Callout>
            ) : (
              <Callout tone="good">
                No mortgage insurance is required at this loan-to-value.
              </Callout>
            )}
          </>
        )}

        {program.mortgageInsuranceKind === "fha-mip" && (
          <Callout
            tone={miNeverEnds ? "bad" : "warn"}
            title={
              miNeverEnds
                ? "FHA mortgage insurance never comes off this loan"
                : "FHA mortgage insurance ends after 11 years"
            }
          >
            {miNeverEnds ? (
              <>
                You would pay{" "}
                {formatUSD(amortization.totalMortgageInsurance)} in mortgage
                insurance over the full term, and the only way out is
                refinancing into a conventional loan once you have 20% equity.
                Compare this carefully against a conventional 3% down option.
              </>
            ) : (
              <>
                Because you are putting at least 10% down, annual MIP drops off
                after 132 payments instead of running forever.
              </>
            )}
          </Callout>
        )}

        {program.mortgageInsuranceKind === "usda-fee" && (
          <Callout tone="neutral">
            The USDA annual fee of 0.35% runs for the life of the loan, but it is
            roughly a third of FHA&apos;s and well below PMI at this
            loan-to-value, so it is rarely worth refinancing away from.
          </Callout>
        )}

        {state.extraMonthlyPrincipal > 0 && (
          <Callout tone="good" title="Extra principal is working for you">
            Paying {formatUSD(state.extraMonthlyPrincipal)} extra each month pays
            the loan off in {monthsToYearsMonths(amortization.monthsToPayoff)}{" "}
            instead of {scenario.termMonths / 12} years, and saves you real
            interest.
          </Callout>
        )}
      </div>
    </Card>
  );
}

export function AffordabilityCard({
  affordability,
  state,
}: {
  affordability: AffordabilityResult;
  state: CalculatorState;
}) {
  const overBudget = state.purchasePrice > affordability.maxPurchasePrice;

  const constraintLabel = {
    "debt-to-income": "Your debt-to-income ratio",
    "cash-to-close": "Cash for closing",
    "loan-program-limit": "The loan program's limit",
    none: "Nothing",
  }[affordability.bindingConstraint];

  return (
    <Card
      title="What you can actually afford"
      subtitle="Solved against your income, your debts, your cash, and this location's real tax rate."
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:flex-wrap sm:items-end sm:gap-8">
        <Stat
          label="Maximum purchase price"
          value={formatUSD(affordability.maxPurchasePrice)}
          size="lg"
          tone={overBudget ? "warn" : "good"}
        />
        <Stat
          label="What limits you"
          value={constraintLabel}
          tone="neutral"
        />
      </div>

      <div className="mt-5">
        <Callout tone={overBudget ? "warn" : "neutral"}>
          {affordability.explanation}
        </Callout>
      </div>

      {overBudget && (
        <div className="mt-3">
          <Callout tone="warn" title="The house you entered is above that number">
            You are modeling a {formatUSD(state.purchasePrice)} home against a
            ceiling of {formatUSD(affordability.maxPurchasePrice)}. That gap is{" "}
            {formatUSD(state.purchasePrice - affordability.maxPurchasePrice)}. It
            is not necessarily fatal, since underwriters grant exceptions and
            assistance changes the math, but plan for it rather than hope.
          </Callout>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-ink-200 pt-5 sm:grid-cols-3">
        <Stat
          label="Front-end DTI"
          value={formatPercent(affordability.scenario.dti.frontEnd, 1)}
          sub="Housing payment as a share of gross income"
        />
        <Stat
          label="Back-end DTI"
          value={formatPercent(affordability.scenario.dti.backEnd, 1)}
          tone={
            affordability.scenario.dti.withinGuidelines ? "good" : "bad"
          }
          sub={`Guideline max ${formatPercent(affordability.scenario.dti.guidelineMax, 0)}`}
        />
        <Stat
          label="Gross monthly income"
          value={formatUSD(affordability.scenario.dti.grossMonthlyIncome)}
        />
      </div>
    </Card>
  );
}
