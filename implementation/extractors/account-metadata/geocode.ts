/**
 * Offline geocoding for free-text profile location strings (§4.1.6).
 *
 * Workers-safe: bundled city table, no network I/O. Matches normalized
 * location text against major city names and common aliases.
 */

export interface GeocodeResult {
  lat: number;
  lon: number;
  label: string;
  confidence: number;
}

interface CityEntry {
  name: string;
  lat: number;
  lon: number;
  aliases?: string[];
}

/** Major cities (~150) with lat/lon for offline profile-location geocoding. */
const CITIES: CityEntry[] = [
  { name: 'New York', lat: 40.7128, lon: -74.006, aliases: ['nyc', 'new york city', 'manhattan', 'brooklyn'] },
  { name: 'Los Angeles', lat: 34.0522, lon: -118.2437, aliases: ['la', 'los angeles ca'] },
  { name: 'Chicago', lat: 41.8781, lon: -87.6298 },
  { name: 'Houston', lat: 29.7604, lon: -95.3698 },
  { name: 'Phoenix', lat: 33.4484, lon: -112.074 },
  { name: 'Philadelphia', lat: 39.9526, lon: -75.1652, aliases: ['philly'] },
  { name: 'San Antonio', lat: 29.4241, lon: -98.4936 },
  { name: 'San Diego', lat: 32.7157, lon: -117.1611 },
  { name: 'Dallas', lat: 32.7767, lon: -96.797 },
  { name: 'San Jose', lat: 37.3382, lon: -121.8863 },
  { name: 'Austin', lat: 30.2672, lon: -97.7431 },
  { name: 'Jacksonville', lat: 30.3322, lon: -81.6557 },
  { name: 'San Francisco', lat: 37.7749, lon: -122.4194, aliases: ['sf', 'bay area'] },
  { name: 'Columbus', lat: 39.9612, lon: -82.9988 },
  { name: 'Charlotte', lat: 35.2271, lon: -80.8431 },
  { name: 'Indianapolis', lat: 39.7684, lon: -86.1581 },
  { name: 'Seattle', lat: 47.6062, lon: -122.3321 },
  { name: 'Denver', lat: 39.7392, lon: -104.9903 },
  { name: 'Washington', lat: 38.9072, lon: -77.0369, aliases: ['washington dc', 'dc', 'washington d.c.'] },
  { name: 'Boston', lat: 42.3601, lon: -71.0589 },
  { name: 'Nashville', lat: 36.1627, lon: -86.7816 },
  { name: 'Detroit', lat: 42.3314, lon: -83.0458 },
  { name: 'Portland', lat: 45.5152, lon: -122.6784, aliases: ['portland or', 'portland oregon'] },
  { name: 'Las Vegas', lat: 36.1699, lon: -115.1398 },
  { name: 'Miami', lat: 25.7617, lon: -80.1918 },
  { name: 'Atlanta', lat: 33.749, lon: -84.388 },
  { name: 'Minneapolis', lat: 44.9778, lon: -93.265 },
  { name: 'Tampa', lat: 27.9506, lon: -82.4572 },
  { name: 'New Orleans', lat: 29.9511, lon: -90.0715 },
  { name: 'Cleveland', lat: 41.4993, lon: -81.6944 },
  { name: 'Pittsburgh', lat: 40.4406, lon: -79.9959 },
  { name: 'Cincinnati', lat: 39.1031, lon: -84.512 },
  { name: 'St. Louis', lat: 38.627, lon: -90.1994, aliases: ['saint louis', 'st louis'] },
  { name: 'Kansas City', lat: 39.0997, lon: -94.5786 },
  { name: 'Salt Lake City', lat: 40.7608, lon: -111.891 },
  { name: 'Raleigh', lat: 35.7796, lon: -78.6382 },
  { name: 'Honolulu', lat: 21.3069, lon: -157.8583 },
  { name: 'Toronto', lat: 43.6532, lon: -79.3832 },
  { name: 'Montreal', lat: 45.5017, lon: -73.5673, aliases: ['montréal'] },
  { name: 'Vancouver', lat: 49.2827, lon: -123.1207 },
  { name: 'Calgary', lat: 51.0447, lon: -114.0719 },
  { name: 'Ottawa', lat: 45.4215, lon: -75.6972 },
  { name: 'Edmonton', lat: 53.5461, lon: -113.4938 },
  { name: 'Mexico City', lat: 19.4326, lon: -99.1332, aliases: ['cdmx', 'ciudad de mexico'] },
  { name: 'Guadalajara', lat: 20.6597, lon: -103.3496 },
  { name: 'Monterrey', lat: 25.6866, lon: -100.3161 },
  { name: 'London', lat: 51.5074, lon: -0.1278, aliases: ['london uk', 'london england'] },
  { name: 'Manchester', lat: 53.4808, lon: -2.2426 },
  { name: 'Birmingham', lat: 52.4862, lon: -1.8904, aliases: ['birmingham uk'] },
  { name: 'Edinburgh', lat: 55.9533, lon: -3.1883 },
  { name: 'Glasgow', lat: 55.8642, lon: -4.2518 },
  { name: 'Dublin', lat: 53.3498, lon: -6.2603 },
  { name: 'Paris', lat: 48.8566, lon: 2.3522 },
  { name: 'Marseille', lat: 43.2965, lon: 5.3698 },
  { name: 'Lyon', lat: 45.764, lon: 4.8357 },
  { name: 'Berlin', lat: 52.52, lon: 13.405 },
  { name: 'Munich', lat: 48.1351, lon: 11.582, aliases: ['münchen'] },
  { name: 'Frankfurt', lat: 50.1109, lon: 8.6821 },
  { name: 'Hamburg', lat: 53.5511, lon: 9.9937 },
  { name: 'Cologne', lat: 50.9375, lon: 6.9603, aliases: ['köln'] },
  { name: 'Amsterdam', lat: 52.3676, lon: 4.9041 },
  { name: 'Rotterdam', lat: 51.9244, lon: 4.4777 },
  { name: 'Brussels', lat: 50.8503, lon: 4.3517 },
  { name: 'Madrid', lat: 40.4168, lon: -3.7038 },
  { name: 'Barcelona', lat: 41.3851, lon: 2.1734 },
  { name: 'Valencia', lat: 39.4699, lon: -0.3763 },
  { name: 'Lisbon', lat: 38.7223, lon: -9.1393, aliases: ['lisboa'] },
  { name: 'Porto', lat: 41.1579, lon: -8.6291 },
  { name: 'Rome', lat: 41.9028, lon: 12.4964, aliases: ['roma'] },
  { name: 'Milan', lat: 45.4642, lon: 9.19, aliases: ['milano'] },
  { name: 'Naples', lat: 40.8518, lon: 14.2681, aliases: ['napoli'] },
  { name: 'Vienna', lat: 48.2082, lon: 16.3738, aliases: ['wien'] },
  { name: 'Zurich', lat: 47.3769, lon: 8.5417, aliases: ['zürich'] },
  { name: 'Geneva', lat: 46.2044, lon: 6.1432, aliases: ['genève'] },
  { name: 'Stockholm', lat: 59.3293, lon: 18.0686 },
  { name: 'Oslo', lat: 59.9139, lon: 10.7522 },
  { name: 'Copenhagen', lat: 55.6761, lon: 12.5683, aliases: ['københavn'] },
  { name: 'Helsinki', lat: 60.1699, lon: 24.9384 },
  { name: 'Warsaw', lat: 52.2297, lon: 21.0122, aliases: ['warszawa'] },
  { name: 'Krakow', lat: 50.0647, lon: 19.945, aliases: ['kraków'] },
  { name: 'Prague', lat: 50.0755, lon: 14.4378, aliases: ['praha'] },
  { name: 'Budapest', lat: 47.4979, lon: 19.0402 },
  { name: 'Athens', lat: 37.9838, lon: 23.7275 },
  { name: 'Istanbul', lat: 41.0082, lon: 28.9784, aliases: ['istanbul turkey'] },
  { name: 'Ankara', lat: 39.9334, lon: 32.8597 },
  { name: 'Moscow', lat: 55.7558, lon: 37.6173, aliases: ['moskva'] },
  { name: 'Saint Petersburg', lat: 59.9311, lon: 30.3609, aliases: ['st petersburg', 'saint petersburg'] },
  { name: 'Kyiv', lat: 50.4501, lon: 30.5234, aliases: ['kiev'] },
  { name: 'Dubai', lat: 25.2048, lon: 55.2708 },
  { name: 'Abu Dhabi', lat: 24.4539, lon: 54.3773 },
  { name: 'Riyadh', lat: 24.7136, lon: 46.6753 },
  { name: 'Tel Aviv', lat: 32.0853, lon: 34.7818 },
  { name: 'Jerusalem', lat: 31.7683, lon: 35.2137 },
  { name: 'Cairo', lat: 30.0444, lon: 31.2357 },
  { name: 'Lagos', lat: 6.5244, lon: 3.3792 },
  { name: 'Nairobi', lat: -1.2921, lon: 36.8219 },
  { name: 'Johannesburg', lat: -26.2041, lon: 28.0473, aliases: ['joburg'] },
  { name: 'Cape Town', lat: -33.9249, lon: 18.4241 },
  { name: 'Mumbai', lat: 19.076, lon: 72.8777, aliases: ['bombay'] },
  { name: 'Delhi', lat: 28.7041, lon: 77.1025, aliases: ['new delhi'] },
  { name: 'Bangalore', lat: 12.9716, lon: 77.5946, aliases: ['bengaluru'] },
  { name: 'Chennai', lat: 13.0827, lon: 80.2707 },
  { name: 'Kolkata', lat: 22.5726, lon: 88.3639, aliases: ['calcutta'] },
  { name: 'Hyderabad', lat: 17.385, lon: 78.4867 },
  { name: 'Karachi', lat: 24.8607, lon: 67.0011 },
  { name: 'Lahore', lat: 31.5204, lon: 74.3587 },
  { name: 'Islamabad', lat: 33.6844, lon: 73.0479 },
  { name: 'Dhaka', lat: 23.8103, lon: 90.4125 },
  { name: 'Bangkok', lat: 13.7563, lon: 100.5018 },
  { name: 'Singapore', lat: 1.3521, lon: 103.8198 },
  { name: 'Kuala Lumpur', lat: 3.139, lon: 101.6869, aliases: ['kl'] },
  { name: 'Jakarta', lat: -6.2088, lon: 106.8456 },
  { name: 'Manila', lat: 14.5995, lon: 120.9842 },
  { name: 'Ho Chi Minh City', lat: 10.8231, lon: 106.6297, aliases: ['saigon', 'hcmc'] },
  { name: 'Hanoi', lat: 21.0285, lon: 105.8542 },
  { name: 'Seoul', lat: 37.5665, lon: 126.978, aliases: ['seoul korea'] },
  { name: 'Busan', lat: 35.1796, lon: 129.0756 },
  { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
  { name: 'Osaka', lat: 34.6937, lon: 135.5023 },
  { name: 'Kyoto', lat: 35.0116, lon: 135.7681 },
  { name: 'Yokohama', lat: 35.4437, lon: 139.638 },
  { name: 'Beijing', lat: 39.9042, lon: 116.4074, aliases: ['peking'] },
  { name: 'Shanghai', lat: 31.2304, lon: 121.4737 },
  { name: 'Guangzhou', lat: 23.1291, lon: 113.2644, aliases: ['canton'] },
  { name: 'Shenzhen', lat: 22.5431, lon: 114.0579 },
  { name: 'Hong Kong', lat: 22.3193, lon: 114.1694 },
  { name: 'Taipei', lat: 25.033, lon: 121.5654 },
  { name: 'Sydney', lat: -33.8688, lon: 151.2093 },
  { name: 'Melbourne', lat: -37.8136, lon: 144.9631 },
  { name: 'Brisbane', lat: -27.4698, lon: 153.0251 },
  { name: 'Perth', lat: -31.9505, lon: 115.8605 },
  { name: 'Auckland', lat: -36.8485, lon: 174.7633 },
  { name: 'Wellington', lat: -41.2865, lon: 174.7762 },
  { name: 'Buenos Aires', lat: -34.6037, lon: -58.3816 },
  { name: 'São Paulo', lat: -23.5505, lon: -46.6333, aliases: ['sao paulo'] },
  { name: 'Rio de Janeiro', lat: -22.9068, lon: -43.1729, aliases: ['rio'] },
  { name: 'Bogotá', lat: 4.711, lon: -74.0721, aliases: ['bogota'] },
  { name: 'Lima', lat: -12.0464, lon: -77.0428 },
  { name: 'Santiago', lat: -33.4489, lon: -70.6693 },
  { name: 'Caracas', lat: 10.4806, lon: -66.9036 },
];

const EXACT_LOOKUP = buildLookup(CITIES);

/**
 * Geocode a free-text profile location against the bundled city table.
 * Returns null when no confident match is found.
 */
export function geocodeLocationString(raw: string): GeocodeResult | null {
  const normalized = normalizeLocation(raw);
  if (!normalized) return null;

  const segments = normalized.split(',').map(s => s.trim()).filter(Boolean);
  const candidates = [normalized, ...segments];

  for (const candidate of candidates) {
    const exact = EXACT_LOOKUP.get(candidate);
    if (exact) {
      return {
        lat: exact.lat,
        lon: exact.lon,
        label: exact.name,
        confidence: 1,
      };
    }
  }

  for (const city of CITIES) {
    const names = [city.name, ...(city.aliases ?? [])];
    for (const name of names) {
      const normName = normalizeToken(name);
      if (normName.length < 3) continue;
      for (const candidate of candidates) {
        if (candidate === normName) {
          return { lat: city.lat, lon: city.lon, label: city.name, confidence: 0.95 };
        }
        if (candidate.includes(normName) || normName.includes(candidate)) {
          if (candidate.length >= 3 && normName.length >= 3) {
            return { lat: city.lat, lon: city.lon, label: city.name, confidence: 0.7 };
          }
        }
      }
    }
  }

  return null;
}

/** Great-circle distance in kilometers (Earth radius 6371 km). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function buildLookup(cities: CityEntry[]): Map<string, CityEntry> {
  const map = new Map<string, CityEntry>();
  for (const city of cities) {
    map.set(normalizeToken(city.name), city);
    for (const alias of city.aliases ?? []) {
      map.set(normalizeToken(alias), city);
    }
  }
  return map;
}

function normalizeLocation(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s,./-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeToken(raw: string): string {
  return normalizeLocation(raw).replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
}
