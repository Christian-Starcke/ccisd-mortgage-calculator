import { findLocationPreset } from "@/data/clearCreekTaxRates";
import type { ResolvedParcel } from "@/lib/lookups/types";
import type { UpdateState } from "./defaults";
import {
  assessExposure,
  assessWindExposure,
  type WindstormAssessment,
} from "./windstorm";

/**
 * The property's wind exposure, from the best evidence available.
 *
 * A resolved parcel carries its own county and taxing units, which is what the
 * designation actually turns on, so it always wins. The location preset is the
 * fallback for the no-address case, where a city is all there is to go on.
 *
 * This ordering is the whole point of the function. The location dropdown used
 * to write exposure straight into state, so changing it after a parcel was
 * resolved silently overrode the parcel: picking an inland Harris city on a
 * League City parcel dropped a mandatory windstorm premium of about $108 a
 * month while the tax carried on being billed from the Galveston roll. The
 * field even labels itself "Inferred from the parcel", so it was contradicting
 * the source it claimed to be reading.
 */
export function windExposureFor(args: {
  parcel: ResolvedParcel | null;
  locationId: string;
}): WindstormAssessment {
  const { parcel, locationId } = args;
  if (parcel) {
    return assessWindExposure({
      county: parcel.ref.county,
      taxUnitCodes: parcel.taxUnitCodes,
    });
  }
  return assessExposure(findLocationPreset(locationId).windExposure);
}

/**
 * Writes that exposure into state. The single place any of these four fields
 * are set together, so they cannot disagree with each other.
 */
export function applyWindExposure(
  update: UpdateState,
  args: { parcel: ResolvedParcel | null; locationId: string },
): WindstormAssessment {
  const wind = windExposureFor(args);
  update("separateWindstormPolicy", wind.separatePolicyRequired);
  update("windstormUncertain", wind.verifyByAddress);
  update("insuranceRatePerThousand", wind.homeownersRatePerThousand);
  if (wind.separatePolicyRequired) {
    update("windstormRatePerThousand", wind.windstormRatePerThousand);
  }
  return wind;
}
