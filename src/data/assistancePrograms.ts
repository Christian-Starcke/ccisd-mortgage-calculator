import type { AssistanceProgram } from "@/lib/assistance";

/**
 * Down payment assistance, tax credits and grants available to a first-time
 * buyer in Fort Bend ISD.
 *
 * Every figure carries a `confidence` marker. "verified" means the number was
 * read off the administering agency's own current published document.
 * "needs-verification" means the program exists but its current funding status
 * or exact award could not be confirmed from a primary source, and you must call
 * the agency. Assistance programs run out of money mid-year and reopen without
 * announcement, so treat anything not marked verified as a lead rather than a
 * plan.
 */

const CONVENTIONAL_AND_GOVERNMENT: AssistanceProgram["eligibility"]["compatibleLoanPrograms"] =
  ["conv-97", "homeready", "home-possible", "conv-5", "fha", "usda", "va"];

export const ASSISTANCE_PROGRAMS: AssistanceProgram[] = [
  // -------------------------------------------------------------------------
  // Texas State Affordable Housing Corporation
  // -------------------------------------------------------------------------
  {
    id: "tsahc-home-sweet-texas",
    name: "Home Sweet Texas Home Loan Program",
    administrator: "Texas State Affordable Housing Corporation (TSAHC)",
    url: "https://www.tsahc.org/home-buyer-programs",
    kind: "grant",
    benefitBasis: "percent-of-loan-amount",
    benefitValue: 0.05,
    maxBenefit: null,
    forgivenessYears: null,
    secondLienRate: null,
    secondLienTermMonths: null,
    taxCreditRate: null,
    taxCreditAnnualCap: null,
    ratePremium: 0.0075,
    eligibility: {
      maxHouseholdIncome: 156_000,
      maxPurchasePrice: null,
      minCreditScore: 620,
      maxDti: null,
      requiresFirstTimeBuyer: false,
      requiresTexasHeroProfession: false,
      requiresVeteran: false,
      requiresHomebuyerEducation: true,
      compatibleLoanPrograms: CONVENTIONAL_AND_GOVERNMENT,
      eligibleLocationIds: null,
      manualChecks: [
        "Use a TSAHC-approved participating lender. Your own bank probably is not one.",
        "Complete the approved homebuyer education course before closing.",
        "Compare the TSAHC interest rate against a plain-vanilla loan. The rate is typically 0.5 to 1 point higher, because that spread is what funds the assistance.",
      ],
    },
    stackable: false,
    excludes: ["tsahc-texas-heroes", "tdhca-my-first-texas-home", "seth-5-star"],
    status: "active",
    summary:
      "Choose 2%, 3%, 4% or 5% of your loan amount as down payment and closing cost help, structured either as a grant you never repay or as a three-year forgivable second lien.",
    notes: [
      "The Fort Bend County household income limit is $156,000, which is unusually generous and covers most dual-income households.",
      "No first-time buyer requirement, and no purchase price limit when you take the assistance without a Mortgage Credit Certificate.",
      "The grant option never has to be repaid, even if you sell next year.",
      "The catch is the interest rate. This calculator adds a 0.75% first-mortgage premium when you take the grant, which is the typical spread that funds it. Ask for the three-year forgivable second instead: it usually prices 0.375 to 0.75 points cheaper than the grant.",
    ],
    confidence: "verified",
  },

  {
    id: "tsahc-texas-heroes",
    name: "Homes for Texas Heroes Home Loan Program",
    administrator: "Texas State Affordable Housing Corporation (TSAHC)",
    url: "https://www.tsahc.org/home-buyer-programs",
    kind: "grant",
    benefitBasis: "percent-of-loan-amount",
    benefitValue: 0.05,
    maxBenefit: null,
    forgivenessYears: null,
    secondLienRate: null,
    secondLienTermMonths: null,
    taxCreditRate: null,
    taxCreditAnnualCap: null,
    ratePremium: 0.0075,
    eligibility: {
      maxHouseholdIncome: 176_800,
      maxPurchasePrice: null,
      minCreditScore: 620,
      maxDti: null,
      requiresFirstTimeBuyer: false,
      requiresTexasHeroProfession: true,
      requiresVeteran: false,
      requiresHomebuyerEducation: true,
      compatibleLoanPrograms: CONVENTIONAL_AND_GOVERNMENT,
      eligibleLocationIds: null,
      manualChecks: [
        "Confirm your job title is on TSAHC's eligible profession list.",
        "Use a TSAHC-approved participating lender.",
        "A Mortgage Credit Certificate is free for Texas Heroes, so ask for it explicitly.",
      ],
    },
    stackable: false,
    excludes: [
      "tsahc-home-sweet-texas",
      "tdhca-my-first-texas-home",
      "seth-5-star",
    ],
    status: "active",
    summary:
      "The same 2% to 5% assistance as Home Sweet Texas, with a higher income ceiling of $176,800 in Fort Bend County, for teachers, school staff, police, firefighters, EMS, corrections officers and veterans.",
    notes: [
      "Eligible professions include teachers, teacher aides, school librarians, counselors and nurses, plus police, public security officers, firefighters, EMS personnel, corrections and juvenile corrections officers, county jailers, and veterans.",
      "If you or a co-borrower holds one of these jobs, this strictly dominates Home Sweet Texas: same benefit, $20,800 more income headroom.",
      "Fort Bend ISD is one of the largest employers in the county, so a household with one teacher in it should always check this first.",
    ],
    confidence: "verified",
  },

  {
    id: "tsahc-mcc",
    name: "Texas Mortgage Credit Certificate",
    administrator: "Texas State Affordable Housing Corporation (TSAHC)",
    url: "https://www.tsahc.org/home-buyer-programs/mortgage-credit-certificates",
    kind: "tax-credit",
    benefitBasis: "fixed-amount",
    benefitValue: 0,
    maxBenefit: null,
    forgivenessYears: null,
    secondLienRate: null,
    secondLienTermMonths: null,
    taxCreditRate: 0.15,
    taxCreditAnnualCap: null,
    ratePremium: 0,
    eligibility: {
      maxHouseholdIncome: 104_000,
      maxPurchasePrice: 566_354,
      minCreditScore: null,
      maxDti: null,
      requiresFirstTimeBuyer: true,
      requiresTexasHeroProfession: false,
      requiresVeteran: false,
      requiresHomebuyerEducation: true,
      compatibleLoanPrograms: CONVENTIONAL_AND_GOVERNMENT,
      eligibleLocationIds: null,
      manualChecks: [
        "The stand-alone MCC is no longer offered. It must be taken together with TSAHC down payment assistance.",
        "Income limits are by household size: the figure modeled here is the 1-to-2-person limit. Households of three or more get a higher limit, so check the current table.",
        "Ask your lender to count the credit as income when computing your debt-to-income ratio. Doing so raises how much house you qualify for.",
        "Understand the federal recapture tax: selling at a gain within nine years while your income has risen substantially can claw back part of the benefit. In practice it rarely triggers.",
      ],
    },
    stackable: true,
    excludes: [],
    status: "active",
    summary:
      "A federal income tax credit worth 15% of the mortgage interest you pay every year, for as long as you keep the loan and live in the home. At the current 15% credit rate the $2,000 IRC cap does not apply.",
    notes: [
      "This is a credit, not a deduction. It comes straight off the tax you owe.",
      "It repeats every year for the life of the loan. Over ten years that is real money, and unlike a grant it does not raise your interest rate.",
      "Free for Texas Heroes; otherwise there is an issuance fee.",
      "The credit rate is currently 15%. The $2,000 annual cap in IRC 25(a)(2)(A) only applies when the credit rate exceeds 20%, so it is not modeled here.",
    ],
    confidence: "verified",
  },

  // -------------------------------------------------------------------------
  // Texas Department of Housing and Community Affairs
  // -------------------------------------------------------------------------
  {
    id: "tdhca-my-first-texas-home",
    name: "My First Texas Home",
    administrator:
      "Texas Department of Housing and Community Affairs (The Texas Homebuyer Program)",
    url: "https://thetexashomebuyerprogram.com/",
    kind: "deferred-second",
    benefitBasis: "percent-of-loan-amount",
    benefitValue: 0.05,
    maxBenefit: null,
    forgivenessYears: null,
    secondLienRate: 0,
    secondLienTermMonths: 360,
    taxCreditRate: null,
    taxCreditAnnualCap: null,
    ratePremium: 0,
    eligibility: {
      maxHouseholdIncome: 101_100,
      maxHouseholdIncomeHouseholdsOf3OrMore: 116_265,
      maxPurchasePrice: 544_232,
      minCreditScore: 620,
      maxDti: 0.45,
      requiresFirstTimeBuyer: true,
      requiresTexasHeroProfession: false,
      requiresVeteran: false,
      requiresHomebuyerEducation: true,
      compatibleLoanPrograms: ["fha", "va", "usda", "conv-97", "homeready"],
      eligibleLocationIds: null,
      manualChecks: [
        "Confirm the current assistance percentage and the Fort Bend County income and price limits directly with the program, as they are revised during the year.",
        "This is a bond-backed program, so the first mortgage rate is set by the program rather than shopped.",
        "Confirm whether the second lien is forgivable or repayable on sale for the specific structure you are offered.",
      ],
    },
    stackable: false,
    excludes: ["tsahc-home-sweet-texas", "tsahc-texas-heroes", "seth-5-star"],
    status: "unverified",
    summary:
      "The state's bond-backed first-time buyer program, offering down payment and closing cost assistance as a deferred second lien alongside a fixed-rate first mortgage.",
    notes: [
      "Structurally similar to the TSAHC programs. Quote both, because the rate and the assistance percentage differ and the better deal changes month to month.",
      "Because the assistance is a deferred second lien rather than a grant, you owe it back when you sell or refinance.",
    ],
    confidence: "needs-verification",
  },

  // -------------------------------------------------------------------------
  // Local government
  // -------------------------------------------------------------------------
  {
    id: "houston-hap",
    name: "Houston Homebuyer Assistance Program",
    administrator: "City of Houston Housing and Community Development",
    url: "https://houstontx.gov/housing/hap.html",
    kind: "forgivable-second",
    benefitBasis: "fixed-amount",
    benefitValue: 75_000,
    maxBenefit: 75_000,
    forgivenessYears: 5,
    secondLienRate: 0,
    secondLienTermMonths: null,
    taxCreditRate: null,
    taxCreditAnnualCap: null,
    ratePremium: 0,
    eligibility: {
      maxHouseholdIncome: 84_080,
      maxPurchasePrice: null,
      minCreditScore: 580,
      maxDti: null,
      requiresFirstTimeBuyer: true,
      requiresTexasHeroProfession: false,
      requiresVeteran: false,
      requiresHomebuyerEducation: true,
      compatibleLoanPrograms: CONVENTIONAL_AND_GOVERNMENT,
      eligibleLocationIds: ["houston-in-fbisd"],
      manualChecks: [
        "The property must be inside Houston city limits. Verify the address with the city, not just the mailing address, since a Houston postal address is not the same as being in the city.",
        "Household income must be at or below 80% of area median income, counting everyone in the household.",
        "Confirm current funding availability and the forgiveness period, which has changed across funding cycles.",
      ],
    },
    stackable: false,
    excludes: [],
    status: "unverified",
    summary:
      "Up to $75,000 as a forgivable second lien, forgiven if you stay in the home for the full compliance period. By far the largest award in the region, but only for addresses inside Houston city limits.",
    notes: [
      "Only a small slice of Fort Bend ISD falls inside Houston city limits, but if your target address does, this is worth more than every other program combined.",
      "The income ceiling is genuinely low. Modeled here against roughly 80% of area median income, which you should confirm for your household size.",
      "Funding comes from federal HOME and CDBG allocations and pauses between cycles.",
    ],
    confidence: "needs-verification",
  },

  {
    id: "fort-bend-county-dpa",
    name: "Fort Bend County Housing Finance Corporation assistance",
    administrator: "Fort Bend County Community Development Department",
    url: "https://www.fortbendcountytx.gov/government/departments/community-development",
    kind: "forgivable-second",
    benefitBasis: "fixed-amount",
    benefitValue: 10_000,
    maxBenefit: 10_000,
    forgivenessYears: 5,
    secondLienRate: 0,
    secondLienTermMonths: null,
    taxCreditRate: null,
    taxCreditAnnualCap: null,
    ratePremium: 0,
    eligibility: {
      maxHouseholdIncome: 84_080,
      maxPurchasePrice: null,
      minCreditScore: 620,
      maxDti: null,
      requiresFirstTimeBuyer: true,
      requiresTexasHeroProfession: false,
      requiresVeteran: false,
      requiresHomebuyerEducation: true,
      compatibleLoanPrograms: CONVENTIONAL_AND_GOVERNMENT,
      eligibleLocationIds: null,
      manualChecks: [
        "Call the county Community Development Department to confirm the program is currently funded and open. County HOME-funded assistance is frequently exhausted or between cycles.",
        "The award amount modeled here is a placeholder. Get the current figure from the county before relying on it.",
        "Properties inside city limits of a city that runs its own program are often excluded from the county program.",
      ],
    },
    stackable: false,
    excludes: [],
    status: "unverified",
    summary:
      "County-administered federal HOME funds for down payment and closing costs, as a forgivable second lien for income-qualified first-time buyers.",
    notes: [
      "The single most important phone call on this list, because it is local, it is real, and its availability is impossible to determine from the web.",
      "County HFC assistance is modeled at $10,000. Confirm the current figure and whether the property is inside a city that runs its own program.",
    ],
    confidence: "needs-verification",
  },

  {
    id: "seth-5-star",
    name: "5 Star Texas Advantage Program",
    administrator: "Southeast Texas Housing Finance Corporation (SETH)",
    url: "https://www.sethfc.com/homebuyer-programs/",
    kind: "grant",
    benefitBasis: "percent-of-loan-amount",
    benefitValue: 0.05,
    maxBenefit: null,
    forgivenessYears: null,
    secondLienRate: null,
    secondLienTermMonths: null,
    taxCreditRate: null,
    taxCreditAnnualCap: null,
    ratePremium: 0.0075,
    eligibility: {
      maxHouseholdIncome: 156_000,
      maxPurchasePrice: null,
      minCreditScore: 620,
      maxDti: 0.5,
      requiresFirstTimeBuyer: false,
      requiresTexasHeroProfession: false,
      requiresVeteran: false,
      requiresHomebuyerEducation: true,
      compatibleLoanPrograms: CONVENTIONAL_AND_GOVERNMENT,
      eligibleLocationIds: null,
      manualChecks: [
        "Confirm Fort Bend County is in the current service area and that funds are available.",
        "Confirm the current assistance tiers, which have ranged from 3% to 6% of the loan amount.",
      ],
    },
    stackable: false,
    excludes: [
      "tsahc-home-sweet-texas",
      "tsahc-texas-heroes",
      "tdhca-my-first-texas-home",
    ],
    status: "unverified",
    summary:
      "Assistance of roughly 3% to 6% of the loan amount as a grant requiring no repayment, from the regional housing finance corporation serving the Houston area.",
    notes: [
      "A genuine alternative to TSAHC that many lenders never mention. Worth a quote purely for rate comparison.",
      "No first-time buyer requirement.",
    ],
    confidence: "needs-verification",
  },

  // -------------------------------------------------------------------------
  // Lender and agency credits
  // -------------------------------------------------------------------------
  {
    id: "homeready-very-low-income-credit",
    name: "HomeReady Very Low Income Purchase credit",
    administrator: "Fannie Mae, applied by the lender",
    url: "https://singlefamily.fanniemae.com/originating-underwriting/mortgage-products/homeready-mortgage",
    kind: "closing-credit",
    benefitBasis: "fixed-amount",
    benefitValue: 2_500,
    maxBenefit: 2_500,
    forgivenessYears: null,
    secondLienRate: null,
    secondLienTermMonths: null,
    taxCreditRate: null,
    taxCreditAnnualCap: null,
    ratePremium: 0,
    eligibility: {
      maxHouseholdIncome: 52_550,
      maxPurchasePrice: null,
      minCreditScore: 620,
      maxDti: null,
      requiresFirstTimeBuyer: false,
      requiresTexasHeroProfession: false,
      requiresVeteran: false,
      requiresHomebuyerEducation: true,
      compatibleLoanPrograms: ["homeready"],
      eligibleLocationIds: null,
      manualChecks: [
        "Requires qualifying income at or below 50% of area median income. The figure modeled here is an estimate of that threshold for this area; confirm it with the Fannie Mae area median income lookup tool.",
        "Confirm the credit is still being offered, as Fannie Mae has set and removed end dates for it.",
      ],
    },
    stackable: true,
    excludes: [],
    status: "unverified",
    summary:
      "A $2,500 credit toward down payment or closing costs for HomeReady borrowers at or below 50% of area median income.",
    notes: [
      "Small, but it stacks with state assistance and costs nothing to ask for.",
      "Only available on a HomeReady loan, which is another reason to prefer HomeReady over Conventional 97 when your income qualifies.",
    ],
    confidence: "needs-verification",
  },

  {
    id: "lender-community-grant",
    name: "Bank community lending grant (Chase, Bank of America and similar)",
    administrator: "Individual retail banks",
    url: "https://www.chase.com/personal/mortgage/education/financing-a-home/homebuyer-grant",
    kind: "closing-credit",
    benefitBasis: "fixed-amount",
    benefitValue: 7_500,
    maxBenefit: 7_500,
    forgivenessYears: null,
    secondLienRate: null,
    secondLienTermMonths: null,
    taxCreditRate: null,
    taxCreditAnnualCap: null,
    ratePremium: 0,
    eligibility: {
      maxHouseholdIncome: null,
      maxPurchasePrice: null,
      minCreditScore: 620,
      maxDti: null,
      requiresFirstTimeBuyer: false,
      requiresTexasHeroProfession: false,
      requiresVeteran: false,
      requiresHomebuyerEducation: false,
      compatibleLoanPrograms: CONVENTIONAL_AND_GOVERNMENT,
      eligibleLocationIds: null,
      manualChecks: [
        "These grants are tied to specific census tracts designated as majority-minority or low-to-moderate income. Eligibility is decided by the property address, not by your income.",
        "Give the exact address to two or three of these banks and ask them to run it against their grant-eligible tract list. It takes minutes and costs nothing.",
        "Parts of Missouri City, Fresno and Arcola are considerably more likely to qualify than Sugar Land.",
      ],
    },
    stackable: true,
    excludes: [],
    status: "unverified",
    summary:
      "Special purpose credit programs at large banks offering roughly $5,000 to $10,000 toward closing costs or rate buydown when the property sits in a designated census tract.",
    notes: [
      "Address-based rather than income-based, which makes it the one program a higher-income buyer can still get.",
      "Frequently stackable with a Mortgage Credit Certificate, and sometimes with state assistance. Ask each bank directly.",
      "Wells Fargo Homebuyer Access is not available in the Houston metro; do not count on it here. Chase and Bank of America still run address-based grants.",
    ],
    confidence: "needs-verification",
  },
];

