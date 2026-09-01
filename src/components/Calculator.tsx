"use client";

import { useMemo } from "react";
import { buildCalculatorInputs, buildScenarioOptions } from "@/lib/buildFromState";
import { calculateAffordability } from "@/lib/affordability";
import {
  DEFAULT_STATE,
  STORAGE_KEY,
  estimateHomeownersInsurance,
  type CalculatorState,
} from "@/lib/defaults";
import { LOAN_PROGRAM_ORDER, checkEligibility } from "@/lib/loanPrograms";
import { formatUSD } from "@/lib/money";
import { buildScenario, type ScenarioResult } from "@/lib/scenario";
import {
  TAX_YEAR,
  findLocationPreset,
  presetCombinedRate,
  LOCATION_PRESETS,
} from "@/data/fortBendTaxRates";
import { InputPanel } from "./InputPanel";
import {
  AssistancePlaybook,
  ProgramComparison,
  ProgramRecommendation,
  SavingsPlaybook,
  type ProgramComparisonRow,
  type SavingsAction,
} from "./Comparison";
import {
  AffordabilityCard,
  CashToCloseCard,
  Milestones,
  PaymentSummary,
  TaxBreakdown,
} from "./Results";
import { usePersistentState } from "./ui";

export function Calculator() {
  const [state, setState] = usePersistentState<CalculatorState>(
    STORAGE_KEY,
    DEFAULT_STATE,
  );

  const update = <K extends keyof CalculatorState>(
    key: K,
    value: CalculatorState[K],
  ) => {
    setState((previous) => ({ ...previous, [key]: value }));
  };

  const { scenario, comparisonRows, affordability, savingsActions } = useMemo(
    () => derive(state),
    [state],
  );

  return (
    <div className="mx-auto max-w-[100rem] pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-[max(1.25rem,env(safe-area-inset-top,0px))] sm:pl-6 sm:pr-6 lg:pl-8 lg:pr-8 xl:pb-24">
      <a
        href="#results"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow-sm"
      >
        Skip to estimate
      </a>

      <Header state={state} scenario={scenario} />

      <div className="mt-6 grid gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <div
          id="inputs"
          className="scroll-mt-4 scroll-mb-28 pb-24 xl:pb-0 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto xl:overscroll-contain xl:pr-1"
        >
          <InputPanel
            state={state}
            update={update}
            onReset={() => setState(DEFAULT_STATE)}
          />
        </div>

        <div
          id="results"
          className="min-w-0 space-y-6 scroll-mt-4 scroll-mb-28"
        >
          <PaymentSummary scenario={scenario} />
          <ProgramRecommendation
            rows={comparisonRows}
            state={state}
            selectedId={state.programId}
            onSelect={(id) => update("programId", id)}
          />
          <CashToCloseCard scenario={scenario} />
          <SavingsPlaybook actions={savingsActions} />
          <ProgramComparison
            rows={comparisonRows}
            selectedId={state.programId}
            onSelect={(id) => update("programId", id)}
            state={state}
          />
          <AssistancePlaybook scenario={scenario} />
          <TaxBreakdown scenario={scenario} />
          <AffordabilityCard affordability={affordability} state={state} />
          <Milestones scenario={scenario} state={state} />
          <Sources />
        </div>
      </div>

      <MobileSummaryBar scenario={scenario} />
    </div>
  );
}

function Header({
  state,
  scenario,
}: {
  state: CalculatorState;
  scenario: ScenarioResult;
}) {
  const preset = findLocationPreset(state.locationId);

  return (
    <header className="border-b border-ink-200 pb-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:flex-wrap xl:items-end xl:justify-between xl:gap-x-8">
        <div className="min-w-0">
          <h1 className="text-pretty text-lg font-semibold tracking-tight text-ink-900 sm:text-2xl">
            Fort Bend ISD mortgage &amp; affordability calculator
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-pretty text-ink-500">
            {state.resolvedParcel && !state.resolvedParcel.isFortBendIsd
              ? `This parcel is billed by ${state.resolvedParcel.schoolName ?? "another school district"}, not Fort Bend ISD. Treat every number here as a warning, not a quote.`
              : `Built for a first-time buyer in ${preset?.name ?? "Fort Bend County"}, with the actual 2025 tax rates for every district that bills you, and every assistance program worth knowing about.`}
          </p>
        </div>
        <div className="hidden xl:flex xl:flex-wrap xl:items-end xl:gap-x-8 xl:gap-y-2 xl:text-sm">
          <div>
            <div className="field-label">Monthly</div>
            <div className="tnum text-lg font-semibold text-ink-900">
              {formatUSD(scenario.monthly.total)}
            </div>
          </div>
          <div>
            <div className="field-label">Cash to close</div>
            <div className="tnum text-lg font-semibold text-ink-900">
              {formatUSD(scenario.cashToClose.netCashDue)}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function Sources() {
  return (
    <section className="card p-4 sm:p-6">
      <h2 className="text-pretty text-base font-semibold tracking-tight text-ink-900">
        Where these numbers come from
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-500">
        Everything here is traceable. Tax rates are the adopted {TAX_YEAR} rates,
        which are the ones you will actually be billed for a {TAX_YEAR + 1}{" "}
        purchase until the new rates are set each September.
      </p>
      <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        {[
          [
            "Fort Bend County adopted tax rates",
            "https://www.fortbendcountytx.gov/government/departments/financial-administration/county-auditor/tax-rates",
          ],
          [
            "Fort Bend County Truth-in-Taxation rate portal",
            "https://taxrateinfo.fortbendcountytx.gov/",
          ],
          [
            "Fort Bend Central Appraisal District (exemptions, protests)",
            "https://www.fbcad.org/",
          ],
          [
            "Fort Bend ISD tax office",
            "https://www.fortbendisd.com/departments/business-and-finance/tax-office",
          ],
          [
            "FHFA 2026 conforming loan limits",
            "https://www.fhfa.gov/news/news-release/fhfa-announces-conforming-loan-limit-values-for-2026",
          ],
          [
            "FHA loan limit lookup",
            "https://entp.hud.gov/idapp/html/hicostlook.cfm",
          ],
          [
            "USDA property eligibility map",
            "https://eligibility.sc.egov.usda.gov/eligibility/welcomeAction.do",
          ],
          [
            "TDHCA My First Texas Home / My Choice Texas Home",
            "https://www.tdhca.texas.gov/homeownership-programs",
          ],
          [
            "TSAHC Homes for Texas Heroes / Home Sweet Texas",
            "https://www.tsahc.org/homebuyers/loans-down-payment-assistance",
          ],
          [
            "Freddie Mac Primary Mortgage Market Survey",
            "https://www.freddiemac.com/pmms",
          ],
          [
            "Texas Department of Insurance rate comparison",
            "https://www.tdi.texas.gov/consumer/homeowners-insurance.html",
          ],
        ].map(([label, url]) => (
          <li key={url}>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center py-1 text-brand-600 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-600"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MobileSummaryBar({ scenario }: { scenario: ScenarioResult }) {
  return (
    <nav
      aria-label="Key numbers"
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white/95 backdrop-blur-md xl:hidden"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="mx-auto flex max-w-[100rem] items-center gap-3 py-2 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]">
        <a href="#results" className="min-w-0 flex-1">
          <div className="field-label !mb-0">Monthly</div>
          <div className="tnum truncate text-base font-semibold text-ink-900">
            {formatUSD(scenario.monthly.total)}
          </div>
        </a>
        <a href="#results" className="min-w-0 flex-1">
          <div className="field-label !mb-0">Cash to close</div>
          <div className="tnum truncate text-base font-semibold text-ink-900">
            {formatUSD(scenario.cashToClose.netCashDue)}
          </div>
        </a>
        <a
          href="#inputs"
          className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-ink-300 px-3 text-sm font-medium text-ink-700 hover:bg-ink-50"
        >
          Edit
        </a>
      </div>
    </nav>
  );
}

/**
 * Runs the engine once for the selected program, once for every other program so
 * they can be compared at the same price, and once as an affordability solve.
 * Nine scenario builds plus a binary search is a few milliseconds, so there is
 * no reason to be clever about caching any of it.
 */
function derive(state: CalculatorState) {
  const options = buildScenarioOptions(state);
  const inputs = buildCalculatorInputs(state);
  const scenario = buildScenario(inputs, options);

  const comparisonRows: ProgramComparisonRow[] = LOAN_PROGRAM_ORDER.map(
    (programId) => {
      const programInputs = buildCalculatorInputs(state, programId);
      const programScenario = buildScenario(programInputs, options);

      return {
        scenario: programScenario,
        eligibility: checkEligibility({
          program: programScenario.program,
          buyer: programInputs.buyer,
          property: programInputs.property,
          areaMedianIncome: state.areaMedianIncome,
          usdaAddressConfirmed: state.usdaAddressConfirmed,
          loanAmount: programScenario.baseLoanAmount,
        }),
      };
    },
  );

  const affordability = calculateAffordability(inputs, options);

  return {
    scenario,
    comparisonRows,
    affordability,
    savingsActions: buildSavingsActions({
      state,
      scenario,
      comparisonRows,
    }),
  };
}

/**
 * Turns the computed scenarios into a ranked list of concrete moves.
 *
 * The ordering is by dollars saved rather than by ease, because a buyer trying to
 * minimize cost should see the biggest lever first even when it is the hardest
 * one. Every item has to be specific enough to act on: "shop your rate" is
 * useless, "each 0.25% off the rate is $63 a month" is not.
 */
function buildSavingsActions({
  state,
  scenario,
  comparisonRows,
}: {
  state: CalculatorState;
  scenario: ScenarioResult;
  comparisonRows: ProgramComparisonRow[];
}): SavingsAction[] {
  const actions: SavingsAction[] = [];
  const horizon = state.horizonYears;

  // --- A cheaper loan program --------------------------------------------
  const eligibleAlternatives = comparisonRows.filter(
    (row) =>
      row.eligibility.status !== "ineligible" &&
      row.scenario.program.id !== scenario.program.id &&
      // Only suggest programs that do not demand more cash than they save.
      row.scenario.cashToClose.netCashDue <= state.cashAvailable,
  );

  const bestAlternative = eligibleAlternatives.reduce<
    ProgramComparisonRow | null
  >(
    (best, row) =>
      best == null ||
      row.scenario.totalCostOverHorizon < best.scenario.totalCostOverHorizon
        ? row
        : best,
    null,
  );

  if (
    bestAlternative &&
    bestAlternative.scenario.totalCostOverHorizon <
      scenario.totalCostOverHorizon - 1_000
  ) {
    const saving =
      scenario.totalCostOverHorizon -
      bestAlternative.scenario.totalCostOverHorizon;
    const monthlyDelta =
      scenario.monthly.total - bestAlternative.scenario.monthly.total;

    actions.push({
      title: `Switch to ${bestAlternative.scenario.program.shortName}`,
      detail: `Over ${horizon} years this is ${formatUSD(saving)} cheaper than ${scenario.program.shortName}, and ${
        monthlyDelta > 0
          ? `${formatUSD(monthlyDelta)} less each month`
          : `${formatUSD(-monthlyDelta)} more each month but far cheaper overall`
      }. ${
        bestAlternative.eligibility.checks.length > 0
          ? `You will need to confirm: ${bestAlternative.eligibility.checks
              .join(" ")
              .toLowerCase()}`
          : ""
      }`,
      value: saving,
      effort: "decision",
    });
  }

  // --- Unclaimed assistance ----------------------------------------------
  const acceptedIds = new Set(
    scenario.assistance.accepted.map((ev) => ev.program.id),
  );
  const unusedAssistance = scenario.assistance.evaluations
    .filter((ev) => ev.eligible && !acceptedIds.has(ev.program.id))
    .sort(
      (a, b) =>
        b.potentialAward.fundsAtClosing +
        b.potentialAward.annualTaxCredit * horizon -
        (a.potentialAward.fundsAtClosing +
          a.potentialAward.annualTaxCredit * horizon),
    );

  for (const evaluation of unusedAssistance.slice(0, 3)) {
    const { program, potentialAward } = evaluation;
    const value =
      potentialAward.fundsAtClosing +
      potentialAward.annualTaxCredit * horizon;
    if (value < 500) continue;

    actions.push({
      title: `Apply for ${program.name}`,
      detail:
        program.kind === "tax-credit"
          ? `Worth about ${formatUSD(potentialAward.annualTaxCredit)} a year off your federal tax bill for as long as you keep the loan, so roughly ${formatUSD(value)} over ${horizon} years. It has to be applied for before closing; it cannot be added afterward.`
          : `${formatUSD(potentialAward.fundsAtClosing)} toward your down payment and closing costs, ${
              program.kind === "grant"
                ? "never repaid"
                : program.kind === "forgivable-second"
                  ? `forgiven after ${program.forgivenessYears} years in the home`
                  : "repaid when you sell or refinance"
            }. ${program.summary}`,
      value,
      effort: "paperwork",
    });
  }

  // --- Homestead exemption ------------------------------------------------
  if (!state.claimHomestead) {
    const withoutExemption =
      scenario.propertyTax.appraisedValue *
      scenario.propertyTax.combinedNominalRate;
    const saving = withoutExemption - scenario.propertyTax.annualTax;
    actions.push({
      title: "File your homestead exemption",
      detail: `You are not claiming it. Filing with the Fort Bend Central Appraisal District is free, takes one form, and cuts your tax bill permanently. It also caps your appraised value increases at 10% a year, which matters more than the exemption itself over time.`,
      value: saving * horizon,
      valueLabel: `${formatUSD(saving)}/yr`,
      effort: "paperwork",
    });
  }

  // --- Seller concessions -------------------------------------------------
  const concessionHeadroom =
    scenario.maxSellerConcessionAllowed - scenario.usableSellerConcessions;
  const closingCostsPayableBySeller = Math.min(
    concessionHeadroom,
    scenario.closingCosts.grandTotal,
  );
  if (closingCostsPayableBySeller > 1_000) {
    actions.push({
      title: "Ask the seller to pay your closing costs",
      detail: `${scenario.program.shortName} lets the seller contribute up to ${formatUSD(scenario.maxSellerConcessionAllowed)} on this purchase, and you are currently using ${formatUSD(scenario.usableSellerConcessions)}. In a market with inventory, offering full price with ${formatUSD(closingCostsPayableBySeller)} in seller-paid costs usually nets the seller the same money while cutting your cash at closing dollar for dollar. This is the single most reliable way to reduce what you bring to the table.`,
      value: closingCostsPayableBySeller,
      effort: "negotiate",
    });
  }

  // --- Tax protest --------------------------------------------------------
  if (scenario.propertyTax.annualTax > 0) {
    const protestSaving = scenario.propertyTax.annualTax * 0.07;
    actions.push({
      title: "Protest your appraised value every single year",
      detail: `Fort Bend appraisals are formula-driven and routinely high. A protest is free, can be filed online through the appraisal district, and a 7% reduction is a common outcome with basic comparable sales. On your bill that is about ${formatUSD(protestSaving)} a year, compounding as values rise. The deadline is May 15 or 30 days after your notice, whichever is later.`,
      value: protestSaving * horizon,
      valueLabel: `${formatUSD(protestSaving)}/yr`,
      effort: "paperwork",
    });
  }

  // --- Rate shopping ------------------------------------------------------
  const rateShoppingSaving = estimateRateShoppingSaving(scenario);
  if (rateShoppingSaving.monthly > 5) {
    actions.push({
      title: "Get quotes from at least three lenders in the same week",
      detail: `A 0.25% lower rate on this loan is ${formatUSD(rateShoppingSaving.monthly)} a month and ${formatUSD(rateShoppingSaving.overHorizon)} over ${horizon} years. Credit bureaus treat all mortgage inquiries inside a 45-day window as one, so shopping does not hurt your score. Ask each lender for a Loan Estimate rather than a verbal quote, and compare page two line by line, because the rate is only half the cost.`,
      value: rateShoppingSaving.overHorizon,
      effort: "call",
    });
  }

  // --- Insurance shopping -------------------------------------------------
  const insuranceSaving =
    estimateHomeownersInsurance(
      state.purchasePrice,
      state.insuranceRatePerThousand,
    ) * 0.25;
  if (insuranceSaving > 100) {
    actions.push({
      title: "Shop homeowners insurance before you lock, not after",
      detail: `Houston-area premiums vary by more than 50% between carriers for identical coverage, and your lender will escrow whatever you pick. Trimming 25% off the default assumption here is ${formatUSD(insuranceSaving)} a year and ${formatUSD(insuranceSaving / 12)} a month of qualifying room. Get quotes before your rate lock so the number in your escrow is real.`,
      value: insuranceSaving * horizon,
      valueLabel: `${formatUSD(insuranceSaving)}/yr`,
      effort: "call",
    });
  }

  // --- Debt paydown -------------------------------------------------------
  if (!scenario.dti.withinGuidelines && state.monthlyDebtPayments > 0) {
    actions.push({
      title: "Pay off or pay down your smallest monthly obligation",
      detail: `Your back-end debt-to-income is ${(scenario.dti.backEnd * 100).toFixed(1)}% against a ${(scenario.dti.guidelineMax * 100).toFixed(0)}% ceiling. Underwriting looks at the minimum monthly payment, not the balance, so retiring a small loan with a big payment helps far more than shaving a large balance. Every $100 of monthly payment you eliminate buys roughly $15,000 to $18,000 of purchase price.`,
      value: null,
      effort: "decision",
    });
  }

  // --- MUD district awareness --------------------------------------------
  const mudUnit = scenario.propertyTax.lineItems.find((row) =>
    /MUD|LID|utility/i.test(row.unit.name),
  );
  if (mudUnit && mudUnit.annualTax > 1_000) {
    const cheapestRate = Math.min(
      ...LOCATION_PRESETS.map((preset) => presetCombinedRate(preset)),
    );
    const rateDelta =
      scenario.propertyTax.combinedNominalRate - cheapestRate;

    actions.push({
      title: "Know what the MUD is costing you before you fall in love",
      detail: `${mudUnit.unit.name} adds ${formatUSD(mudUnit.annualTax)} a year to this house, which is ${formatUSD(mudUnit.annualTax / 12)} a month of payment that buys you no equity. ${
        rateDelta > 0.001
          ? `Two otherwise identical houses in different districts here can differ by ${formatUSD(state.purchasePrice * rateDelta)} a year in tax. Check the district on every listing before you tour it.`
          : "MUD rates typically decline as district debt is retired, so ask for the district's current debt service schedule."
      }`,
      value: mudUnit.annualTax * horizon,
      valueLabel: `${formatUSD(mudUnit.annualTax)}/yr`,
      effort: "decision",
    });
  }

  // --- PMI removal --------------------------------------------------------
  if (
    scenario.pmiRequestMonth != null &&
    scenario.pmiAutomaticMonth != null &&
    scenario.monthly.mortgageInsurance > 0
  ) {
    const saving =
      scenario.monthly.mortgageInsurance *
      (scenario.pmiAutomaticMonth - scenario.pmiRequestMonth);
    if (saving > 200) {
      actions.push({
        title: "Put a calendar reminder to cancel PMI",
        detail: `Your PMI is ${formatUSD(scenario.monthly.mortgageInsurance)} a month and it does not fall off by itself until month ${scenario.pmiAutomaticMonth}. You can request removal in writing at month ${scenario.pmiRequestMonth}, when you hit 80% loan-to-value. Requesting instead of waiting saves ${formatUSD(saving)}. If values rise, paying for an appraisal to prove 80% gets you there sooner and almost always pays for itself.`,
        value: saving,
        effort: "call",
      });
    }
  }

  return actions
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 8);
}

function estimateRateShoppingSaving(scenario: ScenarioResult): {
  monthly: number;
  overHorizon: number;
} {
  const { totalLoanAmount, interestRate, termMonths, horizonYears } = scenario;

  const payment = (rate: number) => {
    const monthlyRate = rate / 12;
    if (monthlyRate === 0) return totalLoanAmount / termMonths;
    const growth = Math.pow(1 + monthlyRate, termMonths);
    return (totalLoanAmount * monthlyRate * growth) / (growth - 1);
  };

  const monthly = payment(interestRate) - payment(Math.max(0, interestRate - 0.0025));

  return {
    monthly,
    overHorizon: monthly * horizonYears * 12,
  };
}
