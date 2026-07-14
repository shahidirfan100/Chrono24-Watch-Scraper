# API Discovery — Chrono24 Watch Scraper

Discovery Date: 2026-05-20
Discovery Method: URLScan.io + browser DevTools network inspection

---

## Discovery Summary

Chrono24 is a **fully server-side rendered (SSR)** application protected by Cloudflare. It does **not** expose a public REST, GraphQL, or `/_next/data/` API that can be called directly. All watch listing data is embedded inside each HTML page at render time.

---

## Candidates Evaluated

### Candidate 1: Direct REST API calls (`/api/search`, `/api/v1/...`)
- **Result**: 403 Forbidden — Cloudflare blocks all non-browser HTTP requests to API-pattern paths
- **Score**: 0 — rejected

### Candidate 2: `/_next/data/` endpoint
- **Result**: Not present — Chrono24 is NOT a Next.js app
- **Score**: 0 — rejected

### Candidate 3: XHR/Fetch JSON API (checked via URLScan.io + DevTools)
- **Result**: All 133 network requests on homepage are static assets, images, analytics pings — zero JSON listing endpoints
- **Score**: 0 — rejected

### Candidate 4: `window.__NEXT_DATA__` / `window.__INITIAL_STATE__`
- **Result**: Not found on Chrono24 — they use a custom SSR stack, not Next.js or React hydration globals
- **Score**: 0 — rejected

### Candidate 5: JSON-LD Structured Data (`script[type="application/ld+json"]`) ✅ WINNER
- **Result**: **Every search/category page embeds all 60 visible listings** as a JSON-LD `AggregateOffer` schema
- **Auth**: None — parseable from HTML response
- **Pagination**: Standard page iteration via `index-{N}.htm` URL pattern
- **Score**: 95 — SELECTED

---

## Selected API: JSON-LD Structured Data

### Endpoint Pattern

```
GET https://www.chrono24.com/{brand}/index.htm?dosearch=true&query={keyword}&pageSize=60&showPage={page}
GET https://www.chrono24.com/{brand}/index-{page}.htm?pageSize=60
```

### Method
`GET` — standard HTTP request with browser headers

### Auth
None required — but `User-Agent`, `Accept`, and `Referer` headers must simulate a real browser to pass Cloudflare checks. Residential proxy recommended on Apify.

### Pagination
- Page 1: `index.htm?showPage=1`
- Page N: `index-{N}.htm` (e.g., `index-2.htm`, `index-3.htm`)
- Page size: `pageSize=60` (max visible per page)

### Data Location

```javascript
// In the HTML response:
const $ = cheerio.load(body);
const ldScripts = $('script[type="application/ld+json"]');
// One of the script tags contains @type = "ItemList" or "AggregateOffer"
```

### Fields Available (from JSON-LD `AggregateOffer.offers[]`)

| Field | JSON-LD Path | Type |
|---|---|---|
| `name` | `offer.name` | String |
| `price` | `offer.price` | String/Number |
| `url` | `offer.url` | String |
| `image_url` | `offer.image[0].contentUrl` | String |
| `availability` | `offer.availability` | String |
| `currency` | `offer.priceCurrency` | String |
| `brand` | (derived from search query/URL) | String |
| `total_listings` | `aggregateOffer.offerCount` | Number |
| `low_price` | `aggregateOffer.lowPrice` | String |
| `high_price` | `aggregateOffer.highPrice` | String |

### Fields Currently Missing in Old Actor (New with this approach)
- `availability` — in-stock status per listing
- `priceCurrency` — explicit currency code from schema
- `offerCount` — total results for the search query
- `lowPrice` / `highPrice` — price range metadata for the search

### Field Count
- JSON-LD offers: **~8–10 fields per listing** (vs old actor: ~11 fields, but mostly null/undefined)
- Old actor parsed HTML looking for JSON APIs that don't exist — returned 0 real listings without proxy

### Why JSON-LD Was Selected

1. **Officially embedded by Chrono24** for SEO — stable, intentional, and maintained
2. **No special authentication** needed beyond standard browser headers
3. **All listings are present** (all 60 per page) — no AJAX loading
4. **Structured, typed data** — no fragile CSS selector parsing
5. **Pagination is simple** — deterministic URL pattern

---

## Why Direct HTTP API Was Rejected

- Chrono24 is fully server-side rendered — no public JSON API endpoints exist
- URLScan.io scan (uuid: `019e2f16-c9f4-7102-8c12-5ecdac25e4eb`) of `chrono24.com` shows zero JSON listing API calls in the 133 captured network requests
- All dynamic data loads happen server-side before HTML is sent to the browser
- Cloudflare blocks any request that looks like a bot making API calls

---

## Whether Actor Can Stay HTTP-Based (No Playwright)

**YES** — with proper headers and optionally residential proxy:
- `HttpCrawler` from `crawlee` + `cheerio` parses the HTML and extracts JSON-LD
- No JavaScript rendering required — all data is in the initial HTML response
- Proxy is recommended for Apify datacenter IPs but not strictly required for testing
