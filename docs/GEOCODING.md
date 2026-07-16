# Offline location geocoding (§4.1.6)

Profile `location` strings are matched against a bundled table of major cities (~150 entries). No external geocoding API is called; lat/lon features are derived entirely from stated text.

**Privacy:** Geocoded coordinates reflect only what the account owner chose to publish in their profile location field; they are not device GPS or IP-derived positions.

See `implementation/extractors/account-metadata/geocode.ts` and pair features `location_geo_distance_km` / `location_geo_near_match` in `location-pair.ts`.
