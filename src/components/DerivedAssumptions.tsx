"use client";

import {
  LOCATION_PRESETS,
  findLocationPreset,
  resolveAlternateDistrictUnits,
  resolveTaxingUnits,
  utilityDistrictsForLocation,
} from "@/data/clearCreekTaxRates";
import { resolveStateTaxUnits } from "@/lib/buildFromState";
import { applyWindExposure, windExposureFor } from "@/lib/windExposureState";
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
  estimateWindstormPremium,
  HOMEOWNERS_RATE_PER_THOUSAND,
} from "@/lib/windstorm";
import {
  CENTERPOINT_COMMODITY_PER_CCF,
  CENTERPOINT_CUSTOMER_CHARGE,
} from "@/lib/householdUtilities";
import {
  Callout,
  Card,
  CentsInput,
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
  /*
   * Whether the parcel is actually billing the tax, which is not the same as
   * whether a parcel is selected — see `resolveStateTaxUnits`. Every use below
   * is about the tax section, so they all want this rather than `parcel != null`.
   */
  const usedLookup = resolveStateTaxUnits(state).fromParcel;
  /*
   * Every unit that arrived without a rate keeps its field, including ones the
   * buyer has since priced — the field is how they change it, so driving it off
   * the live list would make it disappear the moment it took effect.
   */
  const missingCodes = parcel?.missingRateCodes ?? [];
  // Exposure comes from the parcel when there is one, and from the location
  // preset otherwise, so the hint text is right before an address is typed.
  const windstorm = windExposureFor({ parcel, locationId: state.locationId });
  const annualWindstorm = estimateWindstormPremium({
    purchasePrice: state.purchasePrice,
    dwellingCoverageFraction: DWELLING_COVERAGE_FRACTION,
    ratePerThousand: state.windstormRatePerThousand,
  });

  return (
    <Card
      title="More options"
      subtitle="Overrides for tax districts, insurance, rate, cash help, and projections."
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
              label="Where in Clear Creek ISD"
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
                  /*
                   * Location carries the county and the city, so with no
                   * parcel it decides wind exposure — and with it both
                   * insurance rates. Leaving a League City windstorm premium
                   * on a Webster address would overstate the payment by about
                   * $200 a month.
                   *
                   * With a parcel it decides nothing: the parcel's own county
                   * and taxing units are the better evidence, and letting this
                   * dropdown override them silently dropped a mandatory
                   * windstorm premium on Galveston parcels.
                   */
                  applyWindExposure(update, {
                    parcel: state.resolvedParcel,
                    locationId: value,
                  });
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
                  href="https://www.ccisd.net/district-map"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs font-medium underline underline-offset-2"
                >
                  Check the CCISD school finder
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
                    options={utilityDistrictsForLocation(state.locationId).map((unit) => ({
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
                  htmlFor="utility-rate"
                  hint="Leave blank to use the dropdown. Required for private-collector districts."
                >
                  <PercentInput
                    id="utility-rate"
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

            {missingCodes.map((record) => {
              const code = record.code;
              return (
                <Field
                  key={code}
                  label={`${record.name} rate per $100`}
                  htmlFor={`rate-${code}`}
                  hint="Private collector — enter the rate from the appraisal record."
                >
                  <PercentInput
                    id={`rate-${code}`}
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
              hint="File it. It is free and in Clear Creek ISD it is worth thousands a year."
            />
            <Toggle
              checked={state.isNewConstruction}
              onChange={(checked) => update("isNewConstruction", checked)}
              label="New construction"
              hint="Turns on the promulgated owner's title premium for the buyer, which is the usual new-build custom."
            />
            <Toggle
              checked={state.taxOnPurchasePrice}
              onChange={(checked) => update("taxOnPurchasePrice", checked)}
              label="Bill the tax at the purchase price"
              hint={
                state.taxOnPurchasePrice
                  ? "On: the tax follows your price, which is roughly what the district will reassess to for the next tax year. Turn it off to see the bill you will actually get this year."
                  : "Off: the tax uses the appraisal roll, which is what will be billed this year. Turn it on to see the steady state after the district reassesses."
              }
            />
            <Field
              label="Tax appraised value"
              htmlFor="appraised-value"
              hint={
                parcel?.totalValue
                  ? `From the CAD record: ${formatUSD(parcel.totalValue, 0)}. The 10% homestead cap does not protect you until the second year after you buy.`
                  : "Leave at zero to use the listing price."
              }
            >
              <CurrencyInput
                id="appraised-value"
                value={state.taxAppraisedValueOverride ?? 0}
                onChange={(value) =>
                  update("taxAppraisedValueOverride", value === 0 ? null : value)
                }
                max={5_000_000}
              />
            </Field>
            <Field
              label="PID assessment per year"
              htmlFor="pid-assessment"
              hint="A fixed dollar amount, not reduced by homestead. Leave at zero if none."
            >
              <CurrencyInput
                id="pid-assessment"
                value={state.pidAnnualAssessment}
                onChange={(value) => update("pidAnnualAssessment", value)}
                max={20_000}
              />
            </Field>
            <Field
              label="Utility district water bill per month"
              htmlFor="mud-water"
              hint={
                parcel?.hasUtilityDistrict
                  ? "Separate from the district's property tax. Typical range here is $60–$120."
                  : "Only applies if the parcel sits in a utility district."
              }
            >
              <CurrencyInput
                id="mud-water"
                value={state.monthlyMudUtility}
                onChange={(value) => update("monthlyMudUtility", value)}
                max={500}
              />
            </Field>
          </div>
        </Disclosure>

        <Disclosure summary="Running the house · utilities">
          <div className="space-y-4 pt-1">
            <Callout tone="neutral">
              None of this is part of the mortgage payment, is escrowed, or
              counts toward your debt-to-income ratio. It is estimated
              separately and added alongside, because it comes out of the same
              paycheque.
            </Callout>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Living area"
                htmlFor="living-sqft"
                hint="From the listing. Air conditioning is most of a Houston electric bill, so floor area predicts it better than anything else."
              >
                <NumberInput
                  id="living-sqft"
                  value={state.livingSqFt}
                  onChange={(value) => update("livingSqFt", value)}
                  min={400}
                  max={12_000}
                />
              </Field>
              <Field
                label="Electricity rate"
                htmlFor="kwh-rate"
                hint="Texas is deregulated, so this is yours to shop. Plans ran 12¢ to 19¢ in 2026."
              >
                <CentsInput
                  id="kwh-rate"
                  value={state.electricityRatePerKwh}
                  onChange={(value) => update("electricityRatePerKwh", value)}
                  unit="kWh"
                  max={100}
                  decimals={2}
                />
              </Field>
            </div>

            <Toggle
              checked={state.hasNaturalGas}
              onChange={(checked) => update("hasNaturalGas", checked)}
              label="The house has natural gas"
              hint="Many homes in this district are all-electric and pay nothing for gas. Check the listing rather than assuming."
            />
            {state.hasNaturalGas && (
              <>
                <Callout tone="neutral">
                  Gas is CenterPoint&apos;s filed tariff rather than a flat
                  estimate: a fixed $
                  {CENTERPOINT_CUSTOMER_CHARGE.toFixed(2)} customer charge
                  every month whatever you burn, plus{" "}
                  {Math.round(
                    (CENTERPOINT_COMMODITY_PER_CCF + state.gasPgaPerCcf) * 100,
                  )}
                  ¢ per Ccf. The fixed part is why a July gas bill does not
                  fall to nothing.
                </Callout>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Gas usage"
                    htmlFor="gas-ccf"
                    hint="Annual average. The Railroad Commission puts Houston residences at about 34 Ccf a month, and it is nearly all space heating."
                  >
                    <NumberInput
                      id="gas-ccf"
                      value={state.gasCcfPerMonth}
                      onChange={(value) => update("gasCcfPerMonth", value)}
                      min={0}
                      max={400}
                    />
                  </Field>
                  <Field
                    label="Gas cost per Ccf"
                    htmlFor="gas-pga"
                    hint="The Purchased Gas Adjustment: the cost of the gas itself, passed straight through and refiled as the market moves."
                  >
                    <CentsInput
                      id="gas-pga"
                      value={state.gasPgaPerCcf}
                      onChange={(value) => update("gasPgaPerCcf", value)}
                      unit="Ccf"
                      max={500}
                      decimals={2}
                    />
                  </Field>
                </div>
              </>
            )}

            <Field
              label="Internet per month"
              htmlFor="internet-monthly"
              hint="Which providers reach an address varies here; what they charge barely does."
            >
              <CurrencyInput
                id="internet-monthly"
                value={state.monthlyInternet}
                onChange={(value) => update("monthlyInternet", value)}
                max={500}
              />
            </Field>
          </div>
        </Disclosure>

        <Disclosure summary="Insurance and flood">
          <div className="space-y-4 pt-1">
              <Field
                label="Insurance per $1,000 of dwelling coverage"
                htmlFor="insurance-rate"
                hint={`Dwelling coverage is modeled at ${Math.round(DWELLING_COVERAGE_FRACTION * 100)}% of price, so ${formatUSD(annualInsurance)} a year. Get a real quote.`}
              >
                <NumberInput
                  id="insurance-rate"
                  value={state.insuranceRatePerThousand}
                onChange={(value) => update("insuranceRatePerThousand", value)}
                min={1}
                max={40}
              />
            </Field>
            <Toggle
              checked={state.separateWindstormPolicy}
              onChange={(checked) => {
                update("separateWindstormPolicy", checked);
                /*
                 * The homeowners rate moves with it: where wind is written
                 * separately the homeowners policy excludes it and so is
                 * cheaper, and leaving the all-perils rate on top of a
                 * windstorm premium would charge for the same peril twice.
                 *
                 * This used to pick between the designated and inland rates
                 * only, so forcing the toggle on in Seabrook or Pasadena — the
                 * two cities where the answer genuinely turns on the address —
                 * dropped their $8.50 boundary rate and billed $7.00.
                 */
                update(
                  "insuranceRatePerThousand",
                  HOMEOWNERS_RATE_PER_THOUSAND[
                    !checked
                      ? "inland"
                      : windstorm.exposure === "inland"
                        ? // Forced on somewhere the designation does not
                          // reach: price the narrower policy, since that is
                          // what the buyer is asserting they will buy.
                          "designated"
                        : windstorm.exposure
                  ],
                );
              }}
              label="Separate windstorm policy required"
              hint={windstorm.note}
            />
            {state.separateWindstormPolicy && (
              <Field
                label="Windstorm premium per $1,000 of dwelling coverage"
                htmlFor="windstorm-rate"
                hint={`About ${formatUSD(annualWindstorm, 0)} a year at this price. TWIA averaged roughly $2,300–$2,400 in Galveston County. Get a real quote.`}
              >
                <CurrencyInput
                  id="windstorm-rate"
                  value={state.windstormRatePerThousand}
                  onChange={(value) => update("windstormRatePerThousand", value)}
                  max={40}
                />
              </Field>
            )}

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
                  ? `FEMA zone ${parcel.flood.zone ?? "unknown"}${
                      parcel.flood.inSpecialFloodHazardArea
                        ? " — a Special Flood Hazard Area, so your lender will require flood insurance."
                        : " — outside the Special Flood Hazard Area, so flood insurance is optional."
                    }`
                  : parcel
                    ? "No geometry resolved for this parcel, so the FEMA layer could not be tested. Look it up yourself — leaving it off is not the same as being outside a flood zone."
                    : "Looked up from the parcel centroid once you pick an address."
              }
            />
            {state.inFloodZone && (
              <Field label="Flood insurance per year" htmlFor="flood-insurance">
                <CurrencyInput
                  id="flood-insurance"
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
              <Field label="Interest rate" htmlFor="interest-rate">
                <PercentInput
                  id="interest-rate"
                  value={state.interestRate}
                  onChange={(fraction) => update("interestRate", fraction)}
                  max={20}
                />
              </Field>
              <Field label="Loan term" htmlFor="loan-term">
                <Select
                  id="loan-term"
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
              htmlFor="down-payment"
            >
              <Slider
                id="down-payment"
                value={state.downPaymentFraction * 100}
                onChange={(value) => update("downPaymentFraction", value / 100)}
                min={0}
                max={25}
                step={0.5}
                format={(value) => `${value}%`}
              />
            </Field>
            <Field label="Discount points" htmlFor="discount-points">
              <NumberInput
                id="discount-points"
                value={state.discountPoints}
                onChange={(value) => update("discountPoints", value)}
                min={0}
                max={5}
              />
            </Field>
            <Field label="Extra principal each month" htmlFor="extra-principal">
              <CurrencyInput
                id="extra-principal"
                value={state.extraMonthlyPrincipal}
                onChange={(value) => update("extraMonthlyPrincipal", value)}
                max={20_000}
              />
            </Field>
            <Field label="Override mortgage insurance rate" htmlFor="mi-rate-override">
              <PercentInput
                id="mi-rate-override"
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
            <Field label="Expected closing date" htmlFor="closing-date">
              <input
                id="closing-date"
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

        <Disclosure summary="Cash help at closing">
          <div className="space-y-4 pt-1">
            <Callout tone="neutral">
              These do not change which loan the calculator ranks as cheapest.
              They only change the cash-to-close math after a path is chosen.
            </Callout>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Cash you can bring to closing"
                htmlFor="cash-available"
                hint="Optional. Used only to note shortfall or leftover — not to pick the winner."
              >
                <CurrencyInput
                  id="cash-available"
                  value={state.cashAvailable}
                  onChange={(value) => update("cashAvailable", value)}
                  max={2_000_000}
                />
              </Field>
              <Field label="Seller concessions" htmlFor="seller-concessions">
                <CurrencyInput
                  id="seller-concessions"
                  value={state.sellerConcessions}
                  onChange={(value) => update("sellerConcessions", value)}
                  max={200_000}
                />
              </Field>
              <Field label="Lender credit" htmlFor="lender-credit">
                <CurrencyInput
                  id="lender-credit"
                  value={state.lenderCredit}
                  onChange={(value) => update("lenderCredit", value)}
                  max={100_000}
                />
              </Field>
              <Field label="Gift funds" htmlFor="gift-funds">
                <CurrencyInput
                  id="gift-funds"
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
              htmlFor="horizon-years"
            >
              <Slider
                id="horizon-years"
                value={state.horizonYears}
                onChange={(value) => update("horizonYears", value)}
                min={1}
                max={30}
                step={1}
                format={(value) => `${value}y`}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Home appreciation per year" htmlFor="appreciation">
                <PercentInput
                  id="appreciation"
                  value={state.annualAppreciationRate}
                  onChange={(fraction) =>
                    update("annualAppreciationRate", fraction)
                  }
                  max={20}
                  decimals={1}
                />
              </Field>
              <Field label="Tax and insurance growth per year" htmlFor="expense-growth">
                <PercentInput
                  id="expense-growth"
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
              htmlFor="area-median-income"
              hint={`HomeReady screens against 80% of this (${formatUSD((state.areaMedianIncome ?? 0) * 0.8, 0)}) and USDA against 115% (${formatUSD((state.areaMedianIncome ?? 0) * 1.15, 0)}).`}
            >
              <CurrencyInput
                id="area-median-income"
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
