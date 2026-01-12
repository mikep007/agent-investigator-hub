import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PAVoterLookupRequest {
  firstName: string;
  lastName: string;
  dateOfBirth?: string; // MM/DD/YYYY format
  county?: string;
  // Alternative: search by driver's license
  driversLicense?: string;
}

interface PAVoterResult {
  success: boolean;
  source: string;
  url: string;
  data?: {
    found: boolean;
    name?: string;
    partyAffiliation?: string;
    pollingPlace?: string;
    county?: string;
    registrationStatus?: string;
    registrationDate?: string;
    lastVoted?: string;
    district?: string;
    precinct?: string;
    congressionalDistrict?: string;
    legislativeDistrict?: string;
    senateDistrict?: string;
    rawHtml?: string;
  };
  error?: string;
  method: string;
}

// Use Browserless to automate the form submission
async function lookupWithBrowserless(request: PAVoterLookupRequest): Promise<PAVoterResult> {
  const browserlessKey = Deno.env.get('BROWSERLESS_API_KEY');
  
  if (!browserlessKey) {
    return {
      success: false,
      source: 'pavoterservices.pa.gov',
      url: 'https://www.pavoterservices.pa.gov/pages/voterregistrationstatus.aspx',
      error: 'BROWSERLESS_API_KEY not configured',
      method: 'browserless',
    };
  }

  try {
    // Use Browserless function API for complex interactions
    const functionScript = `
      module.exports = async ({ page }) => {
        const url = 'https://www.pavoterservices.pa.gov/pages/voterregistrationstatus.aspx';
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Wait for form to load
        await page.waitForSelector('#ctl00_ContentPlaceHolder1_rdoSearchByName', { timeout: 10000 });
        
        // Select search by name option
        await page.click('#ctl00_ContentPlaceHolder1_rdoSearchByName');
        await page.waitForTimeout(1000);
        
        // Wait for name fields to appear
        await page.waitForSelector('#ctl00_ContentPlaceHolder1_txtVRSFirstName', { timeout: 5000 });
        
        // Fill in the form
        await page.type('#ctl00_ContentPlaceHolder1_txtVRSFirstName', '${request.firstName}');
        await page.type('#ctl00_ContentPlaceHolder1_txtVRSLastName', '${request.lastName}');
        
        ${request.dateOfBirth ? `
        // Fill date of birth if provided
        await page.type('#ctl00_ContentPlaceHolder1_txtVRSDOB', '${request.dateOfBirth}');
        ` : ''}
        
        ${request.county ? `
        // Select county if provided
        await page.select('#ctl00_ContentPlaceHolder1_ddlVRSCounty', '${request.county}');
        ` : ''}
        
        // Click search button
        await page.click('#ctl00_ContentPlaceHolder1_btnContinue');
        
        // Wait for results
        await page.waitForTimeout(3000);
        await page.waitForNetworkIdle({ timeout: 10000 }).catch(() => {});
        
        // Extract data from results page
        const result = await page.evaluate(() => {
          const data = {
            found: false,
            name: null,
            partyAffiliation: null,
            pollingPlace: null,
            county: null,
            registrationStatus: null,
            registrationDate: null,
            district: null,
            precinct: null,
            congressionalDistrict: null,
            legislativeDistrict: null,
            senateDistrict: null,
          };
          
          // Check for error message (not found)
          const errorMsg = document.querySelector('#ctl00_ContentPlaceHolder1_lblErrorMessage, .error-message');
          if (errorMsg && errorMsg.textContent.toLowerCase().includes('not found')) {
            return data;
          }
          
          // Look for success indicators
          const nameEl = document.querySelector('#ctl00_ContentPlaceHolder1_lblVoterName, [id*="VoterName"], .voter-name');
          if (nameEl) {
            data.found = true;
            data.name = nameEl.textContent.trim();
          }
          
          // Party affiliation
          const partyEl = document.querySelector('#ctl00_ContentPlaceHolder1_lblPartyName, [id*="Party"], .party');
          if (partyEl) data.partyAffiliation = partyEl.textContent.trim();
          
          // Polling place
          const pollingEl = document.querySelector('#ctl00_ContentPlaceHolder1_lblPollingPlace, [id*="PollingPlace"], .polling-place');
          if (pollingEl) data.pollingPlace = pollingEl.textContent.trim();
          
          // County
          const countyEl = document.querySelector('#ctl00_ContentPlaceHolder1_lblCounty, [id*="County"], .county');
          if (countyEl) data.county = countyEl.textContent.trim();
          
          // Registration status
          const statusEl = document.querySelector('#ctl00_ContentPlaceHolder1_lblStatus, [id*="Status"], .status');
          if (statusEl) data.registrationStatus = statusEl.textContent.trim();
          
          // District info
          const districtEl = document.querySelector('#ctl00_ContentPlaceHolder1_lblDistrict, [id*="District"]');
          if (districtEl) data.district = districtEl.textContent.trim();
          
          // Precinct
          const precinctEl = document.querySelector('#ctl00_ContentPlaceHolder1_lblPrecinct, [id*="Precinct"]');
          if (precinctEl) data.precinct = precinctEl.textContent.trim();
          
          // Congressional district
          const congEl = document.querySelector('[id*="Congressional"], [id*="Congress"]');
          if (congEl) data.congressionalDistrict = congEl.textContent.trim();
          
          // State legislative districts
          const legEl = document.querySelector('[id*="Legislative"], [id*="House"]');
          if (legEl) data.legislativeDistrict = legEl.textContent.trim();
          
          const senEl = document.querySelector('[id*="Senate"]');
          if (senEl) data.senateDistrict = senEl.textContent.trim();
          
          // If no specific fields found, try to get any result text
          if (!data.found) {
            const resultPanel = document.querySelector('#ctl00_ContentPlaceHolder1_pnlVoterInfo, .result-panel, .voter-info');
            if (resultPanel && resultPanel.textContent.length > 50) {
              data.found = true;
              // Parse text content for key info
              const text = resultPanel.textContent;
              const partyMatch = text.match(/Party[:\\s]+([A-Za-z]+)/i);
              if (partyMatch) data.partyAffiliation = partyMatch[1];
            }
          }
          
          return data;
        });
        
        // Get screenshot for debugging
        const screenshot = await page.screenshot({ encoding: 'base64' });
        
        return {
          ...result,
          screenshot,
          pageUrl: page.url(),
        };
      };
    `;

    const response = await fetch(`https://chrome.browserless.io/function?token=${browserlessKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: functionScript,
        context: {},
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Browserless error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    return {
      success: true,
      source: 'pavoterservices.pa.gov',
      url: result.pageUrl || 'https://www.pavoterservices.pa.gov/pages/voterregistrationstatus.aspx',
      data: {
        found: result.found || false,
        name: result.name,
        partyAffiliation: result.partyAffiliation,
        pollingPlace: result.pollingPlace,
        county: result.county,
        registrationStatus: result.registrationStatus,
        registrationDate: result.registrationDate,
        district: result.district,
        precinct: result.precinct,
        congressionalDistrict: result.congressionalDistrict,
        legislativeDistrict: result.legislativeDistrict,
        senateDistrict: result.senateDistrict,
      },
      method: 'browserless',
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('PA Voter lookup error:', error);
    return {
      success: false,
      source: 'pavoterservices.pa.gov',
      url: 'https://www.pavoterservices.pa.gov/pages/voterregistrationstatus.aspx',
      error: errorMessage,
      method: 'browserless',
    };
  }
}

// Fallback: Generate manual lookup URL
function generateManualLookupUrl(request: PAVoterLookupRequest): string {
  return `https://www.pavoterservices.pa.gov/pages/voterregistrationstatus.aspx`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { firstName, lastName, dateOfBirth, county, driversLicense } = body;

    if (!firstName || !lastName) {
      return new Response(
        JSON.stringify({ error: 'firstName and lastName are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[PA Voter Lookup] Searching for: ${firstName} ${lastName}`);

    const request: PAVoterLookupRequest = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth,
      county,
      driversLicense,
    };

    // Try automated lookup first
    let result = await lookupWithBrowserless(request);

    // If automated lookup fails or key not configured, provide manual URL
    if (!result.success) {
      console.log(`[PA Voter Lookup] Automated lookup failed, providing manual URL`);
      result = {
        success: true,
        source: 'pavoterservices.pa.gov',
        url: generateManualLookupUrl(request),
        data: {
          found: false,
          name: `${firstName} ${lastName}`,
        },
        error: result.error,
        method: 'manual_verification_required',
      };
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[PA Voter Lookup] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        url: 'https://www.pavoterservices.pa.gov/pages/voterregistrationstatus.aspx',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
