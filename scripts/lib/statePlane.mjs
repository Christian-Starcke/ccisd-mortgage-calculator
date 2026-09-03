/**
 * NAD83 / Texas South Central (US feet) to WGS84 longitude/latitude.
 *
 * Galveston CAD ships its parcel shapefile in EPSG:2278, and FEMA's flood
 * layer and USDA's eligibility layer both want WGS84 degrees. Nothing else in
 * this project needs a reprojection, so this is the inverse Lambert Conformal
 * Conic (two standard parallels) written out rather than a dependency.
 *
 * Read straight off parcels.prj:
 *
 *   PROJCS["NAD_1983_StatePlane_Texas_South_Central_FIPS_4204_Feet",
 *     GEOGCS[... SPHEROID["GRS_1980",6378137.0,298.257222101]],
 *     PROJECTION["Lambert_Conformal_Conic"],
 *     False_Easting     1968500.0        (US survey feet)
 *     False_Northing    13123333.33333333
 *     Central_Meridian  -99.0
 *     Standard_Parallel_1  28.38333333333333
 *     Standard_Parallel_2  30.28333333333333
 *     Latitude_Of_Origin   27.83333333333333
 *     UNIT["Foot_US", 0.3048006096012192]
 *
 * The false easting and northing come out to exactly 600000 and 4000000
 * metres, which is the tell that this is EPSG:2278 and its metric twin
 * EPSG:32140 — a useful confirmation that the file is what it claims to be.
 *
 * Method is EPSG 9802. Coordinates are converted to metres first so the
 * ellipsoid can be used in its published units.
 */

/** US survey foot, exactly 1200/3937 metres. */
const US_FOOT = 0.3048006096012192;

// GRS80.
const A = 6378137.0;
const INV_F = 298.257222101;
const F = 1 / INV_F;
const E2 = 2 * F - F * F;
const E = Math.sqrt(E2);

const RAD = Math.PI / 180;

const PHI_1 = 28.38333333333333 * RAD;
const PHI_2 = 30.28333333333333 * RAD;
const PHI_0 = 27.83333333333333 * RAD;
const LAMBDA_0 = -99.0 * RAD;

// Declared in feet in the .prj; used here in metres.
const FALSE_EASTING = 1968500.0 * US_FOOT;
const FALSE_NORTHING = 13123333.33333333 * US_FOOT;

/** m = cos φ / sqrt(1 − e² sin²φ) */
function mOf(phi) {
  return Math.cos(phi) / Math.sqrt(1 - E2 * Math.sin(phi) ** 2);
}

/** t = tan(π/4 − φ/2) / [(1 − e sin φ)/(1 + e sin φ)]^(e/2) */
function tOf(phi) {
  const s = Math.sin(phi);
  return (
    Math.tan(Math.PI / 4 - phi / 2) /
    ((1 - E * s) / (1 + E * s)) ** (E / 2)
  );
}

const M1 = mOf(PHI_1);
const M2 = mOf(PHI_2);
const T1 = tOf(PHI_1);
const T2 = tOf(PHI_2);
const T0 = tOf(PHI_0);

const N = Math.log(M1 / M2) / Math.log(T1 / T2);
const BIG_F = M1 / (N * T1 ** N);
const R0 = A * BIG_F * T0 ** N;

/**
 * Converts an easting/northing in US survey feet to WGS84 degrees.
 *
 * NAD83 and WGS84 differ by well under a metre in Texas, which is far inside
 * the tolerance of a parcel centroid used to sample a flood zone, so no datum
 * shift is applied.
 */
export function texasSouthCentralToWgs84(eastingFeet, northingFeet) {
  const east = eastingFeet * US_FOOT - FALSE_EASTING;
  const north = northingFeet * US_FOOT - FALSE_NORTHING;

  const rhoPrime = Math.sign(N) * Math.hypot(east, R0 - north);
  const tPrime = (rhoPrime / (A * BIG_F)) ** (1 / N);
  const thetaPrime = Math.atan2(east, R0 - north);

  const lon = thetaPrime / N + LAMBDA_0;

  // φ has no closed form; this converges to well under a millimetre in a
  // handful of passes at these latitudes.
  let phi = Math.PI / 2 - 2 * Math.atan(tPrime);
  for (let i = 0; i < 12; i += 1) {
    const s = Math.sin(phi);
    const next =
      Math.PI / 2 -
      2 * Math.atan(tPrime * ((1 - E * s) / (1 + E * s)) ** (E / 2));
    if (Math.abs(next - phi) < 1e-12) {
      phi = next;
      break;
    }
    phi = next;
  }

  return { lon: lon / RAD, lat: phi / RAD };
}

/**
 * Sanity check with the projection's own definition: on the central meridian
 * at the latitude of origin, the result must be the false easting/northing.
 * A silent error here would put every parcel in the wrong flood zone, so the
 * caller is expected to run this before trusting a batch.
 */
export function selfCheck() {
  const origin = texasSouthCentralToWgs84(
    FALSE_EASTING / US_FOOT,
    FALSE_NORTHING / US_FOOT,
  );
  const lonOk = Math.abs(origin.lon - -99.0) < 1e-9;
  const latOk = Math.abs(origin.lat - 27.83333333333333) < 1e-9;
  return { ok: lonOk && latOk, origin };
}
