/**
 * JPEG EXIF parser.
 *
 * Pure-TypeScript parser for EXIF metadata embedded in JPEG files via
 * the APP1 segment. Operates on raw JPEG bytes and returns a
 * structured object with the diagnostic fields used by the §4.5.5
 * metadata-leakage signal (camera make/model, lens, software, GPS).
 *
 * Reusability: this module is purposely written to be importable by
 * the collection layer in addition to the EXIF extractor. The
 * collection layer downloads each image, calls parseJpegExif() to
 * extract EXIF, and writes the results into a per-account corpus
 * artifact (mimeType 'application/x-exif-corpus'). The extractor
 * then consumes the corpus and aggregates across images. Sharing the
 * parser ensures collection and extraction stay consistent.
 *
 * Determinism: pure function of input bytes. No randomness, no clock,
 * no I/O. Satisfies §6.1.
 *
 * Format reference:
 *   - JPEG markers: SOI 0xFFD8, APP1 0xFFE1, SOS 0xFFDA, EOI 0xFFD9
 *   - APP1 EXIF identifier: 6 bytes "Exif\0\0"
 *   - TIFF header inside APP1: byte order ("II" or "MM") + magic
 *     0x002A + IFD0 offset
 *   - IFD entries: 12 bytes each (tag, type, count, value-or-offset)
 *   - ExifIFD pointer tag: 0x8769 (in IFD0); GPS IFD pointer: 0x8825
 *
 * Supported types: BYTE (1), ASCII (2), SHORT (3), LONG (4),
 * RATIONAL (5). Other types (SBYTE, UNDEFINED, SSHORT, SLONG,
 * SRATIONAL, FLOAT, DOUBLE) are not parsed; tags using them are
 * silently skipped. The supported types cover every diagnostic
 * field this extractor needs.
 *
 * Failure modes: returns null when the input is not a valid JPEG,
 * has no APP1/EXIF segment, has a malformed TIFF header, or contains
 * a truncated IFD chain. Partial data is preferred over throwing:
 * the parser yields whatever fields it successfully extracted and
 * leaves the rest undefined.
 */

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export interface ParsedExif {
  make?: string;
  model?: string;
  software?: string;
  dateTime?: string;
  dateTimeOriginal?: string;
  dateTimeDigitized?: string;
  lensMake?: string;
  lensModel?: string;
  gps?: ParsedExifGps;
}

export interface ParsedExifGps {
  /** Signed decimal degrees (negative = south of equator). */
  latitude: number;
  /** Signed decimal degrees (negative = west of prime meridian). */
  longitude: number;
  /** Meters above sea level; negative below. Optional. */
  altitude?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// "Exif\0\0" in bytes.
const EXIF_IDENTIFIER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];

const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_SOFTWARE = 0x0131;
const TAG_DATETIME = 0x0132;
const TAG_EXIF_IFD_POINTER = 0x8769;
const TAG_GPS_IFD_POINTER = 0x8825;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_DATETIME_DIGITIZED = 0x9004;
const TAG_LENS_MAKE = 0xa433;
const TAG_LENS_MODEL = 0xa434;

const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LON_REF = 0x0003;
const TAG_GPS_LON = 0x0004;
const TAG_GPS_ALT_REF = 0x0005;
const TAG_GPS_ALT = 0x0006;

const TYPE_BYTE = 1;
const TYPE_ASCII = 2;
const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function parseJpegExif(bytes: Uint8Array): ParsedExif | null {
  // SOI marker
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  // Walk segments to find APP1 with EXIF identifier.
  let pos = 2;
  while (pos + 4 <= bytes.length) {
    // Each segment starts with 0xFF + marker byte.
    if (bytes[pos] !== 0xff) return null;
    let marker = bytes[pos + 1];

    // Skip padding 0xFF bytes (allowed between segments).
    while (marker === 0xff && pos + 2 < bytes.length) {
      pos++;
      marker = bytes[pos + 1];
    }

    // SOS (start of scan) or EOI: compressed data follows, no more
    // metadata segments. EXIF must precede SOS; if we got here
    // without finding it, there isn't one.
    if (marker === 0xda || marker === 0xd9) return null;

    // Standalone markers (no length field): SOI/EOI plus restart
    // markers RST0..RST7 (0xD0..0xD7).
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2;
      continue;
    }

    // Standard segment with 2-byte big-endian length.
    if (pos + 4 > bytes.length) return null;
    const segLen = (bytes[pos + 2] << 8) | bytes[pos + 3];
    if (segLen < 2) return null;
    const segDataStart = pos + 4;
    const segEnd = pos + 2 + segLen;
    if (segEnd > bytes.length) return null;

    if (marker === 0xe1 && segLen >= 8 + 6 && hasExifIdentifier(bytes, segDataStart)) {
      // The TIFF block starts after the "Exif\0\0" identifier.
      const tiff = bytes.subarray(segDataStart + 6, segEnd);
      return parseExifBlock(tiff);
    }

    pos = segEnd;
  }
  return null;
}

function hasExifIdentifier(bytes: Uint8Array, offset: number): boolean {
  for (let i = 0; i < EXIF_IDENTIFIER.length; i++) {
    if (bytes[offset + i] !== EXIF_IDENTIFIER[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// TIFF block
// ---------------------------------------------------------------------------

interface IfdEntry {
  tag: number;
  type: number;
  count: number;
  /** Raw 4 bytes from the entry's value/offset field. */
  rawValue: Uint8Array;
}

function parseExifBlock(tiff: Uint8Array): ParsedExif | null {
  if (tiff.length < 8) return null;

  let littleEndian: boolean;
  if (tiff[0] === 0x49 && tiff[1] === 0x49) littleEndian = true; // "II"
  else if (tiff[0] === 0x4d && tiff[1] === 0x4d) littleEndian = false; // "MM"
  else return null;

  const magic = readU16(tiff, 2, littleEndian);
  if (magic !== 0x002a) return null;

  const ifd0Offset = readU32(tiff, 4, littleEndian);
  if (ifd0Offset + 2 > tiff.length) return null;

  const ifd0 = readIfd(tiff, ifd0Offset, littleEndian);
  if (!ifd0) return null;

  const result: ParsedExif = {};

  setIfString(result, 'make', readEntryAscii(findEntry(ifd0, TAG_MAKE), tiff, littleEndian));
  setIfString(result, 'model', readEntryAscii(findEntry(ifd0, TAG_MODEL), tiff, littleEndian));
  setIfString(result, 'software', readEntryAscii(findEntry(ifd0, TAG_SOFTWARE), tiff, littleEndian));
  setIfString(result, 'dateTime', readEntryAscii(findEntry(ifd0, TAG_DATETIME), tiff, littleEndian));

  // ExifIFD
  const exifIfdOffset = readEntryAsScalarLong(
    findEntry(ifd0, TAG_EXIF_IFD_POINTER),
    littleEndian
  );
  if (exifIfdOffset !== null) {
    const exifIfd = readIfd(tiff, exifIfdOffset, littleEndian);
    if (exifIfd) {
      setIfString(
        result,
        'dateTimeOriginal',
        readEntryAscii(findEntry(exifIfd, TAG_DATETIME_ORIGINAL), tiff, littleEndian)
      );
      setIfString(
        result,
        'dateTimeDigitized',
        readEntryAscii(findEntry(exifIfd, TAG_DATETIME_DIGITIZED), tiff, littleEndian)
      );
      setIfString(
        result,
        'lensMake',
        readEntryAscii(findEntry(exifIfd, TAG_LENS_MAKE), tiff, littleEndian)
      );
      setIfString(
        result,
        'lensModel',
        readEntryAscii(findEntry(exifIfd, TAG_LENS_MODEL), tiff, littleEndian)
      );
    }
  }

  // GPS IFD
  const gpsIfdOffset = readEntryAsScalarLong(
    findEntry(ifd0, TAG_GPS_IFD_POINTER),
    littleEndian
  );
  if (gpsIfdOffset !== null) {
    const gpsIfd = readIfd(tiff, gpsIfdOffset, littleEndian);
    if (gpsIfd) {
      const gps = parseGps(gpsIfd, tiff, littleEndian);
      if (gps) result.gps = gps;
    }
  }

  return result;
}

function setIfString(obj: ParsedExif, key: keyof ParsedExif, value: string | null): void {
  if (value && value.length > 0) {
    (obj as Record<string, unknown>)[key] = value;
  }
}

// ---------------------------------------------------------------------------
// IFD parsing
// ---------------------------------------------------------------------------

function readIfd(tiff: Uint8Array, offset: number, littleEndian: boolean): IfdEntry[] | null {
  if (offset + 2 > tiff.length) return null;
  const count = readU16(tiff, offset, littleEndian);
  // Sanity: a malformed file could claim a huge count; cap at a value
  // far above any realistic IFD (typical IFDs have 5-30 entries).
  if (count === 0 || count > 1000) return null;
  if (offset + 2 + count * 12 > tiff.length) return null;

  const entries: IfdEntry[] = [];
  for (let i = 0; i < count; i++) {
    const entryOff = offset + 2 + i * 12;
    entries.push({
      tag: readU16(tiff, entryOff, littleEndian),
      type: readU16(tiff, entryOff + 2, littleEndian),
      count: readU32(tiff, entryOff + 4, littleEndian),
      rawValue: tiff.subarray(entryOff + 8, entryOff + 12),
    });
  }
  return entries;
}

function findEntry(ifd: IfdEntry[], tag: number): IfdEntry | null {
  for (const e of ifd) if (e.tag === tag) return e;
  return null;
}

// ---------------------------------------------------------------------------
// Type-specific value extraction
// ---------------------------------------------------------------------------

function readEntryAscii(
  entry: IfdEntry | null,
  tiff: Uint8Array,
  littleEndian: boolean
): string | null {
  if (!entry || entry.type !== TYPE_ASCII) return null;
  const totalBytes = entry.count;
  if (totalBytes === 0) return null;

  let bytes: Uint8Array;
  if (totalBytes <= 4) {
    bytes = entry.rawValue.subarray(0, totalBytes);
  } else {
    const offset = readU32FromBytes(entry.rawValue, 0, littleEndian);
    if (offset + totalBytes > tiff.length) return null;
    bytes = tiff.subarray(offset, offset + totalBytes);
  }

  // Decode as ASCII, stop at first null, drop non-printables defensively.
  let out = '';
  for (const b of bytes) {
    if (b === 0) break;
    if (b >= 0x20 && b <= 0x7e) out += String.fromCharCode(b);
  }
  return out.trim();
}

/**
 * Read an entry that's expected to be a single LONG value (most
 * commonly an IFD pointer). Returns the value, or null if the entry
 * isn't the right shape.
 */
function readEntryAsScalarLong(entry: IfdEntry | null, littleEndian: boolean): number | null {
  if (!entry) return null;
  if (entry.type !== TYPE_LONG || entry.count !== 1) return null;
  return readU32FromBytes(entry.rawValue, 0, littleEndian);
}

function readEntryByte(entry: IfdEntry | null): number | null {
  if (!entry || entry.type !== TYPE_BYTE || entry.count < 1) return null;
  return entry.rawValue[0];
}

function readEntryRationalArray(
  entry: IfdEntry | null,
  tiff: Uint8Array,
  littleEndian: boolean
): number[] | null {
  if (!entry || entry.type !== TYPE_RATIONAL || entry.count === 0) return null;
  const totalBytes = entry.count * 8;
  // RATIONAL is 8 bytes per element, so even a single RATIONAL is too
  // big to fit inline (4 bytes); always at an offset.
  if (totalBytes <= 4) return null;
  const offset = readU32FromBytes(entry.rawValue, 0, littleEndian);
  if (offset + totalBytes > tiff.length) return null;

  const out: number[] = [];
  for (let i = 0; i < entry.count; i++) {
    const numerator = readU32(tiff, offset + i * 8, littleEndian);
    const denominator = readU32(tiff, offset + i * 8 + 4, littleEndian);
    if (denominator === 0) return null;
    out.push(numerator / denominator);
  }
  return out;
}

// ---------------------------------------------------------------------------
// GPS
// ---------------------------------------------------------------------------

function parseGps(
  gpsIfd: IfdEntry[],
  tiff: Uint8Array,
  littleEndian: boolean
): ParsedExifGps | null {
  const latRef = readEntryAscii(findEntry(gpsIfd, TAG_GPS_LAT_REF), tiff, littleEndian);
  const lat = readEntryRationalArray(findEntry(gpsIfd, TAG_GPS_LAT), tiff, littleEndian);
  const lonRef = readEntryAscii(findEntry(gpsIfd, TAG_GPS_LON_REF), tiff, littleEndian);
  const lon = readEntryRationalArray(findEntry(gpsIfd, TAG_GPS_LON), tiff, littleEndian);

  if (!latRef || !lat || lat.length < 3) return null;
  if (!lonRef || !lon || lon.length < 3) return null;

  const latDegrees = lat[0] + lat[1] / 60 + lat[2] / 3600;
  const lonDegrees = lon[0] + lon[1] / 60 + lon[2] / 3600;

  const latSign = latRef.toUpperCase() === 'S' ? -1 : 1;
  const lonSign = lonRef.toUpperCase() === 'W' ? -1 : 1;

  const result: ParsedExifGps = {
    latitude: latDegrees * latSign,
    longitude: lonDegrees * lonSign,
  };

  // Validate range: latitude [-90, 90], longitude [-180, 180]. Reject
  // out-of-range values rather than emit garbage.
  if (result.latitude < -90 || result.latitude > 90) return null;
  if (result.longitude < -180 || result.longitude > 180) return null;

  const altRef = readEntryByte(findEntry(gpsIfd, TAG_GPS_ALT_REF));
  const alt = readEntryRationalArray(findEntry(gpsIfd, TAG_GPS_ALT), tiff, littleEndian);
  if (alt && alt.length >= 1) {
    result.altitude = (altRef === 1 ? -1 : 1) * alt[0];
  }

  return result;
}

// ---------------------------------------------------------------------------
// Byte-level readers
// ---------------------------------------------------------------------------

function readU16(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  if (littleEndian) {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readU32(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  if (littleEndian) {
    return (
      (bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)) >>>
      0
    );
  }
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function readU32FromBytes(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  return readU32(bytes, offset, littleEndian);
}
