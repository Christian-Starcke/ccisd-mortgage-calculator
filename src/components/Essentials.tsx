"use client";

import { useEffect, useState } from "react";
import { findLocationPreset, typicalHoaForLocation } from "@/data/fortBendTaxRates";
import { type CalculatorState, type UpdateState } from "@/lib/defaults";
import { formatUSD } from "@/lib/money";
import { AddressLookup } from "./AddressLookup";
import {
  Callout,
  Card,
  CurrencyInput,
  Field,
  NumberInput,
  Select,
  Toggle,
} from "./ui";

export function Essentials({
  state,
  update,
  onReset,
}: {
  state: CalculatorState;
  update: UpdateState;
  onReset: () => void;
}) {
  const typicalHoa = typicalHoaForLocation(state.locationId);

  return (
    <div className="space-y-4">
      <Card
        title="The house"
        subtitle="Address and listing price. Everything else about the property is looked up."
        action={<ResetButton onReset={onReset} />}
      >
        <div className="space-y-4">
          <AddressLookup state={state} update={update} />
          <Field label="Listing price" htmlFor="price">
            <CurrencyInput
              id="price"
              value={state.purchasePrice}
              onChange={(value) => update("purchasePrice", value)}
              min={0}
              max={5_000_000}
            />
          </Field>
          <Field
            label="HOA dues"
            htmlFor="hoa-certainty"
            hint="HOA is not on the appraisal record. It has to come from the listing, the seller, or the HOA itself."
          >
            <Select
              id="hoa-certainty"
              value={state.hoaCertainty}
              onChange={(value) => {
                update("hoaCertainty", value);
                if (value === "known" && state.annualHoaDues === 0) {
                  update("annualHoaDues", typicalHoa.midpoint);
                }
              }}
              options={[
                { value: "unknown", label: "I don't know yet" },
                { value: "none", label: "There is no HOA" },
                { value: "known", label: "I know the amount" },
              ]}
            />
          </Field>
          {state.hoaCertainty === "unknown" && (
            <Callout tone="neutral">
              Using <strong>{formatUSD(typicalHoa.midpoint, 0)} a year</strong> (
              {formatUSD(typicalHoa.low, 0)}–{formatUSD(typicalHoa.high, 0)} is
              typical for {findLocationPreset(state.locationId).name}). Confirm it
              on the listing before you offer.
            </Callout>
          )}
          {state.hoaCertainty === "known" && (
            <Field label="HOA dues per year" htmlFor="hoa-dues">
              <CurrencyInput
                id="hoa-dues"
                value={state.annualHoaDues}
                onChange={(value) => update("annualHoaDues", value)}
                max={20_000}
              />
            </Field>
          )}
        </div>
      </Card>

      <Card
        title="You"
        subtitle="These decide which loan and assistance stack wins — the calculator picks the cheapest path from them."
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Total household income"
              htmlFor="household-income"
              hint="Everyone in the home, including adults not on the loan. Used for debt-to-income and assistance screening."
            >
              <CurrencyInput
                id="household-income"
                value={state.annualHouseholdIncome}
                onChange={(value) => {
                  update("annualHouseholdIncome", value);
                  update("annualIncome", value);
                }}
                max={2_000_000}
              />
            </Field>
            <Field label="People in the household" htmlFor="household-size">
              <NumberInput
                id="household-size"
                value={state.householdSize}
                onChange={(value) => update("householdSize", value)}
                min={1}
                max={12}
              />
            </Field>
            <Field label="Credit score" htmlFor="credit-score">
              <NumberInput
                id="credit-score"
                value={state.creditScore}
                onChange={(value) => update("creditScore", value)}
                min={500}
                max={850}
              />
            </Field>
            <Field
              label="Other monthly debt payments"
              htmlFor="monthly-debt"
              hint="Car notes, student loans, credit card minimums, child support."
            >
              <CurrencyInput
                id="monthly-debt"
                value={state.monthlyDebtPayments}
                onChange={(value) => update("monthlyDebtPayments", value)}
                max={50_000}
              />
            </Field>
          </div>

          <div className="space-y-3 border-t border-ink-200 pt-4">
            <Toggle
              checked={state.firstTimeBuyer}
              onChange={(checked) => update("firstTimeBuyer", checked)}
              label="First-time homebuyer"
              hint="Counts if you have not owned a principal residence in the last three years."
            />
            <Toggle
              checked={state.texasHeroProfession}
              onChange={(checked) => update("texasHeroProfession", checked)}
              label="Someone on the loan is a teacher, school employee, police officer, firefighter, EMS, corrections officer, or veteran"
              hint="Unlocks Homes for Texas Heroes and a free mortgage credit certificate."
            />
            <Toggle
              checked={state.isVeteran}
              onChange={(checked) => update("isVeteran", checked)}
              label="Eligible for a VA loan"
              hint="Zero down, no mortgage insurance ever."
            />
            {state.isVeteran && (
              <div className="pl-7">
                <Toggle
                  checked={state.vaFundingFeeExempt}
                  onChange={(checked) => update("vaFundingFeeExempt", checked)}
                  label="Receiving VA disability compensation"
                  hint="Waives the VA funding fee entirely."
                />
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

/**
 * Two-step reset. A confirm() dialog would block the main thread for as long
 * as the user reads it, which performance tools report as a multi-second
 * interaction; arming the button for a few seconds confirms without blocking.
 */
function ResetButton({ onReset }: { onReset: () => void }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const handle = window.setTimeout(() => setConfirming(false), 4000);
    return () => window.clearTimeout(handle);
  }, [confirming]);

  return (
    <button
      type="button"
      onClick={() => {
        if (confirming) {
          setConfirming(false);
          onReset();
        } else {
          setConfirming(true);
        }
      }}
      className={`-mx-2 inline-flex min-h-11 items-center px-2 text-sm font-medium underline underline-offset-2 ${
        confirming
          ? "text-alert-700 decoration-alert-100"
          : "text-ink-500 decoration-ink-300 hover:text-ink-800"
      }`}
    >
      {confirming ? "Click again to reset everything" : "Reset all"}
    </button>
  );
}
