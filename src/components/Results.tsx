"use client";

import { formatPercent, formatUSD } from "@/lib/money";
import type { ScenarioResult } from "@/lib/scenario";
import type { AffordabilityResult } from "@/lib/affordability";
import type { CalculatorState } from "@/lib/defaults";
import type { WaterServiceAssessment } from "@/lib/waterService";
import {
  districtWaterBillFor,
  type HouseholdUtilities,
} from "@/lib/householdUtilities";
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
                ? // A card rate for this LTV and score band, not a quote. The
                  // real one is priced per borrower and comes in higher at
                  // least as often as it comes in lower, so say so rather than
                  // let a two-decimal figure imply precision it does not have.
                  `${formatPercent(scenario.pmiQuote.annualRate, 2)} a year — typical for this credit score and loan-to-value, but your quote is priced individually and can come in higher${
                    scenario.pmiQuote.reducedCoverage
                      ? ", and this is at the reduced coverage level"
                      : ""
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
      title="The most a lender would approve"
      subtitle="Solved against your income, your debts, your cash, and this location's real tax rate. This is a ceiling, not a budget — see below."
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:flex-wrap sm:items-end sm:gap-8">
        <Stat
          label="Underwriting ceiling"
          value={formatUSD(affordability.maxPurchasePrice)}
          size="lg"
          tone={overBudget ? "warn" : "neutral"}
        />
        <Stat
          label="What limits you"
          value={constraintLabel}
          tone="neutral"
        />
      </div>

      <div className="mt-5 space-y-3">
        <Callout tone={overBudget ? "warn" : "neutral"}>
          {affordability.explanation}
        </Callout>

        {/*
          The number above is what an underwriter would sign off on at the
          program's maximum debt-to-income ratio. That is a limit, not a
          recommendation, and at the top of it housing eats a share of gross
          income most people would not choose deliberately. Showing the share
          is the only way to make the distinction concrete.
        */}
        <Callout tone="warn" title="This is a ceiling, not a budget">
          At {formatUSD(affordability.maxPurchasePrice)} the payment is{" "}
          {formatUSD(affordability.scenario.monthly.total)} a month, which is{" "}
          {formatPercent(
            affordability.scenario.monthly.total /
              Math.max(state.annualHouseholdIncome / 12, 1),
            0,
          )}{" "}
          of your gross monthly income — solved to a{" "}
          {formatPercent(affordability.targetBackEndDti, 0)} debt-to-income
          ratio, which is the program maximum rather than a comfortable
          target. Plenty of buyers who qualify at this number regret it. Treat
          it as the edge of what is possible and pick your own budget below it.
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

/**
 * Who supplies the water, and what that costs.
 *
 * Given its own card rather than buried in the tax breakdown because it is
 * the biggest driver of monthly cost that a listing never states. A buyer
 * comparing two houses at the same price in the same school district has no
 * way to see that one of them carries a utility district and the other does
 * not — and that difference can be over $300 a month.
 */
export function WaterServiceCard({
  water,
  scenario,
  hasParcel,
}: {
  water: WaterServiceAssessment;
  scenario: ScenarioResult;
  hasParcel: boolean;
}) {
  const { service } = water;
  // Says whether the water bill above is this district's own published figure
  // or the generic placeholder, which is a meaningful difference: CLCWA's real
  // bill is a third of the placeholder.
  const districtBill = districtWaterBillFor(water.districts);

  const heading =
    service === "district"
      ? "This property is in a utility district"
      : service === "city"
        ? "This property is city-served"
        : "Water service unknown";

  const tone = service === "district" ? "warn" : service === "city" ? "good" : "bad";

  return (
    <Card
      title="Water and sewer"
      subtitle="The largest cost a listing never tells you. A utility district charges its own property tax and bills water separately; a city does neither."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{heading}</Badge>
        {service === "district" && water.combinedRatePer100 > 0 && (
          <Badge tone="neutral">
            {water.combinedRatePer100.toFixed(4)} per $100
          </Badge>
        )}
      </div>

      {service === "district" && (
        <>
          <div className="mt-4 divide-y divide-ink-100">
            {water.districts.map((unit) => (
              <LineItem
                key={unit.id}
                label={unit.name}
                amount={formatUSD(
                  scenario.propertyTax.lineItems.find(
                    (row) => row.unit.id === unit.id,
                  )?.annualTax ?? 0,
                )}
                note={`${unit.ratePer100.toFixed(4)} per $100 a year${
                  unit.homesteadPercentExemption || unit.homesteadFlatExemption
                    ? ""
                    : " · grants no homestead exemption"
                }`}
              />
            ))}
            <LineItem
              label="District property tax, monthly"
              amount={formatUSD(water.monthlyDistrictTax)}
            />
            <LineItem
              label="District water and sewer bill, monthly"
              amount={formatUSD(water.monthlyWaterBill)}
              note={
                districtBill?.sourced
                  ? `Billed by ${districtBill.providerName} on its own published schedule, not by the city.`
                  : "Billed by the district, not the city. Estimated — each district publishes its own schedule, and the spread between them is wide."
              }
            />
            <LineItem
              label="What the district costs you every month"
              amount={formatUSD(water.monthlyTotal)}
              emphasis
            />
          </div>

          <div className="mt-4 space-y-3">
            <Callout tone="warn" title="It costs you again at closing">
              The lender escrows{" "}
              {scenario.closingCosts.taxEscrowMonths} months of property tax up
              front, so this district adds{" "}
              {formatUSD(water.districtTaxAtClosing)} to your cash to close on
              top of {formatUSD(water.monthlyTotal)} a month. A higher tax bill
              hits twice, and the second hit is what pushes some buyers from
              being limited by income to being limited by cash.
            </Callout>

            <Callout tone="neutral" title="What it would cost without one">
              An otherwise identical house on city water would pay{" "}
              {formatUSD(scenario.monthly.total - water.monthlyTotal)} a month
              instead of {formatUSD(scenario.monthly.total)} — the district is{" "}
              {formatPercent(
                water.monthlyTotal / Math.max(scenario.monthly.total, 1),
                0,
              )}{" "}
              of your payment and{" "}
              {formatPercent(water.shareOfTaxBill, 0)} of your tax bill. This is
              usually the single biggest difference between two houses at the
              same price in the same school district, and it is not on either
              listing.
            </Callout>
          </div>
        </>
      )}

      {service === "city" && (
        <div className="mt-4">
          <Callout tone="good">
            No utility district bills this parcel, so there is no district
            property tax and no separate district water bill — the city
            supplies water and charges for it on its own account, which is not
            escrowed into your mortgage payment. Compared with an otherwise
            identical house in a utility district, this typically saves $150 to
            $350 a month plus a year of the district&apos;s tax at closing.
          </Callout>
        </div>
      )}

      {service === "unknown" && (
        <div className="mt-4">
          <Callout tone="bad">
            {water.unknownRateDistricts.length > 0
              ? `${water.unknownRateDistricts
                  .map((r) => r.name)
                  .join(", ")} bills this parcel, but the county publishes no rate for it — it is collected privately. Enter the rate from the appraisal record under More options, because a district left at zero is the largest possible understatement of this payment.`
              : hasParcel
                ? "The parcel record did not resolve a water provider. Check the appraisal record before trusting the payment."
                : "Pick the parcel above. Until then this uses whatever the location preset assumes, and a district is worth $150 to $350 a month — far too much to guess at."}
          </Callout>
        </div>
      )}
    </Card>
  );
}

/**
 * The cost of running the house, kept beside the payment rather than inside it.
 *
 * The separation is the point. A lender counts none of this, escrows none of
 * it, and none of it belongs in a debt-to-income ratio — but all of it comes
 * out of the same paycheque, and a buyer who budgets only the mortgage payment
 * is short by the better part of $400 a month.
 */
export function HouseholdUtilitiesCard({
  utilities,
  scenario,
}: {
  utilities: HouseholdUtilities;
  scenario: ScenarioResult;
}) {
  const confidenceNote: Record<string, string> = {
    sourced: "From the provider's own published rates",
    estimated: "Regional estimate — not this provider's own schedule",
    ask: "Depends on you — set it to your own",
  };

  const grandTotal = scenario.monthly.total + utilities.monthlyTotal;
  const peakTotal = scenario.monthly.total + utilities.peakMonthlyTotal;

  return (
    <Card
      title="What it costs to run the house"
      subtitle="Utilities are not part of the mortgage payment, are not escrowed, and are not counted in your debt-to-income ratio — but they come out of the same paycheque. Estimated separately so neither number misleads you."
    >
      {utilities.providerName && (
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">Supplied by {utilities.providerName}</Badge>
        </div>
      )}

      <div className="mt-4 divide-y divide-ink-100">
        {utilities.items.map((item) => (
          <LineItem
            key={item.id}
            label={item.label}
            amount={formatUSD(item.monthly)}
            note={
              <>
                {item.basis}
                {item.seasonal && (
                  <>
                    {" "}
                    Ranges {formatUSD(item.seasonal.low)} to{" "}
                    {formatUSD(item.seasonal.high)} across the year.{" "}
                    {item.seasonal.note}
                  </>
                )}
                {item.confidence !== "sourced" && (
                  <> ({confidenceNote[item.confidence]}.)</>
                )}
              </>
            }
          />
        ))}
        <LineItem
          label="Utilities, monthly"
          amount={formatUSD(utilities.monthlyTotal)}
          emphasis
        />
      </div>

      <div className="mt-5 divide-y divide-ink-100 border-t border-ink-200 pt-1">
        <LineItem
          label="Mortgage payment"
          amount={formatUSD(scenario.monthly.total)}
          note="Principal, interest, taxes, insurance, mortgage insurance and HOA — the number a lender underwrites."
        />
        <LineItem
          label="Utilities"
          amount={formatUSD(utilities.monthlyTotal)}
        />
        <LineItem
          label="What living here actually costs"
          amount={formatUSD(grandTotal)}
          emphasis
        />
      </div>

      <div className="mt-4 space-y-3">
        <Callout tone="warn" title="August is not the average">
          Air conditioning makes summer the expensive half of the year here. In
          the peak month this basket runs about{" "}
          {formatUSD(utilities.peakMonthlyTotal)} rather than{" "}
          {formatUSD(utilities.monthlyTotal)}, putting the all-in cost near{" "}
          {formatUSD(peakTotal)}. Budget on the annual figure, but have the
          summer number in mind before your first July.
        </Callout>

        <Callout tone="neutral" title="Still not counted">
          <ul className="list-disc space-y-1 pl-4">
            {utilities.notIncluded.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Callout>
      </div>
    </Card>
  );
}
