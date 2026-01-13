import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TXVoterLookupRequest {
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  county?: string;
  voterIdNumber?: string;
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
  };
  error?: string;
  method: string;
}

const TX_VOTER_URL = 'https://teamrv-mvp.sos.texas.gov/MVP/mvp.do';

async function lookupWithBrowserless(request: TXVoterLookupRequest): Promise<VoterResult> {
  const browserlessKey = Deno.env.get('BROWSERLESS_API_KEY');
  
  if (!browserlessKey) {
    return {
      success: false,
      source: 'teamrv-mvp.sos.texas.gov',
      url: TX_VOTER_URL,
      state: 'TX',
      error: 'BROWSERLESS_API_KEY not configured',
      method: 'browserless',
    };
  }

  try {
    const functionScript = `
      module.exports = async ({ page }) => {
        const url = '${TX_VOTER_URL}';
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Wait for the page to load
        await page.waitForTimeout(2000);
        
        // Texas SOS requires accepting terms first sometimes
        const acceptBtn = await page.$('input[value="Accept"]');
        if (acceptBtn) {
          await acceptBtn.click();
          await page.waitForNavigation({ timeout: 10000 }).catch(() => {});
        }
        
        // Fill in the form fields
        await page.waitForSelector('input[name="firstName"]', { timeout: 10000 }).catch(() => {});
        
        const firstNameInput = await page.$('input[name="firstName"]');
        const lastNameInput = await page.$('input[name="lastName"]');
        
        if (firstNameInput && lastNameInput) {
          await firstNameInput.type('${request.firstName}');
          await lastNameInput.type('${request.lastName}');
          
          ${request.dateOfBirth ? `
          const dobInput = await page.$('input[name="dob"]');
          if (dobInput) await dobInput.type('${request.dateOfBirth}');
          ` : ''}
          
          ${request.county ? `
          const countySelect = await page.$('select[name="countyName"]');
          if (countySelect) await page.select('select[name="countyName"]', '${request.county}');
          ` : ''}
          
          // Submit the form
          const submitBtn = await page.$('input[type="submit"], button[type="submit"]');
          if (submitBtn) {
            await submitBtn.click();
            await page.waitForNavigation({ timeout: 15000 }).catch(() => {});
          }
        }
        
        await page.waitForTimeout(3000);
        
        // Extract data from results
        const result = await page.evaluate(() => {
          const data = {
            found: false,
            name: null,
            county: null,
            registrationStatus: null,
            voterId: null,
            precinct: null,
          };
          
          // Check for voter info
          const voterInfo = document.querySelector('.voter-info, #voterInfo, table.results');
          if (voterInfo) {
            data.found = true;
            
            // Try to extract name
            const nameEl = document.querySelector('[class*="name"], td:contains("Name")');
            if (nameEl) data.name = nameEl.textContent.trim();
            
            // Status
            const statusEl = document.querySelector('[class*="status"]');
            if (statusEl) data.registrationStatus = statusEl.textContent.trim();
            
            // County
            const countyEl = document.querySelector('[class*="county"]');
            if (countyEl) data.county = countyEl.textContent.trim();
          }
          
          // Check for "no records found" message
          const noRecords = document.body.textContent.toLowerCase();
          if (noRecords.includes('no records found') || noRecords.includes('not found')) {
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
      source: 'teamrv-mvp.sos.texas.gov',
      url: result.pageUrl || TX_VOTER_URL,
      state: 'TX',
      data: {
        found: result.found || false,
        name: result.name,
        county: result.county,
        registrationStatus: result.registrationStatus,
        voterId: result.voterId,
        precinct: result.precinct,
      },
      method: 'browserless',
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('TX Voter lookup error:', error);
    return {
      success: false,
      source: 'teamrv-mvp.sos.texas.gov',
      url: TX_VOTER_URL,
      state: 'TX',
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
    const { firstName, lastName, dateOfBirth, county, voterIdNumber } = body;

    if (!firstName || !lastName) {
      return new Response(
        JSON.stringify({ error: 'firstName and lastName are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[TX Voter Lookup] Searching for: ${firstName} ${lastName}`);

    const request: TXVoterLookupRequest = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth,
      county,
      voterIdNumber,
    };

    let result = await lookupWithBrowserless(request);

    if (!result.success) {
      console.log(`[TX Voter Lookup] Automated lookup failed, providing manual URL`);
      result = {
        success: true,
        source: 'teamrv-mvp.sos.texas.gov',
        url: TX_VOTER_URL,
        state: 'TX',
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
    console.error('[TX Voter Lookup] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        url: TX_VOTER_URL,
        state: 'TX',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
