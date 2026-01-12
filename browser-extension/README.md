# OSINT Agent Companion - Browser Extension

This Chrome extension enables the OSINT Agent Orchestra to scrape protected sites like Whitepages, TruePeopleSearch, and FastPeopleSearch that block automated access.

## Installation

### From Source (Developer Mode)

1. Download or clone this `browser-extension` folder to your computer
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the `browser-extension` folder
6. The extension icon should appear in your toolbar

### Creating Extension Icons

Before loading, create simple icon files or use placeholders:

```bash
# Create icons folder
mkdir -p icons

# You can create simple icons using any image editor
# Required sizes: 16x16, 48x48, 128x128 pixels
# Save as: icon16.png, icon48.png, icon128.png
```

## How It Works

1. **Content Scripts**: When you visit supported sites (Whitepages, TruePeopleSearch, FastPeopleSearch), the extension automatically extracts structured data from the page.

2. **Background Service**: Manages communication between the web app and content scripts.

3. **Web App Integration**: The OSINT Agent Orchestra can send scrape requests to the extension, which opens pages in background tabs and returns extracted data.

## Supported Sites

| Site | Data Extracted |
|------|----------------|
| Whitepages | Names, addresses, phones, emails, relatives, property info |
| TruePeopleSearch | Names, addresses, phones, emails, relatives, associates |
| FastPeopleSearch | Names, addresses, phones, emails, relatives, associates |

## Usage with OSINT Agent Orchestra

1. Install the extension
2. Open OSINT Agent Orchestra in your browser
3. The app will detect the extension automatically
4. When investigating addresses or people, click "Scrape with Extension" buttons to fetch data from protected sites

## Privacy & Security

- The extension only activates on the specific sites listed in the manifest
- No data is sent to external servers - all communication is between the extension and your local browser tab running OSINT Agent Orchestra
- Scraped data is temporarily stored locally and automatically cleaned up after 1 hour

## Troubleshooting

### Extension not detected

- Make sure the extension is enabled in `chrome://extensions/`
- Refresh the OSINT Agent Orchestra page
- Check the browser console for errors

### Scraping fails

- Some pages may require you to be logged in
- CAPTCHA challenges may block automated access
- Try manually visiting the page first, then trigger extraction

### Data not appearing

- Wait a few seconds for the page to fully load
- Check the extension popup for scrape count
- Try refreshing the target page

## Development

To modify the extension:

1. Edit the content scripts in `content-scripts/`
2. Update `manifest.json` if adding new sites
3. Go to `chrome://extensions/` and click the refresh icon on the extension
4. Test on target sites

## Adding New Sites

1. Add the site pattern to `manifest.json` under `content_scripts.matches`
2. Create a new content script in `content-scripts/`
3. Add the script path to `manifest.json`
4. Update `background.js` to handle the new site in `GET_SUPPORTED_SITES`
