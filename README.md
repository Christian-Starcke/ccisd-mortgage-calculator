# Fort Bend ISD mortgage & affordability calculator

A mortgage calculator built for one specific situation: a first-time buyer
purchasing inside Fort Bend Independent School District, Texas, who wants to know
the real monthly payment on a listing price and then find every legitimate way to
pay less.

It is not a generic payment calculator with a Texas label on it. The property tax
model bills each taxing unit separately with its own homestead exemption, because
that is how Fort Bend County actually works and because it is the single largest
variable in a Texas payment.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:3000. All inputs persist to `localStorage`, so you can
close the tab and come back to the same scenario.

```bash
npm test        # unit tests for the financial math
npm run lint
npm run typecheck
npm run build
```

## What it does

**Answers the basic question.** Type the listing address and price. The
calculator looks up the Fort Bend CAD parcel (you pick the match; it never
guesses), pulls tax units, USDA eligibility and flood zone, then shows the full
monthly payment: principal, interest, property tax, homeowners insurance,
mortgage insurance, flood, HOA, and any MUD water bill. Not just principal and
interest, which is the number most calculators show and which is roughly 70% of
what you will actually pay here.

**Prices nine loan programs side by side at the same purchase price**, and screens
each one against your credit score, income, veteran status and the Fort Bend
County loan limits. Conventional 97, HomeReady, Home Possible, FHA, USDA, VA, and
conventional at 5%, 10% and 20% down. It reports which is cheapest monthly, which
needs the least cash, and which is cheapest over the years you actually plan to
stay, because those are frequently three different loans.

**Models the assistance programs** available to a Fort Bend first-time buyer, and
enforces which ones can legally be combined. A grant, a forgivable second lien,
a deferred second lien and a repayable second lien are all "down payment
assistance" and they are not remotely the same thing; the calculator distinguishes
them and shows the monthly payment a repayable second creates.

**Ranks concrete actions by dollars saved** in "Your cheapest path to owning this
house." Every item is specific: not "shop your rate" but "a 0.25% lower rate is
$64 a month and $5,367 over seven years."

**Solves for what you can actually afford**, by binary search rather than by
inverting the payment formula. The flat homestead exemption, the stepped PMI
bands, and the FHA loan ceiling all make the relationship between price and
payment non-linear, so an inverted formula would be wrong at exactly the prices
you care about. It also tells you which constraint is binding, because "you are
limited by cash" and "you are limited by debt-to-income" have completely
different fixes.

## What you should verify before trusting a number

The calculator is honest about its own uncertainty; programs marked **Verify by
phone** in the UI are ones whose figures could not be confirmed from a primary
source. Beyond those:

1. **That the house is actually in Fort Bend ISD.** The mailing city on a listing
   does not settle this. Richmond addresses are mostly Lamar Consolidated ISD,
   which costs about nine cents per $100 more than FBISD, and Rosharon addresses
   straddle the Fort Bend / Brazoria county line, where FBISD stops entirely.
   Check the street address on the
   [FBISD attendance map](https://www.fortbendisd.com/interactivemap). Typing the
   address is the reliable path; the Richmond and Rosharon presets still exist
   as a fallback and to price the cost of being wrong.
2. **Your MUD or LID.** This is the biggest hidden variable in Fort Bend. Two
   otherwise identical houses can differ by more than $4,000 a year in tax
   because one sits in a utility district with heavy debt service and the other
   does not. A selected parcel fills this from CAD. If you skip the address,
   the location preset's default district is used instead.
3. **Your homeowners insurance quote.** The default of $9.50 per $1,000 of value
   is a realistic mid-range Houston-area premium, but the spread between carriers
   here is wider than almost anywhere in the country. Get a real quote.
4. **The interest rate.** Defaults to the Freddie Mac national average, which is
   a survey number, not an offer. Your actual quote depends on credit score,
   loan-to-value, program and lock period.
5. **Area median income.** Program eligibility for HomeReady, Home Possible and
   USDA turns on it, and the published figure varies by household size.
6. **USDA address eligibility.** Parts of southern and western Fort Bend County
   qualify; Sugar Land and Missouri City do not. The Rosharon corridor is the
   best bet inside FBISD, though roughly 72% of ZIP 77583 sits in a USDA
   exclusion zone, so it has to be checked parcel by parcel. Check the
   [USDA map](https://eligibility.sc.egov.usda.gov/eligibility/welcomeAction.do)
   for the specific address, because USDA is often the cheapest option available
   when it applies at all.

## Data currency

| Data | Vintage | Notes |
| --- | --- | --- |
| Fort Bend taxing unit rates | Adopted 2025 | Live parcel lookup uses `src/data/fortBendTaxUnitCodes.ts`, generated from the county Truth-in-Taxation portal. Location presets in `fortBendTaxRates.ts` are the no-parcel fallback. New rates are adopted each September. |
| Lamar CISD rate, City of Richmond rate | Adopted 2025 | Used only to price the risk of a Richmond address turning out not to be FBISD. |
| Fort Bend MUD 141, Brazoria-Fort Bend MUD 3 | 2024 roll | Taken from listing-service tax records rather than the county worksheet, so both are flagged as 2024 in the UI. Verify at FBCAD. |
| FBISD homestead exemption | $140,000 | Texas Proposition 13, approved by voters November 2025. |
| Conforming loan limit | 2026: $832,750 | FHFA, announced November 2025. |
| FHA loan limit, Fort Bend County | 2026: $541,287 | HUD Mortgagee Letter 2025-23. |
| Mortgage rates | August 27, 2026 | Freddie Mac PMMS. |

Tax rates for a selected parcel live in `src/data/fortBendTaxUnitCodes.ts`
(regenerate with `npm run build:tax-units` after September 30). Location presets
and homestead overlays live in `src/data/fortBendTaxRates.ts`. Loan limits are in
`src/data/loanLimits.ts`. Each file has source URLs next to the values.

## How it is organized

The financial engine is pure TypeScript with no React in it, which is what makes
it testable and what makes the affordability solver possible.

```
src/lib/
  defaults.ts           UI state, STORAGE_KEY, starting assumptions
  money.ts              Rounding, formatting, loose numeric parsing
  amortization.ts       Payment schedules, mortgage insurance termination
  propertyTax.ts        Per-unit Texas tax with exemptions and appraisal caps
  mortgageInsurance.ts  PMI bands, FHA MIP, USDA fee, VA funding fee
  closingCosts.ts       Texas closing costs, title premium, escrow deposits
  loanPrograms.ts       Program catalog and eligibility screening
  assistance.ts         Assistance program modeling and stacking rules
  scenario.ts           Orchestrates all of the above into one result
  affordability.ts      Binary search for maximum purchase price
  buildFromState.ts     Maps flat UI state onto engine inputs
  lookups/              FBCAD, USDA, FEMA clients (used only from API routes)
src/app/api/            GET /api/address and GET /api/property
src/data/               Rates, limits, programs, generated tax-unit table
src/components/         UI over the engine's output
scripts/                Tax-unit table generator
```

`scenario.ts` is the single entry point: give it a `CalculatorInputs` and it
returns everything the UI displays. The comparison table works by calling it nine
times, once per program, which is cheap enough that nothing needs caching.

## Limitations worth knowing

- Escrow is modeled as a level monthly amount rather than a true escrow analysis
  with an annual shortage or surplus adjustment. Your actual payment will step up
  when the district raises rates.
- The appraisal cap is modeled at the statutory 10% a year for a homesteaded
  property, but the appraisal district's methodology is its own animal and a
  protest changes it.
- Assistance program awards are modeled at their maximum. Actual awards depend on
  funding availability at the time you apply, and some of these programs exhaust
  their allocation mid-year.
- Nothing here accounts for the mortgage interest deduction beyond the Mortgage
  Credit Certificate, since most first-time buyers at this price point do not
  itemize.

None of this is financial advice and none of it is a loan offer. The only numbers
that bind anyone are the ones on a Loan Estimate.
