import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NCVoterLookupRequest {
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
    county?: string;
    registrationStatus?: string;
    registrationDate?: string;
    voterId?: string;
    precinct?: string;
    congressionalDistrict?: string;
    stateSenateDistrict?: string;
    stateHouseDistrict?: string;
    pollingPlace?: string;
    votingHistory?: VotingHistoryEntry[];
  };
  error?: string;
  method: string;
}

const NC_VOTER_URL = 'https://vt.ncsbe.gov/RegLkup/';

async function lookupWithBrowserless(request: NCVoterLookupRequest): Promise<VoterResult> {
  const browserlessKey = Deno.env.get('BROWSERLESS_API_KEY');
  
  if (!browserlessKey) {
    return {
      success: false,
      source: 'vt.ncsbe.gov',
      url: NC_VOTER_URL,
      state: 'NC',
      error: 'Service configuration error',
      method: 'browserless',
    };
  }

  try {
    // Properly escape user inputs to prevent code injection
    const safeFirstName = JSON.stringify(request.firstName);
    const safeLastName = JSON.stringify(request.lastName);
    const safeCounty = request.county ? JSON.stringify(request.county) : null;

    const functionScript = `
      module.exports = async ({ page }) => {
        const firstName = ${safeFirstName};
        const lastName = ${safeLastName};
        const county = ${safeCounty};
        const url = 'https://vt.ncsbe.gov/RegLkup/';
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        await page.waitForTimeout(2000);
        
        // NC voter lookup form
        await page.waitForSelector('#txtLastName, input[name="LastName"]', { timeout: 10000 }).catch(() => {});
        
        const lastNameInput = await page.$('#txtLastName') || await page.$('input[name="LastName"]');
        const firstNameInput = await page.$('#txtFirstName') || await page.$('input[name="FirstName"]');
        
        if (firstNameInput && lastNameInput) {
          await lastNameInput.type(lastName);
          await firstNameInput.type(firstName);
          
          if (county) {
            const countySelect = await page.$('#ddlCounty') || await page.$('select[name="County"]');
            if (countySelect) await page.select('#ddlCounty, select[name="County"]', county);
          }
          
          // Submit
          const submitBtn = await page.$('#btnSearch, input[type="submit"], button[type="submit"]');
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
            pollingPlace: null,
            precinct: null,
            congressionalDistrict: null,
            stateSenateDistrict: null,
            stateHouseDistrict: null,
            votingHistory: [],
          };
          
          // Look for results table
          const resultsTable = document.querySelector('table.results, #resultsTable, .voter-results');
          if (resultsTable) {
            data.found = true;
            
            // Extract voter name from first row
            const rows = resultsTable.querySelectorAll('tr');
            if (rows.length > 1) {
              const cells = rows[1].querySelectorAll('td');
              if (cells.length > 0) {
                data.name = cells[0].textContent.trim();
              }
            }
          }
          
          // Check for voter detail page
          const voterDetail = document.querySelector('.voter-detail, #voterDetail');
          if (voterDetail) {
            data.found = true;
            
            // Party affiliation
            const partyEl = voterDetail.querySelector('[class*="party"]');
            if (partyEl) data.partyAffiliation = partyEl.textContent.trim();
            
            // Status
            const statusEl = voterDetail.querySelector('[class*="status"]');
            if (statusEl) data.registrationStatus = statusEl.textContent.trim();
            
            // County
            const countyEl = voterDetail.querySelector('[class*="county"]');
            if (countyEl) data.county = countyEl.textContent.trim();
          }
          
          // NC State Board provides voting history in a table
          const historyTable = document.querySelector('#voterHistory, .voting-history, table[id*="history"], table[class*="history"]');
          if (historyTable) {
            const historyRows = historyTable.querySelectorAll('tbody tr, tr:not(:first-child)');
            historyRows.forEach(row => {
              const cells = row.querySelectorAll('td');
              if (cells.length >= 2) {
                const dateText = cells[0]?.textContent?.trim() || '';
                const electionType = cells[1]?.textContent?.trim() || '';
                const votedText = cells[2]?.textContent?.trim().toLowerCase() || '';
                const voteMethod = cells[3]?.textContent?.trim() || null;
                const partyVoted = cells[4]?.textContent?.trim() || null;
                
                if (dateText && electionType) {
                  data.votingHistory.push({
                    electionDate: dateText,
                    electionType: electionType,
                    voted: !votedText.includes('did not') && votedText !== 'n' && votedText !== 'no',
                    voteMethod: voteMethod,
                    partyVoted: partyVoted,
                  });
                }
              }
            });
          }
          
          // Check for no records
          const bodyText = document.body.textContent.toLowerCase();
          if (bodyText.includes('no records') || bodyText.includes('not found') || bodyText.includes('no voter')) {
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
      source: 'vt.ncsbe.gov',
      url: result.pageUrl || NC_VOTER_URL,
      state: 'NC',
      data: {
        found: result.found || false,
        name: result.name,
        partyAffiliation: result.partyAffiliation,
        county: result.county,
        registrationStatus: result.registrationStatus,
        pollingPlace: result.pollingPlace,
        precinct: result.precinct,
        congressionalDistrict: result.congressionalDistrict,
        stateSenateDistrict: result.stateSenateDistrict,
        stateHouseDistrict: result.stateHouseDistrict,
        votingHistory: result.votingHistory || [],
      },
      method: 'browserless',
    };
  } catch (error: unknown) {
    console.error('NC Voter lookup error:', error);
    return {
      success: false,
      source: 'vt.ncsbe.gov',
      url: NC_VOTER_URL,
      state: 'NC',
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

    console.log(`[NC Voter Lookup] Searching for: ${firstName} ${lastName}`);

    const request: NCVoterLookupRequest = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth,
      county,
    };

    let result = await lookupWithBrowserless(request);

    if (!result.success) {
      console.log(`[NC Voter Lookup] Automated lookup failed, providing manual URL`);
      result = {
        success: true,
        source: 'vt.ncsbe.gov',
        url: NC_VOTER_URL,
        state: 'NC',
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
    console.error('[NC Voter Lookup] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'An error occurred',
        url: NC_VOTER_URL,
        state: 'NC',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
