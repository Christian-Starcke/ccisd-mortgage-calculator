"use client";

import dynamic from "next/dynamic";

/**
 * The calculator is mounted client-side only.
 *
 * Every number on the page depends on inputs that live in localStorage, so
 * server-rendering it would produce HTML built from the defaults and then
 * immediately replace it. Skipping the server render lets the persistence hook
 * read storage during its first render instead of correcting itself afterward.
 */
const Calculator = dynamic(
  () => import("./Calculator").then((module) => module.Calculator),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto max-w-[100rem] motion-safe:animate-pulse px-4 pt-[max(1.25rem,env(safe-area-inset-top,0px))] sm:px-6 lg:px-8">
        <div className="h-8 w-2/3 max-w-lg rounded bg-ink-100" />
        <div className="mt-3 h-4 w-full max-w-2xl rounded bg-ink-100" />
        <div className="mt-8 grid gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <div className="h-96 rounded-xl bg-ink-100" />
          <div className="space-y-6">
            <div className="h-64 rounded-xl bg-ink-100" />
            <div className="h-80 rounded-xl bg-ink-100" />
          </div>
        </div>
      </div>
    ),
  },
);

export function CalculatorMount() {
  return <Calculator />;
}
