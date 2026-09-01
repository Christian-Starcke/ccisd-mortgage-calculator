import { ASSISTANCE_PROGRAMS } from "@/data/assistancePrograms";
import {
  resolveTaxingUnits,
  typicalHoaForLocation,
} from "@/data/fortBendTaxRates";
import { resolveUnitsFromCodes } from "@/lib/lookups/resolveCodes";
import {
  estimateHomeownersInsurance,
  type CalculatorState,
} from "./defaults";
import { LOAN_PROGRAMS } from "./loanPrograms";
import type { ScenarioOptions } from "./scenario";
import type { CalculatorInputs, LoanProgramId } from "./types";

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
  const fromCodes =
    parcel && parcel.taxUnitCodes.length > 0
      ? resolveUnitsFromCodes(parcel.taxUnitCodes, state.unknownRateOverrides)
      : null;

  const taxingUnits =
    fromCodes && fromCodes.units.length > 0
      ? fromCodes.units
      : resolveTaxingUnits(
          state.locationId,
          state.utilityDistrictId,
          state.manualUtilityRatePer100,
        );

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
      taxAppraisedValue:
        state.taxAppraisedValueOverride ??
        parcel?.totalValue ??
        state.purchasePrice,
      locationId: state.locationId,
      taxingUnits,
      claimHomestead: state.claimHomestead,
      annualHoaDues:
        state.hoaCertainty === "none"
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
      inFloodZone: state.inFloodZone,
      isNewConstruction: state.isNewConstruction,
      pidAnnualAssessment: state.pidAnnualAssessment,
      monthlyMudUtility: state.monthlyMudUtility,
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
