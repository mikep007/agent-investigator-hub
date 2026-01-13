import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GAVoterLookupRequest {
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  county?: string;
}

interface VoterResult {
  success: boolean;
  source: string;
  url: string;
  state: string;
  data?: {
    found: boolean;
    name?: string;
    partyAffiliation?: string;
    county?: string;
    registrationStatus?: string;
    registrationDate?: string;
    voterId?: string;
    precinct?: string;
    congressionalDistrict?: string;
    stateSenateDistrict?: string;
    stateHouseDistrict?: string;
    pollingPlace?: string;
  };
  error?: string;
  method: string;
}

const GA_VOTER_URL = 'https://mvp.sos.ga.gov/s/';

async function lookupWithBrowserless(request: GAVoterLookupRequest): Promise<VoterResult> {
  const browserlessKey = Deno.env.get('BROWSERLESS_API_KEY');
  
  if (!browserlessKey) {
    return {
      success: false,
      source: 'mvp.sos.ga.gov',
      url: GA_VOTER_URL,
      state: 'GA',
      error: 'BROWSERLESS_API_KEY not configured',
      method: 'browserless',
    };
  }

  try {
    const functionScript = `
      module.exports = async ({ page }) => {
        const url = '${GA_VOTER_URL}';
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        await page.waitForTimeout(3000);
        
        // Georgia MVP portal - look for voter registration check link
        const voterStatusLink = await page.$('a[href*="voter"], a:contains("Voter Registration")');
        if (voterStatusLink) {
          await voterStatusLink.click();
          await page.waitForNavigation({ timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(2000);
        }
        
        // Fill form fields
        await page.waitForSelector('input[name*="lastName"], input[id*="lastName"]', { timeout: 10000 }).catch(() => {});
        
        const lastNameInput = await page.$('input[name*="lastName"]') || await page.$('input[id*="lastName"]');
        const firstNameInput = await page.$('input[name*="firstName"]') || await page.$('input[id*="firstName"]');
        
        if (firstNameInput && lastNameInput) {
          await firstNameInput.type('${request.firstName}');
          await lastNameInput.type('${request.lastName}');
          
          ${request.dateOfBirth ? `
          const dobInput = await page.$('input[name*="dob"], input[name*="birthDate"]');
          if (dobInput) await dobInput.type('${request.dateOfBirth}');
          ` : ''}
          
          ${request.county ? `
          const countySelect = await page.$('select[name*="county"]');
          if (countySelect) await page.select('select[name*="county"]', '${request.county}');
          ` : ''}
          
          // Submit
          const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
          if (submitBtn) {
            await submitBtn.click();
            await page.waitForNavigation({ timeout: 15000 }).catch(() => {});
          }
        }
        
        await page.waitForTimeout(3000);
        
        const result = await page.evaluate(() => {
          const data = {
            found: false,
            name: null,
            county: null,
            registrationStatus: null,
            pollingPlace: null,
            precinct: null,
            congressionalDistrict: null,
            stateSenateDistrict: null,
            stateHouseDistrict: null,
          };
          
          // Look for voter info
          const voterSection = document.querySelector('.voter-info, #voterInfo, .registration-status');
          if (voterSection) {
            data.found = true;
            
            const statusText = voterSection.textContent;
            if (statusText.toLowerCase().includes('active')) {
              data.registrationStatus = 'Active';
            }
          }
          
          // Extract district info
          const districtSection = document.querySelector('.districts, #districts');
          if (districtSection) {
            const text = districtSection.textContent;
            const congMatch = text.match(/congressional[:\\s]+([\\d]+)/i);
            if (congMatch) data.congressionalDistrict = congMatch[1];
            
            const senateMatch = text.match(/senate[:\\s]+([\\d]+)/i);
            if (senateMatch) data.stateSenateDistrict = senateMatch[1];
            
            const houseMatch = text.match(/house[:\\s]+([\\d]+)/i);
            if (houseMatch) data.stateHouseDistrict = houseMatch[1];
          }
          
          // Polling place
          const pollingEl = document.querySelector('.polling-place, [class*="polling"]');
          if (pollingEl) data.pollingPlace = pollingEl.textContent.trim();
          
          // Check for not found
          const bodyText = document.body.textContent.toLowerCase();
          if (bodyText.includes('not found') || bodyText.includes('no record') || bodyText.includes('no voter')) {
            data.found = false;
          }
          
          return data;
        });
        
        return {
          ...result,
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
      source: 'mvp.sos.ga.gov',
      url: result.pageUrl || GA_VOTER_URL,
      state: 'GA',
      data: {
        found: result.found || false,
        name: result.name,
        county: result.county,
        registrationStatus: result.registrationStatus,
        pollingPlace: result.pollingPlace,
        precinct: result.precinct,
        congressionalDistrict: result.congressionalDistrict,
        stateSenateDistrict: result.stateSenateDistrict,
        stateHouseDistrict: result.stateHouseDistrict,
      },
      method: 'browserless',
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('GA Voter lookup error:', error);
    return {
      success: false,
      source: 'mvp.sos.ga.gov',
      url: GA_VOTER_URL,
      state: 'GA',
      error: errorMessage,
      method: 'browserless',
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { firstName, lastName, dateOfBirth, county } = body;

    if (!firstName || !lastName) {
      return new Response(
        JSON.stringify({ error: 'firstName and lastName are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[GA Voter Lookup] Searching for: ${firstName} ${lastName}`);

    const request: GAVoterLookupRequest = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth,
      county,
    };

    let result = await lookupWithBrowserless(request);

    if (!result.success) {
      console.log(`[GA Voter Lookup] Automated lookup failed, providing manual URL`);
      result = {
        success: true,
        source: 'mvp.sos.ga.gov',
        url: GA_VOTER_URL,
        state: 'GA',
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
    console.error('[GA Voter Lookup] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        url: GA_VOTER_URL,
        state: 'GA',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
