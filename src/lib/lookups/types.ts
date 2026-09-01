import type { TaxingUnit } from "@/lib/propertyTax";

export interface AddressCandidate {
  objectId: number;
  situs: string;
  taxUnitCodes: string[];
  totalValue: number | null;
  yearBuilt: number | null;
  livingSqFt: number | null;
}

export interface FloodLookup {
  zone: string | null;
  inSpecialFloodHazardArea: boolean;
}

export interface ResolvedParcel {
  objectId: number;
  situs: string;
  taxUnitCodes: string[];
  taxingUnits: TaxingUnit[];
  missingRateCodes: string[];
  totalValue: number | null;
  landValue: number | null;
  improvementValue: number | null;
  yearBuilt: number | null;
  livingSqFt: number | null;
  sellerExemptions: string | null;
  centroid: { lon: number; lat: number } | null;
  usdaEligible: boolean | null;
  flood: FloodLookup | null;
  isFortBendIsd: boolean;
  schoolCode: string | null;
  schoolName: string | null;
  inferredLocationId: string;
  hasMud: boolean;
  lookupAt: string;
}

export type LookupStatus =
  | "idle"
  | "searching"
  | "awaiting-pick"
  | "looking-up"
  | "resolved"
  | "outside-fbisd"
  | "error";
