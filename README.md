# Clear Creek ISD mortgage & affordability calculator

A mortgage calculator built for one specific situation: a first-time buyer
purchasing inside Clear Creek Independent School District, Texas, who wants to
know the real monthly payment on a listing price and then find every legitimate
way to pay less.

It is not a generic payment calculator with a Texas label on it. Two things
about this district drive almost everything in the code.

**It spans two counties.** Clear Creek ISD covers 103 square miles and thirteen
municipalities across Harris and Galveston counties, and the two appraisal
districts share nothing: not the parcel numbering, not the taxing-unit codes,
not the set of countywide units, not even the existence of an API. A Harris
County parcel is billed by six countywide units before any city; a Galveston
County parcel is billed by three. The district itself is code `027` on one side
of the line and `S16` on the other.

**Half of it is on the coast.** Along the Texas coast a homeowners policy does
not cover wind and hail. Inside the catastrophe area designated by the Texas
Department of Insurance the peril is written as a separate, lender-required
policy — and that area covers the entire Galveston County half of this district
and almost none of the Harris County half. Two houses zoned to the same schools,
one in League City and one in Webster, differ by roughly $200 a month in
insurance alone. Nothing else here produces a gap that large from an address
change, so windstorm is modelled as its own line in the payment rather than
folded into a hazard-insurance estimate.

## Running it

```bash
npm install
cp .env.example .env.local   # then fill in the two Supabase values
npm run dev
```

Then open http://localhost:3000. All inputs persist to `localStorage`, so you
can close the tab and come back to the same scenario.

```bash
npm test        # unit tests for the financial math and the two-county lookups
npm run lint
npm run typecheck
npm run build
```

The calculator runs without the environment variables, but the address lookup
will not: it falls back to the location presets and says so.

## What it does

**Answers the basic question.** Type the listing address and price. The
calculator searches both appraisal districts, you pick the match (it never
guesses), and it pulls the taxing units, flood zone and wind exposure, then
shows the full monthly payment: principal, interest, property tax, homeowners
insurance, **windstorm insurance**, mortgage insurance, flood, HOA, and any
utility district water bill. Not just principal and interest, which is the
number most calculators show and which is roughly 65% of what you will actually
pay here.

**Bills each taxing unit separately, with its own homestead exemption**, because
that is how Texas actually works and because it is the largest variable in the
payment. Clear Creek ISD stacks the $140,000 state homestead exemption with its
own 5% local option; Harris County grants 20%; Taylor Lake Village grants
nothing; Clear Lake Shores levies no city tax at all. A single blended rate
cannot represent any of that.

**Prices nine loan programs side by side at the same purchase price**, and
screens each against your credit score, income, veteran status and the Houston
metro loan limits. Conventional 97, HomeReady, Home Possible, FHA, USDA, VA, and
conventional at 5%, 10% and 20% down. It reports which is cheapest monthly,
which needs the least cash, and which is cheapest over the years you actually
plan to stay, because those are frequently three different loans.

**Models the assistance programs** available to a Clear Creek first-time buyer,
and enforces which ones can legally be combined and which government actually
administers them. A City of Houston award cannot be claimed on a League City
address; the Harris County programme does not reach Galveston County at all.
A grant, a forgivable second lien, a deferred second lien and a repayable second
lien are all "down payment assistance" and they are not remotely the same thing;
the calculator distinguishes them and shows the monthly payment a repayable
second creates.

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

Programs marked **Verify by phone** in the UI are ones whose figures could not be
confirmed from a primary source. Beyond those:

1. **That the house is actually in Clear Creek ISD.** The mailing city on a
   listing does not settle this, and four different boundaries run through the
   district's edges. Southern and western **League City** is Dickinson ISD, which
   costs about 17 cents per $100 more. **Friendswood** is split down the county
   line: the Harris County part is Clear Creek, the Galveston County part is
   Friendswood ISD. Most of **Pasadena** is Pasadena ISD, about 20 cents per $100
   dearer, and only its southern edge is Clear Creek — the most commonly
   mistaken address in the district. The **Bacliff and San Leon** corridor splits
   parcel by parcel. Check the street address on the
   [CCISD school finder](https://www.ccisd.net/district-map). Typing the address
   is the reliable path; the presets exist as a fallback and to price the cost of
   being wrong.
2. **Your windstorm eligibility, if the address is in Seabrook or Pasadena.**
   The designated catastrophe area reaches Harris County only east of State
   Highway 146 *and* inside the city limits of La Porte, Morgan's Point,
   Pasadena, Seabrook or Shoreacres. Both conditions have to hold. The
   calculator assumes the premium applies in those two cities, which is the
   conservative reading, and says so; west of 146 it comes off the payment
   entirely, which is worth about $180 a month. It does not try to guess which
   side of the highway you are on.
3. **Your insurance quotes — all of them.** The defaults are mid-range
   estimates: $7.00 per $1,000 of dwelling coverage for a homeowners policy that
   excludes wind, $7.70 for windstorm, and $10.50 for an all-perils policy
   outside the designated area. The spread between carriers on this coast is
   wider than almost anywhere in the country. Get real quotes, and note that
   inside the designated area you will hold two or three policies rather than
   one.
4. **Your flood zone.** Far more of this district is in a Special Flood Hazard
   Area than in an inland one, and the Harris County lookup here tests the
   parcel centroid against the FEMA layer. Galveston County parcels get no flood
   lookup at all, because GCAD's data drop carries no geometry — check those on
   the FEMA map yourself.
5. **Your utility district.** Two otherwise identical houses can differ by more
   than a full percent of value a year. Galveston County MUD 36 levies $1.15 per
   $100 — more than the school tax — while WCID 12 levies $0.18. A selected
   parcel fills this from the appraisal record. If you skip the address, the
   preset's default district is used instead.
6. **The interest rate.** Defaults to the Freddie Mac national average, which is
   a survey number, not an offer.
7. **Area median income.** Program eligibility for HomeReady, Home Possible and
   the local programmes turns on it, and the published figure varies by household
   size and by county — and this district spans two.

## Data currency

| Data | Vintage | Notes |
| --- | --- | --- |
| Harris County taxing unit rates | Adopted 2025 | `src/data/harrisTaxUnitCodes.ts`, generated from the [Harris County Truth-in-Taxation table](https://www.hctax.net/Property/JurisdictionTaxRates). |
| Harris County homestead exemptions | HCAD PDATA 2026 certified | The `RES` row of HCAD's own per-jurisdiction exemption table, via `src/data/generated/harrisFootprint.json`. |
| Galveston County rates and exemptions | Adopted 2025 | `src/data/galvestonTaxUnitCodes.ts`, hand-maintained from the [Galveston CAD rates and exemptions PDF](https://galvestoncad.org/wp-content/uploads/2025/11/2025_Galveston_Tax_Rates.pdf). |
| Clear Creek ISD rate | Adopted 2025 | $0.969 = $0.699 M&O + $0.270 I&S, held flat for 2025-26. Published identically by both counties, which is a useful cross-check. |
| CCISD homestead exemption | $140,000 + 5% | The state exemption from Texas Proposition 13 (November 2025) stacked with the district's 5% local option, floored at $5,000 by Tax Code 11.13(n). |
| Harris parcel footprint | HCAD PDATA 2026 certified | 50,241 accounts. |
| Galveston parcel footprint | GCAD drop, April 2026 | 39,156 parcels. |
| Conforming loan limit | 2026: $832,750 | FHFA, announced November 2025. |
| FHA loan limit | 2026: $541,287 | HUD Mortgagee Letter 2025-23. One figure for the whole district: Harris and Galveston are both in the Houston-Pasadena-The Woodlands MSA. |
| Windstorm premium | TWIA, mid-2026 | TWIA's average residential premium was about $2,541; Galveston County averages roughly $2,300–$2,400. |
| Mortgage rates | August 27, 2026 | Freddie Mac PMMS. |

## How it is organized

The financial engine is pure TypeScript with no React in it, which is what makes
it testable and what makes the affordability solver possible. There are no
third-party runtime dependencies beyond Next and React — the parcel database is
reached over PostgREST directly.

```
src/lib/
  defaults.ts           UI state, STORAGE_KEY, starting assumptions
  money.ts              Rounding, formatting, loose numeric parsing
  amortization.ts       Payment schedules, mortgage insurance termination
  propertyTax.ts        Per-unit Texas tax with exemptions and appraisal caps
  windstorm.ts          TWIA catastrophe area, windstorm and ex-wind premiums
  mortgageInsurance.ts  PMI bands, FHA MIP, USDA fee, VA funding fee
  closingCosts.ts       Texas closing costs, title premium, escrow deposits
  loanPrograms.ts       Program catalog and eligibility screening
  assistance.ts         Assistance program modeling and stacking rules
  scenario.ts           Orchestrates all of the above into one result
  affordability.ts      Binary search for maximum purchase price
  buildFromState.ts     Maps flat UI state onto engine inputs
  lookups/
    parcelSearch.ts     One address search across both appraisal districts
    property.ts         Resolves one picked parcel, per county
    hcad.ts             Harris parcels, live from Harris County GIS
    parcelStore.ts      The parcel footprint in Supabase (PostgREST)
    resolveCodes.ts     Taxing-unit codes to billable units, per county
    addressParse.ts     Address to house number plus street tokens
    fema.ts, usda.ts    Flood zone and USDA eligibility by point
src/app/api/            GET /api/address and GET /api/property
src/data/               Rates, limits, programs, generated unit tables
src/components/         UI over the engine's output
scripts/                Footprint, rate table and parcel ingest tooling
```

`scenario.ts` is the single entry point: give it a `CalculatorInputs` and it
returns everything the UI displays. The comparison table works by calling it
nine times, once per program, which is cheap enough that nothing needs caching.

### Why there is a database

Fort Bend County, which this project was originally built for, serves a live
parcel service with the taxing units already on the record. Neither of Clear
Creek's counties does:

- **Harris** serves parcels live, with better address fields than Fort Bend had
  — but its parcel layer carries no taxing-unit list at all. The
  account-to-jurisdiction mapping is published only in an annual 112 MB bulk
  drop. So addresses and values are still queried live, and only the codes come
  from storage, joined on the account number.
- **Galveston** publishes no query service of any kind, only a yearly shapefile.
  So the whole parcel is stored — situs, values, codes — and that table *is* the
  Galveston lookup. Its rows are a dated snapshot, and the UI says so rather
  than letting a stale record pass for live data.

Only the parcel-to-taxing-unit mapping lives in the database. Adopted rates and
homestead exemption rules stay in version-controlled TypeScript, so a rate change
shows up as a reviewable diff with its source URL attached.

An account absent from the table is a parcel outside Clear Creek ISD, which is
what drives the "this address is not in the district" warning.

### Refreshing the data

Rates are adopted by September 30 and HCAD certifies values in mid-August, so
this is an annual October job.

```bash
# 1. Fetch the two source drops into data-drop/ (gitignored, ~1.5 GB unzipped).
#    Harris:    https://download.hcad.org/data/CAMA/<year>/Real_jur_exempt.zip
#               unzip jur_value.txt and jur_tax_dist_exempt_value_rate.txt
#    Galveston: https://galvestoncad.org/gis-data/ -> "Parcel DBF - Data Only"
#               unzip parcel_data.dbf

npm run build:footprint      # footprint + Harris exemption rules from HCAD
npm run build:harris-units   # adopted rates from the Harris rate table
npm run ingest:parcels       # ~90k parcels into Supabase (needs the service key)
```

Then re-verify `src/data/galvestonTaxUnitCodes.ts` by hand against the current
Galveston CAD rates PDF. It is hand-maintained because Galveston publishes the
whole county — codes, rates and exemptions together — on one page, so a
generator would be more machinery than the job needs.

`npm run ingest:parcels --dry-run` parses both files and writes nothing, which
is the fast way to check a new drop's format before touching the database.

### Environment

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Both are read server-side only, from the API routes, so the key never reaches
the browser. The `parcel` table is public and read-only under row-level
security; the ingest script needs a service key, which is never used by the app.

## Limitations worth knowing

- Escrow is modeled as a level monthly amount rather than a true escrow analysis
  with an annual shortage or surplus adjustment. Your actual payment will step up
  when the district raises rates.
- The appraisal cap is modeled at the statutory 10% a year for a homesteaded
  property, but the appraisal district's methodology is its own animal and a
  protest changes it.
- **A parcel split between two school districts is not modeled.** The appraisal
  record apportions the value; the calculator prices all of it in Clear Creek
  ISD and warns you. About 0.5% of the footprint is affected.
- **Galveston County parcels get no flood or USDA point lookup**, because the
  GCAD drop has no geometry. The Harris side does.
- **HCAD does not publish exemptions on its parcel layer**, so the "the seller's
  homestead does not transfer" warning is driven off the record only on the
  Galveston side. It is stated unconditionally on the Harris side instead.
- **No USDA-eligible area exists in this district.** It is continuously built-up
  suburban and coastal Houston, which USDA excludes in full. The program is still
  priced so the comparison can say what is unavailable rather than stay silent.
- **No Galveston County down payment assistance programme is modeled**, because
  none could be confirmed from a primary source. The City of Galveston runs one,
  but that city is not in this district. Since roughly 44% of Clear Creek ISD is
  in Galveston County, a League City, Kemah or Clear Lake Shores buyer is limited
  to the statewide programmes — that is a real gap, not an oversight, and it is
  worth a phone call to the county.
- Assistance program awards are modeled at their maximum. Actual awards depend on
  funding availability at the time you apply, and some of these programs exhaust
  their allocation mid-year.
- Nothing here accounts for the mortgage interest deduction beyond the Mortgage
  Credit Certificate, since most first-time buyers at this price point do not
  itemize.

None of this is financial advice and none of it is a loan offer. The only numbers
that bind anyone are the ones on a Loan Estimate.
