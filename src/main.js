import { Actor, log } from 'apify';
import * as cheerio from 'cheerio';
import { Dataset } from 'crawlee';
import { Impit } from 'impit';

const BASE_URL = 'https://www.chrono24.com';

await Actor.init();

const input = (await Actor.getInput()) || {};
const { url: startUrl, keyword, results_wanted = 20, max_pages = 5, proxyConfiguration: proxyConfig } = input;

// ── Build the first search URL ─────────────────────────────────────────────
function buildSearchUrl(kw) {
    const u = new URL('/search/index.htm', BASE_URL);
    u.searchParams.set('dosearch', 'true');
    u.searchParams.set('query', kw);
    u.searchParams.set('pageSize', '60');
    u.searchParams.set('showPage', '1');
    return u.href;
}

// ── Build page-N URL from seed URL ─────────────────────────────────────────
function buildPageUrl(base, page) {
    const u = new URL(base);
    if (page > 1) {
        // Pattern: /brand/index-2.htm  or  /search/index-2.htm
        u.pathname = u.pathname.replace(/(-\d+)?\.htm$/i, `-${page}.htm`);
        u.searchParams.set('showPage', String(page));
    }
    u.searchParams.set('pageSize', '60');
    return u.href;
}

// ── Extract listings from JSON-LD AggregateOffer / ItemList ────────────────
function extractFromJsonLd(body) {
    const listings = [];
    const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = re.exec(body)) !== null) {
        let parsed;
        try {
            parsed = JSON.parse(match[1]);
        } catch {
            continue;
        }
        // Handle @graph array
        const nodes = Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed];
        for (const node of nodes) {
            // AggregateOffer with nested offers[]
            if (node['@type'] === 'AggregateOffer' && Array.isArray(node.offers)) {
                for (const offer of node.offers) {
                    const item = normalizeOffer(offer, node);
                    if (item) listings.push(item);
                }
            }
            // ItemList with listElement[]
            if (node['@type'] === 'ItemList' && Array.isArray(node.itemListElement)) {
                for (const el of node.itemListElement) {
                    const offer = el.item || el;
                    const item = normalizeOffer(offer, null);
                    if (item) listings.push(item);
                }
            }
        }
    }
    return listings;
}

// ── Normalise a single offer object ────────────────────────────────────────
function normalizeOffer(offer, parent) {
    if (!offer || typeof offer !== 'object') return null;

    const name = offer.name || offer.headline || null;
    const url = offer.url || offer['@id'] || null;

    if (!name && !url) return null;

    // Price — handle string or number
    let price = null;
    if (offer.price !== undefined && offer.price !== null) {
        price = String(offer.price);
    }

    // Currency
    const currency = offer.priceCurrency || (parent && parent.priceCurrency) || null;

    // Formatted price
    const priceDisplay = currency && price ? `${currency} ${price}` : price;

    // Image — array or single object
    let imageUrl = null;
    if (Array.isArray(offer.image) && offer.image.length > 0) {
        const img = offer.image[0];
        imageUrl = typeof img === 'string' ? img : img?.contentUrl || img?.url || null;
    } else if (typeof offer.image === 'string') {
        imageUrl = offer.image;
    } else if (offer.image?.contentUrl) {
        imageUrl = offer.image.contentUrl;
    }

    // Availability — convert schema.org URL to readable string
    let availability = offer.availability || null;
    if (availability) {
        availability = availability.replace('http://schema.org/', '').replace('https://schema.org/', '');
    }

    // Brand — from offer or parent context
    const brand = offer.brand?.name || offer.brand || (parent && parent.brand?.name) || null;

    // Build clean item — omit null/empty fields
    const item = {};
    if (name) item.title = name;
    if (price) item.price = priceDisplay || price;
    if (currency) item.currency = currency;
    if (brand) item.brand = brand;
    if (availability) item.availability = availability;
    if (imageUrl) item.image_url = imageUrl;
    if (url) {
        try {
            item.url = new URL(url, BASE_URL).href;
        } catch {
            item.url = url;
        }
    }

    // Price range metadata (from AggregateOffer parent)
    if (parent) {
        if (parent.lowPrice != null) item.low_price = String(parent.lowPrice);
        if (parent.highPrice != null) item.high_price = String(parent.highPrice);
        if (parent.offerCount != null) item.total_listings = Number(parent.offerCount);
    }

    return Object.keys(item).length > 1 ? item : null;
}

// ── Extract rich data from HTML listing cards ───────────────────────────────
function extractFromHtml(body) {
    const $ = cheerio.load(body);
    const listings = [];

    $('.wt-listing-item.js-listing-item').each((idx, el) => {
        const $el = $(el);

        // Listing URL from the item link
        const linkHref = $el.find('.wt-listing-item-link').attr('href');
        if (!linkHref) return;
        const url = linkHref.startsWith('http') ? linkHref : `${BASE_URL}${linkHref}`;

        // Listing ID from wishlist component-data
        let listingId = null;
        const wlData = $el.find('c24-wishlist-toggle script[type="application/json"]').text();
        if (wlData) {
            try {
                listingId = JSON.parse(wlData).listingId;
            } catch {
                /* ignore */
            }
        }
        // Fallback: extract from URL
        if (!listingId) {
            const idMatch = linkHref.match(/--id(\d+)\.htm/);
            if (idMatch) listingId = idMatch[1];
        }

        // Image gallery (all carousel images)
        const imageGallery = [];
        $el.find('[data-lazy-sweet-spot-master-src]').each((_, img) => {
            const src = $(img).attr('data-lazy-sweet-spot-master-src');
            if (src) {
                // Replace Square_SIZE_ placeholder with ExtraLarge for full-res
                imageGallery.push(src.replace(/-Square_SIZE_\.jpg$/, '-ExtraLarge.jpg'));
            }
        });

        // Price
        const priceText = $el.find('.wt-listing-item-price').text().trim();

        // Shipping
        const shipping = $el.find('.text-muted').text().replace('+', '').trim() || null;
        const shippingCost = shipping || null;

        // Seller location from tooltip
        const locationEl = $el.find('.js-tooltip.wt-listing-item-location');
        const countryCode = $el.find('.wt-listing-item-location span.text-uppercase').text().trim() || null;
        const sellerLocation = locationEl.attr('data-title') || countryCode || null;
        const sellerFrom = locationEl.attr('data-content') || null;

        // Promoted badge
        const promoted = !!$el
            .find('.wt-listing-item-image-badge')
            .text()
            .match(/Promoted/i);

        // Condition from image alt text or subtitle
        let condition = null;
        const altText = $el.find('.watch-image img').first().attr('alt') || '';
        const condMatch = altText.match(/\b(Good|Excellent|Very Good|Mint|Unworn|New|Fair|Poor)\s*condition\b/i);
        if (condMatch) condition = condMatch[1];

        // Reference/model number from subtitle
        let referenceNumber = null;
        const subtitleEl = $el.find('.text-ellipsis').last();
        const subtitle = subtitleEl.text().trim();
        // Extract model ref (e.g. "116610LN" from "116610LN With Box Steel 40mm...")
        const refMatch = subtitle.match(/^(\w+\d+\w*)/);
        if (refMatch) referenceNumber = refMatch[1];

        // Search position
        const position = $el.closest('[data-search-item-position]').attr('data-search-item-position');
        const searchPosition = position ? Number(position) : null;

        const item = {
            url,
            listingId: listingId ? Number(listingId) : null,
            price_display: priceText || undefined,
            shipping_cost: shippingCost || undefined,
            seller_location: sellerLocation || undefined,
            seller_from: sellerFrom || undefined,
            country_code: countryCode || undefined,
            promoted: promoted || undefined,
            condition: condition || undefined,
            reference_number: referenceNumber || undefined,
            search_position: searchPosition || undefined,
        };

        if (imageGallery.length > 0) {
            item.image_gallery = imageGallery;
        }

        listings.push(item);
    });

    return listings;
}

// ── Merge JSON-LD data with HTML data, keyed by URL ─────────────────────────
function mergeListings(jsonldItems, htmlItems) {
    const htmlMap = new Map();
    for (const h of htmlItems) {
        // Normalize URL for matching
        const key = h.url.replace(/[?#].*$/, '').replace(/\/$/, '');
        htmlMap.set(key, h);
    }

    const merged = [];
    for (const j of jsonldItems) {
        if (!j.url) {
            merged.push(j);
            continue;
        }
        const key = j.url.replace(/[?#].*$/, '').replace(/\/$/, '');
        const h = htmlMap.get(key);
        if (h) {
            merged.push({ ...j, ...h });
        } else {
            merged.push(j);
        }
    }
    return merged;
}

// ── Create Impit client with given profile + proxy ───────────────────────────
function createClient(browser, proxyUrl) {
    return new Impit({
        browser,
        ...(proxyUrl && { proxyUrl }),
    });
}

// ── Detect Cloudflare challenges ────────────────────────────────────────────
function isCloudflareBlock(body, statusCode) {
    if (statusCode === 403) return true;

    const normalizedBody = body.toLowerCase();
    return ['cf-browser-verification', '_cf_chl_opt', 'just a moment', 'checking your browser'].some((marker) =>
        normalizedBody.includes(marker),
    );
}

const BROWSER_PROFILES = ['firefox', 'chrome'];
const MAX_ATTEMPTS_PER_PROFILE = 3;
const MAX_RETRY_DELAY_MS = 10_000;

function isTemporaryNetworkError(error) {
    const errorDetails = [error?.code, error?.cause?.code, error?.name, error?.message].filter(Boolean).join(' ');
    const retryableIndicators = [
        'timeout',
        'timed out',
        'econnreset',
        'econnrefused',
        'ehostunreach',
        'enetunreach',
        'eai_again',
        'socket',
        'network error',
        'fetch failed',
        'und_err_',
    ];
    return retryableIndicators.some((indicator) => errorDetails.toLowerCase().includes(indicator));
}

function getRetryDelay(response, attempt) {
    const retryAfter = response?.headers?.get?.('retry-after');
    if (retryAfter) {
        const seconds = Number(retryAfter);
        const retryAfterMs = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();

        if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
            return Math.min(retryAfterMs, MAX_RETRY_DELAY_MS);
        }
    }

    const backoff = 1000 * 2 ** (attempt - 1);
    return Math.min(backoff + Math.random() * 500, MAX_RETRY_DELAY_MS);
}

function sleep(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

// ── Fetch a page with bounded retry and profile fallback ────────────────────
async function fetchPage(url, proxyUrl, clients) {
    let lastError;

    for (const browser of BROWSER_PROFILES) {
        let client = clients.get(browser);
        if (!client) {
            client = createClient(browser, proxyUrl);
            clients.set(browser, client);
        }

        for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_PROFILE; attempt++) {
            let response;
            try {
                response = await client.fetch(url, {
                    headers: { Referer: BASE_URL },
                });
            } catch (err) {
                if (!isTemporaryNetworkError(err)) throw err;
                lastError = `${browser} request failed: ${err.message}`;
                if (attempt < MAX_ATTEMPTS_PER_PROFILE) {
                    log.warning(
                        `Temporary network error; retrying request (${attempt + 1}/${MAX_ATTEMPTS_PER_PROFILE}).`,
                    );
                    await sleep(getRetryDelay(null, attempt));
                    continue;
                }
                break;
            }

            if (!response || !Number.isInteger(response.status) || typeof response.text !== 'function') {
                throw new Error('Chrono24 returned an invalid HTTP response.');
            }

            let body;
            try {
                body = await response.text();
            } catch (err) {
                if (!isTemporaryNetworkError(err)) throw err;
                lastError = `${browser} response read failed: ${err.message}`;
                if (attempt < MAX_ATTEMPTS_PER_PROFILE) {
                    log.warning(
                        `Temporary response error; retrying request (${attempt + 1}/${MAX_ATTEMPTS_PER_PROFILE}).`,
                    );
                    await sleep(getRetryDelay(response, attempt));
                    continue;
                }
                break;
            }

            if (typeof body !== 'string') {
                throw new Error('Chrono24 returned a non-text response body.');
            }

            const statusCode = response.status;
            if (statusCode === 429) {
                lastError = `HTTP ${statusCode}`;
                if (attempt < MAX_ATTEMPTS_PER_PROFILE) {
                    log.warning(
                        `Chrono24 returned HTTP ${statusCode}; retrying (${attempt + 1}/${MAX_ATTEMPTS_PER_PROFILE}).`,
                    );
                    await sleep(getRetryDelay(response, attempt));
                    continue;
                }
                throw new Error(`Chrono24 returned HTTP ${statusCode} after ${MAX_ATTEMPTS_PER_PROFILE} attempts.`);
            }

            if (isCloudflareBlock(body, statusCode)) {
                lastError = `Cloudflare challenge with ${browser} (HTTP ${statusCode})`;
                if (attempt < MAX_ATTEMPTS_PER_PROFILE) {
                    log.warning(
                        `Cloudflare challenge detected; retrying request (${attempt + 1}/${MAX_ATTEMPTS_PER_PROFILE}).`,
                    );
                    await sleep(getRetryDelay(response, attempt));
                    continue;
                }
                break;
            }

            if (statusCode >= 500 && statusCode <= 599) {
                lastError = `HTTP ${statusCode}`;
                if (attempt < MAX_ATTEMPTS_PER_PROFILE) {
                    log.warning(
                        `Chrono24 returned HTTP ${statusCode}; retrying (${attempt + 1}/${MAX_ATTEMPTS_PER_PROFILE}).`,
                    );
                    await sleep(getRetryDelay(response, attempt));
                    continue;
                }
                throw new Error(`Chrono24 returned HTTP ${statusCode} after ${MAX_ATTEMPTS_PER_PROFILE} attempts.`);
            }

            if (statusCode < 200 || statusCode >= 300) {
                throw new Error(`Chrono24 returned non-retryable HTTP ${statusCode}.`);
            }

            if (!body.trim()) {
                throw new Error('Chrono24 returned an empty response body.');
            }

            const contentType = response.headers?.get?.('content-type') || '';
            if (contentType && !/^(text\/html|application\/xhtml\+xml)(;|$)/i.test(contentType)) {
                throw new Error(`Chrono24 returned an unexpected content type: ${contentType.split(';')[0]}.`);
            }

            return { body, statusCode };
        }
    }

    throw new Error(`All browser profiles exhausted. Last error: ${lastError || 'unknown failure'}`);
}

function getPositiveInteger(value, fallback, fieldName) {
    if (value === undefined || value === null) return fallback;

    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1) {
        throw new Error(`${fieldName} must be a positive integer.`);
    }
    return number;
}

function getSeedUrl() {
    const normalizedUrl = typeof startUrl === 'string' ? startUrl.trim() : '';
    const normalizedKeyword = typeof keyword === 'string' ? keyword.trim() : '';

    if (normalizedUrl && normalizedKeyword) {
        log.warning('Both URL and keyword were provided; using the URL search mode.');
    }

    if (normalizedUrl) {
        let parsedUrl;
        try {
            parsedUrl = new URL(normalizedUrl);
        } catch {
            throw new Error('The provided URL must be a valid HTTP(S) URL.');
        }
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            throw new Error('The provided URL must use HTTP or HTTPS.');
        }
        return parsedUrl.href;
    }

    if (normalizedKeyword) return buildSearchUrl(normalizedKeyword);
    throw new Error('Provide either a Chrono24 search URL or a keyword.');
}

// ── Main ───────────────────────────────────────────────────────────────────
const resultsWanted = getPositiveInteger(results_wanted, 20, 'results_wanted');
const maxPages = getPositiveInteger(max_pages, 5, 'max_pages');
const seedUrl = getSeedUrl();

const proxyConfiguration = proxyConfig ? await Actor.createProxyConfiguration(proxyConfig) : undefined;
const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl() : undefined;
const clients = new Map();

if (!proxyUrl) {
    log.warning('No proxy is configured. Chrono24 may block requests from datacenter or local IP addresses.');
}

let saved = 0;
const seen = new Set();

log.info(`Starting Chrono24 extraction. Target: ${resultsWanted} listings.`);

for (let page = 1; page <= maxPages && saved < resultsWanted; page++) {
    const pageUrl = buildPageUrl(seedUrl, page);

    log.info(`Fetching page ${page}...`);

    let body;
    try {
        ({ body } = await fetchPage(pageUrl, proxyUrl, clients));
    } catch (err) {
        log.error(`Chrono24 request failed on page ${page}: ${err.message}`);
        log.warning('Check the search URL and proxy configuration; Cloudflare challenges may still occur.');
        break;
    }

    log.info(`Received ${body.length} bytes for page ${page}`);

    const jsonldItems = extractFromJsonLd(body);
    const htmlItems = extractFromHtml(body);
    const items = mergeListings(jsonldItems, htmlItems);
    log.info(`Found ${items.length} listings on page ${page}`);

    if (items.length === 0) {
        log.warning(
            `No listings found on page ${page}. ` +
                'Chrono24 may have changed its structured data format, or all listings have been collected.',
        );
        break;
    }

    const batch = [];
    for (const item of items) {
        if (saved + batch.length >= resultsWanted) break;
        const key = item.url || item.title || JSON.stringify(item);
        if (seen.has(key)) continue;
        seen.add(key);
        batch.push(item);
    }

    if (batch.length > 0) {
        await Dataset.pushData(batch);
        saved += batch.length;
        log.info(`Saved ${saved}/${resultsWanted} listings`);
    }

    // Stop if last page had fewer than expected items
    if (items.length < 20) {
        log.info('Fewer listings than expected — likely last page. Stopping.');
        break;
    }

    // Human-like delay between pages (2–5s)
    const delay = 2000 + Math.random() * 3000;
    log.info(`Waiting ${Math.round(delay / 1000)}s before next page...`);
    await new Promise((r) => {
        setTimeout(r, delay);
    });
}

if (saved === 0) {
    log.warning('No listings were saved. Verify the search input and proxy configuration if requests were blocked.');
}

log.info(`Extraction complete. Total saved: ${saved} listings.`);
await Actor.exit();
