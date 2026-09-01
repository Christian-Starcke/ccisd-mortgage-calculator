"use client";

import { type CalculatorState, type UpdateState } from "@/lib/defaults";
import { DerivedAssumptions } from "./DerivedAssumptions";
import { Essentials } from "./Essentials";

export function InputPanel({
  state,
  update,
  onReset,
}: {
  state: CalculatorState;
  update: UpdateState;
  onReset: () => void;
}) {
  return (
    <div className="space-y-4">
      <Essentials state={state} update={update} onReset={onReset} />
      <DerivedAssumptions state={state} update={update} />
      <a
        href="#results"
        className="no-print flex min-h-11 scroll-mb-28 items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 xl:hidden"
      >
        See your estimate
      </a>
    </div>
  );
}
