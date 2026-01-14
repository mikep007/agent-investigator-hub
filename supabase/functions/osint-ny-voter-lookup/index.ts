import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NYVoterLookupRequest {
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  county?: string;
  zipCode?: string;
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
    pollingPlace?: string;
    county?: string;
    registrationStatus?: string;
    registrationDate?: string;
    lastVoted?: string;
    district?: string;
    assemblyDistrict?: string;
    senateDistrict?: string;
    congressionalDistrict?: string;
    electionDistrict?: string;
  };
  error?: string;
  method: string;
}

// New York voter lookup portal
const NY_VOTER_URL = 'https://voterlookup.elections.ny.gov/';

async function lookupWithBrowserless(request: NYVoterLookupRequest): Promise<VoterResult> {
  const browserlessKey = Deno.env.get('BROWSERLESS_API_KEY');
  
  if (!browserlessKey) {
    return {
      success: false,
      source: 'voterlookup.elections.ny.gov',
      url: NY_VOTER_URL,
      state: 'NY',
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
    const safeZipCode = request.zipCode ? JSON.stringify(request.zipCode) : null;

    const functionScript = `
      module.exports = async ({ page }) => {
        const firstName = ${safeFirstName};
        const lastName = ${safeLastName};
        const dob = ${safeDob};
        const county = ${safeCounty};
        const zipCode = ${safeZipCode};
        const url = 'https://voterlookup.elections.ny.gov/';
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Wait for form to load
        await page.waitForSelector('input[name="FirstName"], #FirstName, [id*="firstName"]', { timeout: 10000 });
        
        // Fill in the form - NY uses different field names
        const firstNameField = await page.$('input[name="FirstName"], #FirstName, [id*="firstName"]');
        const lastNameField = await page.$('input[name="LastName"], #LastName, [id*="lastName"]');
        
        if (firstNameField) await firstNameField.type(firstName);
        if (lastNameField) await lastNameField.type(lastName);
        
        if (dob) {
          const dobField = await page.$('input[name="DateOfBirth"], #DateOfBirth, [id*="dob"]');
          if (dobField) await dobField.type(dob);
        }
        
        if (county) {
          const countyField = await page.$('select[name="County"], #County');
          if (countyField) await page.select('select[name="County"], #County', county);
        }
        
        if (zipCode) {
          const zipField = await page.$('input[name="ZipCode"], #ZipCode, [id*="zip"]');
          if (zipField) await zipField.type(zipCode);
        }
        
        // Submit form
        const submitBtn = await page.$('button[type="submit"], input[type="submit"], #submit, .submit-btn');
        if (submitBtn) await submitBtn.click();
        
        // Wait for results
        await page.waitForTimeout(3000);
        await page.waitForNetworkIdle({ timeout: 10000 }).catch(() => {});
        
        // Extract results
        const result = await page.evaluate(() => {
          const data = {
            found: false,
            name: null,
            partyAffiliation: null,
            pollingPlace: null,
            county: null,
            registrationStatus: null,
            assemblyDistrict: null,
            senateDistrict: null,
            congressionalDistrict: null,
            electionDistrict: null,
          };
          
          // Check for not found
          const notFound = document.body.textContent.toLowerCase().includes('no records found') ||
                          document.body.textContent.toLowerCase().includes('not found');
          if (notFound) return data;
          
          // Look for voter info
          const voterInfo = document.querySelector('.voter-info, .result, #voterInfo');
          if (voterInfo) {
            data.found = true;
            
            const nameEl = voterInfo.querySelector('.name, .voter-name');
            if (nameEl) data.name = nameEl.textContent.trim();
            
            const partyEl = voterInfo.querySelector('.party, [class*="party"]');
            if (partyEl) data.partyAffiliation = partyEl.textContent.trim();
            
            const countyEl = voterInfo.querySelector('.county, [class*="county"]');
            if (countyEl) data.county = countyEl.textContent.trim();
            
            const statusEl = voterInfo.querySelector('.status, [class*="status"]');
            if (statusEl) data.registrationStatus = statusEl.textContent.trim();
          }
          
          // Try parsing table rows
          const rows = document.querySelectorAll('tr, .info-row');
          rows.forEach(row => {
            const text = row.textContent;
            if (text.includes('Party')) {
              const match = text.match(/Party[:\\s]+([A-Za-z]+)/i);
              if (match) data.partyAffiliation = match[1];
              data.found = true;
            }
            if (text.includes('Assembly')) {
              const match = text.match(/Assembly[:\\s]+([\\d]+)/i);
              if (match) data.assemblyDistrict = match[1];
            }
            if (text.includes('Senate') && !text.includes('State')) {
              const match = text.match(/Senate[:\\s]+([\\d]+)/i);
              if (match) data.senateDistrict = match[1];
            }
            if (text.includes('Congressional')) {
              const match = text.match(/Congressional[:\\s]+([\\d]+)/i);
              if (match) data.congressionalDistrict = match[1];
            }
          });
          
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
      body: JSON.stringify({ code: functionScript, context: {} }),
    });

    if (!response.ok) {
      throw new Error(`Browserless error: ${response.status}`);
    }

    const result = await response.json();
    
    return {
      success: true,
      source: 'voterlookup.elections.ny.gov',
      url: result.pageUrl || NY_VOTER_URL,
      state: 'NY',
      data: {
        found: result.found || false,
        name: result.name,
        partyAffiliation: result.partyAffiliation,
        pollingPlace: result.pollingPlace,
        county: result.county,
        registrationStatus: result.registrationStatus,
        assemblyDistrict: result.assemblyDistrict,
        senateDistrict: result.senateDistrict,
        congressionalDistrict: result.congressionalDistrict,
        electionDistrict: result.electionDistrict,
      },
      method: 'browserless',
    };
  } catch (error: unknown) {
    console.error('NY Voter lookup error:', error);
    return {
      success: false,
      source: 'voterlookup.elections.ny.gov',
      url: NY_VOTER_URL,
      state: 'NY',
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
    const { firstName, lastName, dateOfBirth, county, zipCode } = body;

    if (!firstName || !lastName) {
      return new Response(
        JSON.stringify({ error: 'firstName and lastName are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[NY Voter Lookup] Searching for: ${firstName} ${lastName}`);

    const request: NYVoterLookupRequest = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth,
      county,
      zipCode,
    };

    let result = await lookupWithBrowserless(request);

    if (!result.success) {
      console.log(`[NY Voter Lookup] Automated lookup failed, providing manual URL`);
      result = {
        success: true,
        source: 'voterlookup.elections.ny.gov',
        url: NY_VOTER_URL,
        state: 'NY',
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
    console.error('[NY Voter Lookup] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'An error occurred',
        url: NY_VOTER_URL,
        state: 'NY',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
