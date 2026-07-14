# Chrono24 Watch Scraper

Extract comprehensive watch listing data from Chrono24 - the world's largest luxury watch marketplace. Collect structured watch data including titles, prices, images, seller locations, shipping costs, and condition details at scale. Perfect for price tracking, market analysis, investment research, and building luxury watch databases.

## Features

- **Keyword and URL search** - Provide a search keyword or any Chrono24 category or search URL
- **Automatic pagination** - Iterates through multiple result pages to reach your target count
- **Complete listing data** - Extracts prices, currencies, availability, seller location, shipping costs, image galleries, and condition
- **Duplicate filtering** - Automatically skips repeated listings across pages
- **Proxy-ready** - Supports Apify Proxy for reliable production runs
- **Fast extraction** - Retrieves 60 listings per page request in seconds

---

## Use Cases

### Price Tracking and Investment Research
Monitor Chrono24 watch prices over time. Track how Rolex Submariner, Patek Philippe, or Audemars Piguet prices fluctuate. Build historical price datasets for investment analysis or market timing. Each listing includes seller location and shipping costs for complete cost comparison.

### Market Intelligence
Identify which watch brands and models are most active on the marketplace. Analyze price ranges for specific references to understand supply and demand dynamics in the pre-owned watch market. The reference number field lets you track specific model variations.

### Inventory and Comparison
Build a curated watch inventory database for personal or business use. Compare prices across hundreds of listings to find the best deals. Set up automated alerts for price thresholds. Image galleries let you visually inspect listing photos.

### Academic and Data Research
Compile datasets for economic research on luxury goods markets, study pricing patterns across brands, or build machine learning models for watch valuation. Structured data including condition, location, and promoted status provides rich analysis dimensions.

### E-commerce Integration
Aggregate watch listings for dealer platforms, price comparison sites, or watch enthusiast communities that need up-to-date marketplace data. Each listing includes seller origin details and shipping information.

---

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | String | No | - | Chrono24 search or category URL (takes priority over keyword) |
| `keyword` | String | No | `rolex` | Watch brand or model keyword used when no URL is provided |
| `results_wanted` | Integer | No | `20` | Maximum number of listings to save |
| `max_pages` | Integer | No | `5` | Maximum number of result pages to paginate through |
| `proxyConfiguration` | Object | No | - | Apify Proxy settings (residential proxy recommended for production) |

---

## Output Data

Each item in the dataset contains:

| Field | Type | Description |
|-------|------|-------------|
| `title` | String | Full listing title including brand, model, and description |
| `price` | String | Formatted price with currency code (e.g., `USD 12350`) |
| `currency` | String | ISO currency code (e.g., `USD`, `EUR`, `CHF`) |
| `price_display` | String | Raw price as shown on the listing page (e.g., `$12,199`) |
| `availability` | String | Listing availability status (e.g., `InStock`) |
| `condition` | String | Watch condition from listing (e.g., `Good`, `Excellent`, `Unworn`) |
| `reference_number` | String | Model reference number (e.g., `116610LN`) |
| `image_url` | String | Full URL to the listing's main product image |
| `image_gallery` | Array | Array of additional listing photos (up to 4 extra high-resolution images) |
| `url` | String | Direct link to the Chrono24 listing page |
| `listingId` | Number | Chrono24 internal listing identifier |
| `brand` | String | Watch brand name |
| `shipping_cost` | String | Shipping cost text shown on the listing (e.g., `$1,000 for shipping`) |
| `seller_location` | String | Seller's country or region |
| `seller_from` | String | Detailed seller origin description |
| `country_code` | String | Two-letter country code (e.g., `US`, `JP`, `DE`) |
| `promoted` | Boolean | Whether the listing is promoted |
| `search_position` | Number | Position of the listing in search results |
| `low_price` | String | Lowest price in the search results for context |
| `high_price` | String | Highest price in the search results for context |
| `total_listings` | Number | Total number of listings found for this search |

---

## Usage Examples

### Search by Keyword

Collect 20 Rolex listings using a keyword:

```json
{
    "keyword": "rolex submariner",
    "results_wanted": 20
}
```

### Search by Chrono24 URL

Use a specific Chrono24 search or category URL:

```json
{
    "url": "https://www.chrono24.com/rolex/index.htm?dosearch=true&query=rolex",
    "results_wanted": 50
}
```

### Large-scale Collection with Proxy

Collect 200 listings with residential proxy for reliability:

```json
{
    "keyword": "patek philippe",
    "results_wanted": 200,
    "max_pages": 5,
    "proxyConfiguration": {
        "useApifyProxy": true,
        "apifyProxyGroups": ["RESIDENTIAL"]
    }
}
```

---

## Sample Output

```json
{
    "title": "Rolex Submariner Date",
    "price": "USD 12199",
    "currency": "USD",
    "price_display": "$12,199",
    "availability": "InStock",
    "condition": null,
    "reference_number": "116610LN",
    "image_url": "https://img.chrono24.com/images/uhren/47264067-8n51n5y04c6g4c56d1skqht5-ExtraLarge.jpg",
    "image_gallery": [
        "https://img.chrono24.com/images/uhren/47264067-ghg29pw52iampnv9bn1q2xwy-ExtraLarge.jpg",
        "https://img.chrono24.com/images/uhren/47264067-ba3q1g48yz8l8uczcvv1x23i-ExtraLarge.jpg",
        "https://img.chrono24.com/images/uhren/47264067-1t1g2topf0syq8yr1mzpaa20-ExtraLarge.jpg",
        "https://img.chrono24.com/images/uhren/47264067-wkmacoj1gsol60fe0dz6lga8-ExtraLarge.jpg"
    ],
    "url": "https://www.chrono24.com/rolex/rolex-submariner-date--id47264067.htm",
    "listingId": 47264067,
    "brand": null,
    "shipping_cost": "$1,000 for shipping",
    "seller_location": "United States of America",
    "seller_from": "This dealer is from NY, United States of America.",
    "country_code": "US",
    "promoted": false,
    "search_position": 1,
    "low_price": "237",
    "high_price": "2960700",
    "total_listings": 60
}
```

---

## Tips for Best Results

### Choose Specific Keywords
- Use brand and model for precise results: `"rolex submariner"`, `"omega seamaster"`, `"patek philippe nautilus"`
- Use brand-only for broader results: `"audemars piguet"`, `"richard mille"`
- Use category URLs from Chrono24's navigation for pre-filtered searches

### Use Residential Proxy for Production
When running on Apify's infrastructure, Chrono24 may challenge datacenter IP addresses. Enable a residential proxy group for reliable, uninterrupted extraction:

```json
{
    "proxyConfiguration": {
        "useApifyProxy": true,
        "apifyProxyGroups": ["RESIDENTIAL"]
    }
}
```

### Optimize Result Count
- Start with `results_wanted: 20` for testing - completes in seconds
- Increase to `100-500` for research datasets
- Combine with `max_pages` to control depth of pagination

---

## Integrations

Connect your extracted watch data with:

- **Google Sheets** - Export for price analysis and tracking
- **Airtable** - Build a searchable luxury watch database
- **Slack** - Receive notifications when target prices appear
- **Webhooks** - Send data to custom endpoints or dashboards
- **Make (Integromat)** - Automate watch price monitoring workflows
- **Zapier** - Trigger price alerts and data pipelines

### Export Formats

Download your data in multiple formats:

- **JSON** - For developers and API integrations
- **CSV** - For spreadsheet and Excel analysis
- **Excel** - For business reporting and charts
- **XML** - For system integrations and data feeds

---

## Frequently Asked Questions

### How many watch listings can I collect?
You can collect as many listings as Chrono24 displays for your search. Typically, each search shows up to 60 listings per page, and you can paginate through multiple pages using the `max_pages` parameter.

### Can I scrape a specific watch category?
Yes. Navigate to any Chrono24 category or search results page in your browser, copy the URL, and paste it as the `url` input parameter. The actor will extract all listings from that URL.

### What additional data is available beyond the basics?
Each listing includes rich data such as seller location, shipping costs, a gallery of up to 5 high-resolution images, reference numbers, condition information, and promoted status. This gives you a complete picture of each listing.

### Why do I need a proxy?
Chrono24 uses Cloudflare protection that may challenge requests from datacenter IP addresses. Residential proxy bypasses this and ensures reliable data delivery. The actor works without a proxy for testing but a proxy is recommended for production runs.

### Are duplicate listings filtered?
Yes. The actor tracks all extracted listing URLs and automatically skips any duplicates encountered during pagination.

### What does `total_listings` mean?
The `total_listings` field reflects the total number of matching results Chrono24 reports for your search (visible on their results page). It is not the number of items collected - use `results_wanted` to control how many you actually save.

### What if some fields are missing?
The actor only saves fields that have actual values. If a listing doesn't have a price, image, or other field, that field is simply omitted - there are no null or empty values in the output.

### How fast is the scraper?
Approximately 60 listings are extracted per page request, which typically takes 2-5 seconds. Collecting 20 listings takes under 10 seconds on average.

---

## Support

For issues or feature requests, contact support through the Apify Console.

### Resources

- [Apify Documentation](https://docs.apify.com/)
- [API Reference](https://docs.apify.com/api/v2)
- [Scheduling Runs](https://docs.apify.com/schedules)
- [Apify Proxy](https://docs.apify.com/proxy)

---

## Legal Notice

This actor is designed for legitimate data collection purposes. Users are responsible for ensuring compliance with Chrono24's terms of service and applicable laws. Use the collected data responsibly, respect rate limits, and do not use this tool for any unlawful or abusive activity.
