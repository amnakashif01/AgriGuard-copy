# Current-location marketplace search

The marketplace now offers Use My Location. Browser permission is requested only on a click, with a fresh high-accuracy fix and a 15-second timeout. Device coordinates take precedence over the profile city for this page session; the profile is not changed. Users can return to their saved city. Permission denial, timeout and unavailable GPS have explicit recovery messages.

The selected 10, 15, 20, 25 or 50 km radius is calculated from the chosen origin using Haversine distance. Results are nearest first and must also be in the same country. A 50 km circle around Lahore crosses the international border, which explained the earlier Indian listings even when the origin was correctly resolved to Lahore.

Country lookup uses the pinned ISC-licensed `@rapideditor/country-coder` package locally on the server. Its generalized boundaries are not intended for legal or parcel-level boundary decisions. The OpenStreetMap request is country-constrained and uses a broad integer-degree regional bounding box that covers the maximum 50 km radius. Precise device coordinates are not sent to that public service. The server applies exact distance and local country checks again to every returned listing. Regional directory responses are cached for 15 minutes; the API response with the chosen origin is private/no-store.

Registered Firestore suppliers and free OpenStreetMap listings are loaded concurrently and labeled separately. Both sources use the same country, radius and product matching. A source failure is disclosed; failure of both sources returns a retryable error. This marketplace route no longer invokes Google Places or the old hardcoded fallback directory. Public listings are not represented as verified registrations. Search terms are never injected into a supplier's product list. Unrelated poultry/dairy/honey farm shops are excluded unless their mapped details establish crop relevance.

No API key, paid map subscription, database migration or additional Vercel function is required. Existing public supplier read rules are reused, without changing access permissions. Free directory coverage and stock details vary by area; an empty result stays empty. Contacts are displayed only when present.

Validation: targeted tests cover country/radius boundaries, current-versus-saved origins, coarse requests, genuine product matching, registration/directory merges and source outages. Browser verification and the production deployment are recorded in the release summary.
