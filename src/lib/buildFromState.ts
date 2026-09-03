import { ASSISTANCE_PROGRAMS } from "@/data/assistancePrograms";
import {
  resolveTaxingUnits,
  typicalHoaForLocation,
} from "@/data/clearCreekTaxRates";
import { resolveUnitsFromCodes } from "@/lib/lookups/resolveCodes";
import {
  DWELLING_COVERAGE_FRACTION,
  estimateHomeownersInsurance,
  type CalculatorState,
} from "./defaults";
import { estimateWindstormPremium } from "./windstorm";
import { LOAN_PROGRAMS } from "./loanPrograms";
import type { ScenarioOptions } from "./scenario";
import type { TaxUnitCodeRecord, TaxingUnit } from "./propertyTax";
import type { CalculatorInputs, LoanProgramId } from "./types";

/**
 * The taxing units the payment is billed from, and whether they came from the
 * parcel or from a location preset.
 *
 * The distinction matters to the UI, not just the engine. A resolved parcel is
 * not the same thing as a parcel that can be billed: a Harris account with no
 * row in the stored footprint is a real property that Clear Creek ISD does not
 * bill, so it resolves fine and carries no units at all, and the tax quietly
 * falls back to the preset. The UI used to gate its "these taxes are a location
 * guess" warning on whether a parcel existed, so in exactly that case it
 * suppressed the warning while the guess was still in force. Both sides now
 * read the same answer from here.
 *
 * The county has to travel with the codes: `S16` and `027` are both Clear Creek
 * ISD, and `M45` means one district in Galveston and nothing in Harris.
 */
export function resolveStateTaxUnits(state: CalculatorState): {
  units: TaxingUnit[];
  fromParcel: boolean;
  /**
   * Units on the parcel still carrying no rate, after the buyer's own entries.
   *
   * The parcel in state is a snapshot from the lookup, so its own
   * `missingRateCodes` never shrinks — the rate the buyer types is applied here
   * rather than re-fetched. Reading the snapshot left the risk card telling
   * them to go and enter a rate they had already entered, and asserting the
   * district was billing zero when it was not.
   */
  missingRateCodes: TaxUnitCodeRecord[];
} {
  const parcel = state.resolvedParcel;
  const fromCodes =
    parcel && parcel.taxUnitCodes.length > 0
      ? resolveUnitsFromCodes(
          parcel.ref.county,
          parcel.taxUnitCodes,
          state.unknownRateOverrides,
        )
      : null;

  if (fromCodes && fromCodes.units.length > 0) {
    return {
      units: fromCodes.units,
      fromParcel: true,
      missingRateCodes: fromCodes.missingRateCodes,
    };
  }
  return {
    units: resolveTaxingUnits(
      state.locationId,
      state.utilityDistrictId,
      state.manualUtilityRatePer100,
    ),
    fromParcel: false,
    // The presets carry published rates throughout, so there is nothing to ask.
    missingRateCodes: [],
  };
}

/**
 * Translates flat UI state into the structured inputs the calculation engine
 * expects. Keeping this as a pure function means the engine never has to know
 * anything about the shape of the form, and the form never has to know how the
 * engine models taxing units.
 */
export function buildCalculatorInputs(
  state: CalculatorState,
  programId: LoanProgramId = state.programId,
): CalculatorInputs {
  const parcel = state.resolvedParcel;
  const { units: taxingUnits } = resolveStateTaxUnits(state);

  /*
   * With no purchase price there is no purchase to model.
   *
   * Everything else in the payment scales off the price and falls to zero on
   * its own, but HOA dues, a PID assessment and a district water bill are flat
   * amounts — so clearing the price left a $67 monthly payment on screen for a
   * house costing nothing, which reads as a broken calculator rather than an
   * empty one.
   */
  const hasPrice = state.purchasePrice > 0;

  const program = LOAN_PROGRAMS[programId];
  const downPaymentFraction =
    programId === state.programId
      ? Math.max(state.downPaymentFraction, program.minDownPaymentFraction)
      : program.defaultDownPaymentFraction;

  return {
    buyer: {
      // DTI and AMI both use household income; annualIncome stays on state for
      // persistence but is kept in sync from the single household field.
      annualIncome: state.annualHouseholdIncome,
      annualHouseholdIncome: state.annualHouseholdIncome,
      householdSize: state.householdSize,
      creditScore: state.creditScore,
      monthlyDebtPayments: state.monthlyDebtPayments,
      cashAvailable: state.cashAvailable,
      firstTimeBuyer: state.firstTimeBuyer,
      isVeteran: state.isVeteran,
      vaFundingFeeExempt: state.vaFundingFeeExempt,
      texasHeroProfession: state.texasHeroProfession,
    },
    property: {
      purchasePrice: state.purchasePrice,
      // The roll is what gets billed this year, so it is the default. Asking
      // for the purchase price is an intent that follows the price, not a
      // snapshot of it.
      taxAppraisedValue: state.taxOnPurchasePrice
        ? state.purchasePrice
        : state.taxAppraisedValueOverride ??
          parcel?.totalValue ??
          state.purchasePrice,
      locationId: state.locationId,
      taxingUnits,
      claimHomestead: state.claimHomestead,
      annualHoaDues: !hasPrice
        ? 0
        : state.hoaCertainty === "none"
          ? 0
          : state.hoaCertainty === "unknown"
            ? typicalHoaForLocation(state.locationId).midpoint
            : state.annualHoaDues,
      hoaEstimated: state.hoaCertainty === "unknown",
      annualHomeownersInsurance: estimateHomeownersInsurance(
        state.purchasePrice,
        state.insuranceRatePerThousand,
      ),
      annualFloodInsurance: state.inFloodZone ? state.annualFloodInsurance : 0,
      annualWindstormInsurance: state.separateWindstormPolicy
        ? estimateWindstormPremium({
            purchasePrice: state.purchasePrice,
            dwellingCoverageFraction: DWELLING_COVERAGE_FRACTION,
            ratePerThousand: state.windstormRatePerThousand,
          })
        : 0,
      windExposure: state.separateWindstormPolicy
        ? state.windstormUncertain
          ? "boundary-uncertain"
          : "designated"
        : "inland",
      inFloodZone: state.inFloodZone,
      isNewConstruction: state.isNewConstruction,
      pidAnnualAssessment: hasPrice ? state.pidAnnualAssessment : 0,
      monthlyMudUtility: hasPrice ? state.monthlyMudUtility : 0,
    },
    loan: {
      programId,
      interestRate: state.interestRate,
      termYears: state.termYears,
      downPaymentFraction,
      mortgageInsuranceRateOverride: state.mortgageInsuranceRateOverride,
      discountPoints: state.discountPoints,
      extraMonthlyPrincipal: state.extraMonthlyPrincipal,
    },
    assistance: {
      selectedProgramIds: state.selectedAssistanceIds,
      sellerConcessions: state.sellerConcessions,
      lenderCredit: state.lenderCredit,
      giftFunds: state.giftFunds,
      useMortgageCreditCertificate:
        state.selectedAssistanceIds.includes("tsahc-mcc"),
    },
    annualAppreciationRate: state.annualAppreciationRate,
    annualExpenseGrowthRate: state.annualExpenseGrowthRate,
  };
}

export function buildScenarioOptions(
  state: CalculatorState,
): ScenarioOptions {
  return {
    closingDate: new Date(`${state.closingDateIso}T12:00:00`),
    horizonYears: state.horizonYears,
    assistancePrograms: ASSISTANCE_PROGRAMS,
    areaMedianIncome: state.areaMedianIncome,
    marginalTaxRate: state.marginalTaxRate,
  };
}
