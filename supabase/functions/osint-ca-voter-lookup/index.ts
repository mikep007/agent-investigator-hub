import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CAVoterLookupRequest {
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
    assemblyDistrict?: string;
  };
  error?: string;
  method: string;
}

const CA_VOTER_URL = 'https://voterstatus.sos.ca.gov/';

async function lookupWithBrowserless(request: CAVoterLookupRequest): Promise<VoterResult> {
  const browserlessKey = Deno.env.get('BROWSERLESS_API_KEY');
  
  if (!browserlessKey) {
    return {
      success: false,
      source: 'voterstatus.sos.ca.gov',
      url: CA_VOTER_URL,
      state: 'CA',
      error: 'Service configuration error',
      method: 'browserless',
    };
  }

  try {
    // Properly escape user inputs to prevent code injection
    const safeFirstName = JSON.stringify(request.firstName);
    const safeLastName = JSON.stringify(request.lastName);
    const safeDob = request.dateOfBirth ? JSON.stringify(request.dateOfBirth) : null;
    const safeCounty = request.county ? JSON.stringify(request.county) : null;

    const functionScript = `
      module.exports = async ({ page }) => {
        const firstName = ${safeFirstName};
        const lastName = ${safeLastName};
        const dob = ${safeDob};
        const county = ${safeCounty};
        const url = 'https://voterstatus.sos.ca.gov/';
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        await page.waitForTimeout(2000);
        
        // California voter status check requires specific fields
        await page.waitForSelector('#firstName, input[name="firstName"]', { timeout: 10000 }).catch(() => {});
        
        const firstNameInput = await page.$('#firstName') || await page.$('input[name="firstName"]');
        const lastNameInput = await page.$('#lastName') || await page.$('input[name="lastName"]');
        
        if (firstNameInput && lastNameInput) {
          await firstNameInput.type(firstName);
          await lastNameInput.type(lastName);
          
          if (dob) {
            const dobInput = await page.$('#dateOfBirth') || await page.$('input[name="dateOfBirth"]');
            if (dobInput) await dobInput.type(dob);
          }
          
          if (county) {
            const countySelect = await page.$('#county') || await page.$('select[name="county"]');
            if (countySelect) await page.select('#county, select[name="county"]', county);
          }
          
          // Submit form
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
            partyAffiliation: null,
            county: null,
            registrationStatus: null,
            voterId: null,
          };
          
          // Check for voter info display
          const voterSection = document.querySelector('.voter-status, #voterStatus, .results');
          if (voterSection) {
            const text = voterSection.textContent.toLowerCase();
            if (text.includes('registered') || text.includes('active')) {
              data.found = true;
              data.registrationStatus = 'Active';
            }
          }
          
          // Look for party preference
          const partyEl = document.querySelector('[class*="party"], [id*="party"]');
          if (partyEl) data.partyAffiliation = partyEl.textContent.trim();
          
          // County
          const countyEl = document.querySelector('[class*="county"]');
          if (countyEl) data.county = countyEl.textContent.trim();
          
          // Check for not found message
          const bodyText = document.body.textContent.toLowerCase();
          if (bodyText.includes('not found') || bodyText.includes('no record')) {
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
      throw new Error(`Browserless error: ${response.status}`);
    }

    const result = await response.json();
    
    return {
      success: true,
      source: 'voterstatus.sos.ca.gov',
      url: result.pageUrl || CA_VOTER_URL,
      state: 'CA',
      data: {
        found: result.found || false,
        name: result.name,
        partyAffiliation: result.partyAffiliation,
        county: result.county,
        registrationStatus: result.registrationStatus,
        voterId: result.voterId,
      },
      method: 'browserless',
    };
  } catch (error: unknown) {
    console.error('CA Voter lookup error:', error);
    return {
      success: false,
      source: 'voterstatus.sos.ca.gov',
      url: CA_VOTER_URL,
      state: 'CA',
      error: 'Lookup failed',
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

    console.log(`[CA Voter Lookup] Searching for: ${firstName} ${lastName}`);

    const request: CAVoterLookupRequest = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth,
      county,
    };

    let result = await lookupWithBrowserless(request);

    if (!result.success) {
      console.log(`[CA Voter Lookup] Automated lookup failed, providing manual URL`);
      result = {
        success: true,
        source: 'voterstatus.sos.ca.gov',
        url: CA_VOTER_URL,
        state: 'CA',
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
    console.error('[CA Voter Lookup] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'An error occurred',
        url: CA_VOTER_URL,
        state: 'CA',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
