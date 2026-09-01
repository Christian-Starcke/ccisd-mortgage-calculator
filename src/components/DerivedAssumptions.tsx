"use client";

import {
  LOCATION_PRESETS,
  UTILITY_DISTRICTS,
  findLocationPreset,
  resolveAlternateDistrictUnits,
  resolveTaxingUnits,
} from "@/data/fortBendTaxRates";
import { FORT_BEND_TAX_UNIT_CODES } from "@/data/fortBendTaxUnitCodes";
import { ASSISTANCE_PROGRAMS } from "@/data/assistancePrograms";
import {
  DWELLING_COVERAGE_FRACTION,
  estimateHomeownersInsurance,
  PMMS_15_YEAR,
  PMMS_30_YEAR,
  PMMS_AS_OF,
  type CalculatorState,
  type UpdateState,
} from "@/lib/defaults";
import { formatUSD } from "@/lib/money";
import { calculatePropertyTax } from "@/lib/propertyTax";
import {
  Badge,
  Callout,
  Card,
  CurrencyInput,
  Disclosure,
  Field,
  NumberInput,
  PercentInput,
  Select,
  Slider,
  Toggle,
} from "./ui";

function districtRiskDelta(state: CalculatorState): number | null {
  const alternateUnits = resolveAlternateDistrictUnits(
    state.locationId,
    state.utilityDistrictId,
    state.manualUtilityRatePer100,
  );
  if (!alternateUnits) return null;

  const shared = {
    appraisedValue: state.taxAppraisedValueOverride ?? state.purchasePrice,
    claimHomestead: state.claimHomestead,
  };

  const expected = calculatePropertyTax({
    ...shared,
    units: resolveTaxingUnits(
      state.locationId,
      state.utilityDistrictId,
      state.manualUtilityRatePer100,
    ),
  });

  return (
    calculatePropertyTax({ ...shared, units: alternateUnits }).annualTax -
    expected.annualTax
  );
}

export function DerivedAssumptions({
  state,
  update,
}: {
  state: CalculatorState;
  update: UpdateState;
}) {
  const preset = findLocationPreset(state.locationId);
  const riskDelta = districtRiskDelta(state);
  const annualInsurance = estimateHomeownersInsurance(
    state.purchasePrice,
    state.insuranceRatePerThousand,
  );
  const parcel = state.resolvedParcel;
  const usedLookup = parcel != null;
  const missingCodes = parcel?.missingRateCodes ?? [];

  return (
    <Card
      title="What I filled in for you"
      subtitle="Every derived assumption, where it came from, and an override. Nothing here is locked."
    >
      <div className="space-y-2">
        <Disclosure
          summary="Location, tax districts and homestead"
          defaultOpen={!usedLookup || missingCodes.length > 0}
        >
          <div className="space-y-4 pt-1">
            {!usedLookup && (
              <Callout tone="neutral">
                No parcel is selected, so this uses the {preset.name} preset.
                Type an address above to replace the guess with the CAD record.
              </Callout>
            )}
            <Field
              label="Where in Fort Bend ISD"
              htmlFor="location"
              hint={usedLookup ? `Inferred from the parcel as ${preset.name}.` : preset.note}
            >
              <Select
                id="location"
                value={state.locationId}
                onChange={(value) => {
                  update("locationId", value);
                  const next = findLocationPreset(value);
                  update("utilityDistrictId", next.defaultUtilityDistrictId);
                  update("manualUtilityRatePer100", null);
                }}
                options={LOCATION_PRESETS.map((option) => ({
                  value: option.id,
                  label: option.name,
                }))}
              />
            </Field>

            {preset.districtRisk && riskDelta != null && !usedLookup && (
              <Callout tone="warn" title="Confirm the school district before you offer">
                <p>{preset.districtRisk.explanation}</p>
                <p className="mt-2">
                  If this address turns out to be{" "}
                  <strong>{preset.districtRisk.alternateName}</strong>, the tax
                  bill on a {formatUSD(state.purchasePrice, 0)} house{" "}
                  {riskDelta >= 0 ? "rises" : "falls"} by{" "}
                  <strong>{formatUSD(Math.abs(riskDelta), 0)} a year</strong>.
                </p>
                <a
                  href="https://www.fortbendisd.com/interactivemap"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs font-medium underline underline-offset-2"
                >
                  Check the Fort Bend ISD attendance map
                </a>
              </Callout>
            )}

            {!usedLookup && (
              <>
                <Field
                  label="MUD / LID utility district"
                  htmlFor="mud"
                  hint="Fallback when there is no parcel lookup. Prefer typing the address."
                >
                  <Select
                    id="mud"
                    value={state.utilityDistrictId}
                    onChange={(value) => {
                      update("utilityDistrictId", value);
                      update("manualUtilityRatePer100", null);
                    }}
                    options={UTILITY_DISTRICTS.map((unit) => ({
                      value: unit.id,
                      label:
                        unit.ratePer100 === 0
                          ? unit.name
                          : `${unit.name} — $${unit.ratePer100.toFixed(4)}`,
                    }))}
                  />
                </Field>
                <Field
                  label="Utility district rate per $100"
                  hint="Leave blank to use the dropdown. Required for private-collector districts."
                >
                  <PercentInput
                    value={(state.manualUtilityRatePer100 ?? 0) / 100}
                    onChange={(fraction) =>
                      update(
                        "manualUtilityRatePer100",
                        fraction === 0 ? null : fraction * 100,
                      )
                    }
                    max={3}
                    decimals={4}
                  />
                </Field>
              </>
            )}

            {missingCodes.map((code) => {
              const record = FORT_BEND_TAX_UNIT_CODES[code];
              return (
                <Field
                  key={code}
                  label={`${record?.name ?? code} rate per $100`}
                  hint="Private collector — enter the rate from the appraisal record."
                >
                  <PercentInput
                    value={(state.unknownRateOverrides[code] ?? 0) / 100}
                    onChange={(fraction) =>
                      update("unknownRateOverrides", {
                        ...state.unknownRateOverrides,
                        [code]: fraction * 100,
                      })
                    }
                    max={3}
                    decimals={4}
                  />
                </Field>
              );
            })}

            <Toggle
              checked={state.claimHomestead}
              onChange={(checked) => update("claimHomestead", checked)}
              label="I will file for the homestead exemption"
              hint="File it. It is free and in Fort Bend ISD it is worth thousands a year."
            />
            <Toggle
              checked={state.isNewConstruction}
              onChange={(checked) => update("isNewConstruction", checked)}
              label="New construction"
              hint="Turns on the promulgated owner's title premium for the buyer, which is the usual new-build custom."
            />
            <Field
              label="Tax appraised value"
              hint={
                parcel?.totalValue
                  ? `From the CAD record: ${formatUSD(parcel.totalValue, 0)}. The 10% homestead cap does not protect you until the second year after you buy.`
                  : "Leave at zero to use the listing price."
              }
            >
              <CurrencyInput
                value={state.taxAppraisedValueOverride ?? 0}
                onChange={(value) =>
                  update("taxAppraisedValueOverride", value === 0 ? null : value)
                }
                max={5_000_000}
              />
            </Field>
            <Field
              label="PID assessment per year"
              hint="A fixed dollar amount, not reduced by homestead. Leave at zero if none."
            >
              <CurrencyInput
                value={state.pidAnnualAssessment}
                onChange={(value) => update("pidAnnualAssessment", value)}
                max={20_000}
              />
            </Field>
            <Field
              label="MUD water bill per month"
              hint={
                parcel?.hasMud
                  ? "Separate from the MUD tax. Typical Fort Bend range is $80–$150."
                  : "Only applies if the parcel sits in a utility district."
              }
            >
              <CurrencyInput
                value={state.monthlyMudUtility}
                onChange={(value) => update("monthlyMudUtility", value)}
                max={500}
              />
            </Field>
          </div>
        </Disclosure>

        <Disclosure summary="Insurance and flood">
          <div className="space-y-4 pt-1">
            <Field
              label="Insurance per $1,000 of dwelling coverage"
              hint={`Dwelling coverage is modeled at ${Math.round(DWELLING_COVERAGE_FRACTION * 100)}% of price, so ${formatUSD(annualInsurance)} a year. Get a real quote.`}
            >
              <NumberInput
                value={state.insuranceRatePerThousand}
                onChange={(value) => update("insuranceRatePerThousand", value)}
                min={1}
                max={40}
              />
            </Field>
            <Toggle
              checked={state.inFloodZone}
              onChange={(checked) => {
                update("inFloodZone", checked);
                if (checked && state.annualFloodInsurance === 0) {
                  update("annualFloodInsurance", 1_200);
                }
              }}
              label="FEMA Special Flood Hazard Area"
              hint={
                parcel?.flood
                  ? `FEMA zone ${parcel.flood.zone ?? "unknown"}.`
                  : "Looked up from the parcel centroid when you pick an address."
              }
            />
            {state.inFloodZone && (
              <Field label="Flood insurance per year">
                <CurrencyInput
                  value={state.annualFloodInsurance}
                  onChange={(value) => update("annualFloodInsurance", value)}
                  max={20_000}
                />
              </Field>
            )}
          </div>
        </Disclosure>

        <Disclosure summary={`The loan · rate defaults to PMMS as of ${PMMS_AS_OF}`}>
          <div className="space-y-4 pt-1">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Interest rate">
                <PercentInput
                  value={state.interestRate}
                  onChange={(fraction) => update("interestRate", fraction)}
                  max={20}
                />
              </Field>
              <Field label="Loan term">
                <Select
                  value={String(state.termYears)}
                  onChange={(value) => {
                    const years = Number.parseInt(value, 10);
                    update("termYears", years);
                    if (years === 15 && state.interestRate === PMMS_30_YEAR) {
                      update("interestRate", PMMS_15_YEAR);
                    }
                    if (years === 30 && state.interestRate === PMMS_15_YEAR) {
                      update("interestRate", PMMS_30_YEAR);
                    }
                  }}
                  options={[
                    { value: "30", label: "30 years" },
                    { value: "20", label: "20 years" },
                    { value: "15", label: "15 years" },
                  ]}
                />
              </Field>
            </div>
            <Field
              label={`Down payment — ${(state.downPaymentFraction * 100).toFixed(1)}% (${formatUSD(state.purchasePrice * state.downPaymentFraction)})`}
            >
              <Slider
                value={state.downPaymentFraction * 100}
                onChange={(value) => update("downPaymentFraction", value / 100)}
                min={0}
                max={25}
                step={0.5}
                format={(value) => `${value}%`}
              />
            </Field>
            <Field label="Discount points">
              <NumberInput
                value={state.discountPoints}
                onChange={(value) => update("discountPoints", value)}
                min={0}
                max={5}
              />
            </Field>
            <Field label="Extra principal each month">
              <CurrencyInput
                value={state.extraMonthlyPrincipal}
                onChange={(value) => update("extraMonthlyPrincipal", value)}
                max={20_000}
              />
            </Field>
            <Field label="Override mortgage insurance rate">
              <PercentInput
                value={state.mortgageInsuranceRateOverride ?? 0}
                onChange={(fraction) =>
                  update(
                    "mortgageInsuranceRateOverride",
                    fraction === 0 ? null : fraction,
                  )
                }
                max={3}
              />
            </Field>
            <Field label="Expected closing date">
              <input
                type="date"
                className="text-input"
                value={state.closingDateIso}
                onChange={(event) =>
                  update("closingDateIso", event.target.value)
                }
              />
            </Field>
          </div>
        </Disclosure>

        <Disclosure summary="Help paying for it">
          <div className="space-y-4 pt-1">
            <div className="space-y-3">
              {ASSISTANCE_PROGRAMS.map((program) => (
                <label
                  key={program.id}
                  htmlFor={`assist-${program.id}`}
                  className="flex min-h-11 cursor-pointer gap-3 py-1"
                >
                  <input
                    id={`assist-${program.id}`}
                    type="checkbox"
                    className="mt-1 size-5 shrink-0 cursor-pointer rounded border-ink-300"
                    checked={state.selectedAssistanceIds.includes(program.id)}
                    onChange={(event) => {
                      update(
                        "selectedAssistanceIds",
                        event.target.checked
                          ? [...state.selectedAssistanceIds, program.id]
                          : state.selectedAssistanceIds.filter(
                              (id) => id !== program.id,
                            ),
                      );
                    }}
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium leading-snug text-ink-800">
                      <span>{program.name}</span>
                      {program.confidence === "verified" ? (
                        <Badge tone="good">Verified</Badge>
                      ) : (
                        <Badge tone="warn">Verify</Badge>
                      )}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-ink-500">
                      {program.administrator}
                      {program.ratePremium
                        ? ` · +${(program.ratePremium * 100).toFixed(2)}% rate`
                        : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className="grid gap-4 border-t border-ink-200 pt-4 sm:grid-cols-3">
              <Field label="Seller concessions">
                <CurrencyInput
                  value={state.sellerConcessions}
                  onChange={(value) => update("sellerConcessions", value)}
                  max={200_000}
                />
              </Field>
              <Field label="Lender credit">
                <CurrencyInput
                  value={state.lenderCredit}
                  onChange={(value) => update("lenderCredit", value)}
                  max={100_000}
                />
              </Field>
              <Field label="Gift funds">
                <CurrencyInput
                  value={state.giftFunds}
                  onChange={(value) => update("giftFunds", value)}
                  max={500_000}
                />
              </Field>
            </div>
          </div>
        </Disclosure>

        <Disclosure summary="Projection assumptions">
          <div className="space-y-4 pt-1">
            <Field
              label={`How long you plan to stay — ${state.horizonYears} years`}
            >
              <Slider
                value={state.horizonYears}
                onChange={(value) => update("horizonYears", value)}
                min={1}
                max={30}
                step={1}
                format={(value) => `${value}y`}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Home appreciation per year">
                <PercentInput
                  value={state.annualAppreciationRate}
                  onChange={(fraction) =>
                    update("annualAppreciationRate", fraction)
                  }
                  max={20}
                  decimals={1}
                />
              </Field>
              <Field label="Tax and insurance growth per year">
                <PercentInput
                  value={state.annualExpenseGrowthRate}
                  onChange={(fraction) =>
                    update("annualExpenseGrowthRate", fraction)
                  }
                  max={20}
                  decimals={1}
                />
              </Field>
            </div>
            <Field
              label="Area median income (100%)"
              hint={`HomeReady screens against 80% of this (${formatUSD((state.areaMedianIncome ?? 0) * 0.8, 0)}) and USDA against 115% (${formatUSD((state.areaMedianIncome ?? 0) * 1.15, 0)}).`}
            >
              <CurrencyInput
                value={state.areaMedianIncome ?? 0}
                onChange={(value) =>
                  update("areaMedianIncome", value === 0 ? null : value)
                }
                max={500_000}
              />
            </Field>
          </div>
        </Disclosure>
      </div>
    </Card>
  );
}
