/**
 * Just enough shapefile reading to get a centroid per parcel.
 *
 * Galveston CAD's parcels.shp is 78 MB of PolygonZ records. All this needs is
 * one representative point per parcel to sample the FEMA flood layer with, so
 * it reads the XY ring and ignores the Z and M arrays that follow it.
 *
 * Shapefile records and .dbf records are 1:1 in the same order, which is what
 * lets the GEOID be paired with the geometry without a spatial index.
 */
import fs from "node:fs";

const NULL_SHAPE = 0;
const POLYGON = 5;
const POLYGON_Z = 15;
const POLYGON_M = 25;

const POLYGON_TYPES = new Set([POLYGON, POLYGON_Z, POLYGON_M]);

/**
 * Average of the first ring's vertices.
 *
 * Deliberately the same method the Harris side uses on the live ArcGIS
 * geometry, so a flood answer does not depend on which county the parcel is
 * in. It is not the area centroid, but on a residential lot the difference is
 * a few metres and a flood zone is mapped over a far coarser area than that.
 */
function ringCentroid(xs, ys, start, end) {
  let x = 0;
  let y = 0;
  const n = end - start;
  if (n <= 0) return null;
  for (let i = start; i < end; i += 1) {
    x += xs[i];
    y += ys[i];
  }
  return { x: x / n, y: y / n };
}

export function readShapefileHeader(file) {
  const fd = fs.openSync(file, "r");
  const head = Buffer.alloc(100);
  fs.readSync(fd, head, 0, 100, 0);
  const fileCode = head.readInt32BE(0);
  if (fileCode !== 9994) {
    fs.closeSync(fd);
    throw new Error(`${file} is not a shapefile (file code ${fileCode}).`);
  }
  const shapeType = head.readInt32LE(32);
  if (!POLYGON_TYPES.has(shapeType)) {
    fs.closeSync(fd);
    throw new Error(
      `${file} holds shape type ${shapeType}; expected a polygon type.`,
    );
  }
  return { fd, shapeType, fileLength: head.readInt32BE(24) * 2 };
}

/**
 * Yields one centroid per record, in file order, in the shapefile's own
 * projected units. Null shapes yield null so the index still lines up with
 * the .dbf.
 */
export function* shapeCentroids(file) {
  const { fd, fileLength } = readShapefileHeader(file);
  let offset = 100;
  const recHeader = Buffer.alloc(8);

  try {
    while (offset < fileLength) {
      if (fs.readSync(fd, recHeader, 0, 8, offset) < 8) break;
      const contentLength = recHeader.readInt32BE(4) * 2;
      const body = Buffer.alloc(contentLength);
      fs.readSync(fd, body, 0, contentLength, offset + 8);
      offset += 8 + contentLength;

      const type = body.readInt32LE(0);
      if (type === NULL_SHAPE) {
        yield null;
        continue;
      }

      // 4 type + 32 bbox, then part and point counts.
      const numParts = body.readInt32LE(36);
      const numPoints = body.readInt32LE(40);
      if (numParts < 1 || numPoints < 1) {
        yield null;
        continue;
      }

      const partsAt = 44;
      const pointsAt = partsAt + numParts * 4;
      const firstRingEnd =
        numParts > 1 ? body.readInt32LE(partsAt + 4) : numPoints;

      const xs = new Float64Array(firstRingEnd);
      const ys = new Float64Array(firstRingEnd);
      for (let i = 0; i < firstRingEnd; i += 1) {
        const at = pointsAt + i * 16;
        xs[i] = body.readDoubleLE(at);
        ys[i] = body.readDoubleLE(at + 8);
      }

      yield ringCentroid(xs, ys, 0, firstRingEnd);
    }
  } finally {
    fs.closeSync(fd);
  }
}
