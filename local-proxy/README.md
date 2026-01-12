# OSINT Browser Proxy Server

A local Node.js server that uses Playwright for headless browser automation to scrape protected people search sites.

## Why This Exists

Sites like Whitepages, Spokeo, and BeenVerified block automated HTTP requests with:
- CAPTCHA challenges
- JavaScript-required rendering
- Bot detection
- IP rate limiting

This server uses a real headless browser to bypass these protections.

## Installation

```bash
cd local-proxy
npm install
npm run install-browsers
```

## Usage

```bash
npm start
# Server runs on http://localhost:3001
```

## API Endpoints

### POST /browser-scrape

Scrape a URL using headless browser automation.

**Request:**
```json
{
  "url": "https://www.whitepages.com/address/123-Main-St/Anytown-CA",
  "searchType": "address"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "source": "whitepages",
    "url": "https://www.whitepages.com/address/...",
    "timestamp": "2024-01-15T...",
    "exists": true,
    "address": "123 Main St, Anytown, CA",
    "residents": [
      { "name": "John Doe", "profileUrl": "https://..." }
    ],
    "propertyDetails": {
      "beds": "3",
      "baths": "2",
      "sqft": "1,500"
    }
  }
}
```

### GET /health

Health check endpoint.

### GET /supported-sites

List of sites with dedicated scrapers.

## Supported Sites

| Site | Data Extracted |
|------|----------------|
| Whitepages | Name, age, addresses, phones, emails, relatives, property details |
| Spokeo | Name, age, addresses, phones, emails, avatar |
| TruePeopleSearch | Name, age, addresses, phones, emails, relatives |
| FastPeopleSearch | Name, age, addresses, phones, emails, relatives |
| BeenVerified | Name, age, addresses, phones, emails |

## Integration with Edge Functions

The `osint-browser-scraper` edge function can connect to this local proxy:

```typescript
// Set environment variable
LOCAL_PROXY_URL=http://localhost:3001
```

The edge function will automatically use this proxy when available.

## Stealth Features

The server includes anti-detection measures:
- Realistic user agent
- Hidden webdriver property
- Mocked navigator plugins/languages
- Blocked tracking resources
- Residential-like request patterns

## Docker Deployment (Optional)

```dockerfile
FROM mcr.microsoft.com/playwright:v1.40.0-focal

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

EXPOSE 3001
CMD ["npm", "start"]
```

## Troubleshooting

### Browser won't start
```bash
# Reinstall browsers
npm run install-browsers
```

### Timeout errors
- Increase timeout in scraper
- Check if site is blocking your IP
- Try using a proxy

### Missing data
- Site may have updated their HTML structure
- Check browser console for errors
- Update selectors in scraper functions
