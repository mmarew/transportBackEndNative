/**
 * Encoder/decoder for the Google "encoded polyline" format that OSRM returns
 * when asked for `geometries=polyline`.
 */

const COORDINATE_PRECISION = 1e5;
const BITS_PER_CHUNK = 5;
const CONTINUATION_THRESHOLD = 0x1f; // 31
const BYTE_OFFSET = 63;

/**
 * Decode an encoded polyline into coordinate pairs.
 *
 * @param {string} str - Encoded polyline (OSRM `routes[0].geometry`).
 * @returns {Array<[number, number]>} Points as [longitude, latitude].
 */
const decodePolyline = (str) => {
  if (!str || typeof str !== "string") {
    return [];
  }

  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const readValue = () => {
    let result = 1;
    let shift = 0;
    let b;
    do {
      b = str.charCodeAt(index) - BYTE_OFFSET - 1;
      index += 1;
      result += b << shift;
      shift += BITS_PER_CHUNK;
    } while (b >= CONTINUATION_THRESHOLD);

    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < str.length) {
    lat += readValue();
    lng += readValue();
    points.push([lng / COORDINATE_PRECISION, lat / COORDINATE_PRECISION]);
  }

  return points;
};

module.exports = { decodePolyline };
