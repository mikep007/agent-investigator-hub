import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FLVoterLookupRequest {
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  county?: string;
}

interface VotingHistoryEntry {
  electionDate: string;
  electionType: string;
  voted: boolean;
  voteMethod?: string;
  partyVoted?: string;
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
    voterId?: string;
    precinct?: string;
    congressionalDistrict?: string;
    stateHouseDistrict?: string;
    stateSenateDistrict?: string;
    votingHistory?: VotingHistoryEntry[];
  };
  error?: string;
  method: string;
}

// Florida Division of Elections voter lookup
const FL_VOTER_URL = 'https://registration.elections.myflorida.com/CheckVoterStatus';

async function lookupWithBrowserless(request: FLVoterLookupRequest): Promise<VoterResult> {
  const browserlessKey = Deno.env.get('BROWSERLESS_API_KEY');
  
  if (!browserlessKey) {
    return {
      success: false,
      source: 'registration.elections.myflorida.com',
      url: FL_VOTER_URL,
      state: 'FL',
      error: 'Service configuration error',
      method: 'browserless',
    };
  }

  try {
    // Properly escape user inputs to prevent code injection
    const safeFirstName = JSON.stringify(request.firstName);
    const safeLastName = JSON.stringify(request.lastName);
    const safeDob = request.dateOfBirth ? JSON.stringify(request.dateOfBirth) : null;

    const functionScript = `
      module.exports = async ({ page }) => {
        const firstName = ${safeFirstName};
        const lastName = ${safeLastName};
        const dob = ${safeDob};
        const url = 'https://registration.elections.myflorida.com/CheckVoterStatus';
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Florida's site has a specific form structure
        await page.waitForSelector('#FirstName, input[name="FirstName"]', { timeout: 10000 });
        
        // Fill form with safely escaped values
        await page.type('#FirstName, input[name="FirstName"]', firstName);
        await page.type('#LastName, input[name="LastName"]', lastName);
        
        if (dob) {
          const dobField = await page.$('#DateOfBirth, input[name="DateOfBirth"]');
          if (dobField) await dobField.type(dob);
        }
        
        // Submit
        const submitBtn = await page.$('input[type="submit"], button[type="submit"], #btnSearch');
        if (submitBtn) await submitBtn.click();
        
        await page.waitForTimeout(3000);
        await page.waitForNetworkIdle({ timeout: 10000 }).catch(() => {});
        
        const result = await page.evaluate(() => {
          const data = {
            found: false,
            name: null,
            partyAffiliation: null,
            pollingPlace: null,
            county: null,
            registrationStatus: null,
            voterId: null,
            precinct: null,
            congressionalDistrict: null,
            stateHouseDistrict: null,
            stateSenateDistrict: null,
            votingHistory: [],
          };
          
          // Check for not found
          const bodyText = document.body.textContent.toLowerCase();
          if (bodyText.includes('no record found') || bodyText.includes('not registered')) {
            return data;
          }
          
          // Florida often shows results in a table or definition list
          const voterTable = document.querySelector('.voter-info, #voterInfo, table.results');
          
          // Parse table cells
          const cells = document.querySelectorAll('td, dd, .info-value');
          const labels = document.querySelectorAll('th, dt, .info-label');
          
          labels.forEach((label, i) => {
            const labelText = label.textContent.toLowerCase();
            const value = cells[i]?.textContent?.trim();
            
            if (!value) return;
            
            if (labelText.includes('name')) {
              data.name = value;
              data.found = true;
            }
            if (labelText.includes('party')) data.partyAffiliation = value;
            if (labelText.includes('county')) data.county = value;
            if (labelText.includes('status')) data.registrationStatus = value;
            if (labelText.includes('voter id') || labelText.includes('voter #')) data.voterId = value;
            if (labelText.includes('precinct')) data.precinct = value;
            if (labelText.includes('congressional')) data.congressionalDistrict = value;
            if (labelText.includes('state house')) data.stateHouseDistrict = value;
            if (labelText.includes('state senate')) data.stateSenateDistrict = value;
            if (labelText.includes('polling')) data.pollingPlace = value;
          });
          
          // Fallback: try parsing text content
          if (!data.found) {
            const text = document.body.textContent;
            if (text.includes('Active') || text.includes('Registered')) {
              data.found = true;
              data.registrationStatus = 'Active';
              
              const partyMatch = text.match(/Party[:\\s]+([A-Za-z]+)/i);
              if (partyMatch) data.partyAffiliation = partyMatch[1];
            }
          }
          
          // Florida provides voting history - look for history table
          const historyTable = document.querySelector('#votingHistory, .voting-history, table[id*="history"]');
          if (historyTable) {
            const historyRows = historyTable.querySelectorAll('tbody tr, tr:not(:first-child)');
            historyRows.forEach(row => {
              const cells = row.querySelectorAll('td');
              if (cells.length >= 2) {
                const dateText = cells[0]?.textContent?.trim() || '';
                const electionType = cells[1]?.textContent?.trim() || '';
                const voteMethod = cells[2]?.textContent?.trim() || null;
                
                if (dateText && electionType) {
                  data.votingHistory.push({
                    electionDate: dateText,
                    electionType: electionType,
                    voted: true, // FL only shows elections where voter participated
                    voteMethod: voteMethod,
                  });
                }
              }
            });
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
      body: JSON.stringify({ code: functionScript, context: {} }),
    });

    if (!response.ok) {
      throw new Error(`Browserless error: ${response.status}`);
    }

    const result = await response.json();
    
    return {
      success: true,
      source: 'registration.elections.myflorida.com',
      url: result.pageUrl || FL_VOTER_URL,
      state: 'FL',
      data: {
        found: result.found || false,
        name: result.name,
        partyAffiliation: result.partyAffiliation,
        pollingPlace: result.pollingPlace,
        county: result.county,
        registrationStatus: result.registrationStatus,
        voterId: result.voterId,
        precinct: result.precinct,
        congressionalDistrict: result.congressionalDistrict,
        stateHouseDistrict: result.stateHouseDistrict,
        stateSenateDistrict: result.stateSenateDistrict,
        votingHistory: result.votingHistory || [],
      },
      method: 'browserless',
    };
  } catch (error: unknown) {
    console.error('FL Voter lookup error:', error);
    return {
      success: false,
      source: 'registration.elections.myflorida.com',
      url: FL_VOTER_URL,
      state: 'FL',
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

    console.log(`[FL Voter Lookup] Searching for: ${firstName} ${lastName}`);

    const request: FLVoterLookupRequest = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth,
      county,
    };

    let result = await lookupWithBrowserless(request);

    if (!result.success) {
      console.log(`[FL Voter Lookup] Automated lookup failed, providing manual URL`);
      result = {
        success: true,
        source: 'registration.elections.myflorida.com',
        url: FL_VOTER_URL,
        state: 'FL',
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
    console.error('[FL Voter Lookup] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'An error occurred',
        url: FL_VOTER_URL,
        state: 'FL',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
