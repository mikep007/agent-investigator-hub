import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OHVoterLookupRequest {
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
    precinct?: string;
    congressionalDistrict?: string;
    stateHouseDistrict?: string;
    stateSenateDistrict?: string;
    schoolDistrict?: string;
    votingHistory?: VotingHistoryEntry[];
  };
  error?: string;
  method: string;
}

// Ohio Secretary of State voter lookup
const OH_VOTER_URL = 'https://voterlookup.ohiosos.gov/voterlookup.aspx';

async function lookupWithBrowserless(request: OHVoterLookupRequest): Promise<VoterResult> {
  const browserlessKey = Deno.env.get('BROWSERLESS_API_KEY');
  
  if (!browserlessKey) {
    return {
      success: false,
      source: 'voterlookup.ohiosos.gov',
      url: OH_VOTER_URL,
      state: 'OH',
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
        const url = 'https://voterlookup.ohiosos.gov/voterlookup.aspx';
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Ohio's voter lookup has specific ASP.NET controls
        await page.waitForSelector('#ctl00_ContentPlaceHolder1_txtFirstName, input[id*="FirstName"]', { timeout: 10000 });
        
        // Fill form with safely escaped values
        const firstField = await page.$('#ctl00_ContentPlaceHolder1_txtFirstName, input[id*="FirstName"]');
        const lastField = await page.$('#ctl00_ContentPlaceHolder1_txtLastName, input[id*="LastName"]');
        
        if (firstField) await firstField.type(firstName);
        if (lastField) await lastField.type(lastName);
        
        if (dob) {
          const dobField = await page.$('#ctl00_ContentPlaceHolder1_txtDOB, input[id*="DOB"]');
          if (dobField) await dobField.type(dob);
        }
        
        if (county) {
          const countySelect = await page.$('#ctl00_ContentPlaceHolder1_ddlCounty, select[id*="County"]');
          if (countySelect) await page.select('#ctl00_ContentPlaceHolder1_ddlCounty, select[id*="County"]', county);
        }
        
        // Submit
        const submitBtn = await page.$('#ctl00_ContentPlaceHolder1_btnSearch, input[type="submit"], button[type="submit"]');
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
            registrationDate: null,
            precinct: null,
            congressionalDistrict: null,
            stateHouseDistrict: null,
            stateSenateDistrict: null,
            schoolDistrict: null,
            votingHistory: [],
          };
          
          const bodyText = document.body.textContent.toLowerCase();
          if (bodyText.includes('no records found') || bodyText.includes('not found')) {
            return data;
          }
          
          // Ohio displays results in a grid/table
          const resultTable = document.querySelector('#ctl00_ContentPlaceHolder1_gvResults, .results-table, table');
          
          if (resultTable) {
            const rows = resultTable.querySelectorAll('tr');
            rows.forEach(row => {
              const cells = row.querySelectorAll('td');
              if (cells.length >= 2) {
                const label = cells[0]?.textContent?.toLowerCase() || '';
                const value = cells[1]?.textContent?.trim() || '';
                
                if (label.includes('name')) {
                  data.name = value;
                  data.found = true;
                }
                if (label.includes('party')) data.partyAffiliation = value;
                if (label.includes('county')) data.county = value;
                if (label.includes('status')) data.registrationStatus = value;
                if (label.includes('precinct')) data.precinct = value;
                if (label.includes('polling') || label.includes('location')) data.pollingPlace = value;
                if (label.includes('congressional')) data.congressionalDistrict = value;
                if (label.includes('state rep') || label.includes('house')) data.stateHouseDistrict = value;
                if (label.includes('state sen')) data.stateSenateDistrict = value;
                if (label.includes('school')) data.schoolDistrict = value;
              }
            });
          }
          
          // Try to find voter info in spans/divs
          if (!data.found) {
            const voterName = document.querySelector('[id*="VoterName"], .voter-name, #voterName');
            if (voterName) {
              data.found = true;
              data.name = voterName.textContent.trim();
            }
            
            const party = document.querySelector('[id*="Party"], .party');
            if (party) data.partyAffiliation = party.textContent.trim();
            
            const status = document.querySelector('[id*="Status"], .status');
            if (status) data.registrationStatus = status.textContent.trim();
          }
          
          // Ohio provides voting history - look for history section
          const historyTable = document.querySelector('#votingHistory, .voting-history, [id*="VoterHistory"], table[class*="history"]');
          if (historyTable) {
            const historyRows = historyTable.querySelectorAll('tbody tr, tr:not(:first-child)');
            historyRows.forEach(row => {
              const cells = row.querySelectorAll('td');
              if (cells.length >= 2) {
                const dateText = cells[0]?.textContent?.trim() || '';
                const electionType = cells[1]?.textContent?.trim() || '';
                const partyVoted = cells[2]?.textContent?.trim() || null;
                
                if (dateText && electionType) {
                  data.votingHistory.push({
                    electionDate: dateText,
                    electionType: electionType,
                    voted: true,
                    partyVoted: partyVoted,
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
      source: 'voterlookup.ohiosos.gov',
      url: result.pageUrl || OH_VOTER_URL,
      state: 'OH',
      data: {
        found: result.found || false,
        name: result.name,
        partyAffiliation: result.partyAffiliation,
        pollingPlace: result.pollingPlace,
        county: result.county,
        registrationStatus: result.registrationStatus,
        registrationDate: result.registrationDate,
        precinct: result.precinct,
        congressionalDistrict: result.congressionalDistrict,
        stateHouseDistrict: result.stateHouseDistrict,
        stateSenateDistrict: result.stateSenateDistrict,
        schoolDistrict: result.schoolDistrict,
        votingHistory: result.votingHistory || [],
      },
      method: 'browserless',
    };
  } catch (error: unknown) {
    console.error('OH Voter lookup error:', error);
    return {
      success: false,
      source: 'voterlookup.ohiosos.gov',
      url: OH_VOTER_URL,
      state: 'OH',
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

    console.log(`[OH Voter Lookup] Searching for: ${firstName} ${lastName}`);

    const request: OHVoterLookupRequest = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth,
      county,
    };

    let result = await lookupWithBrowserless(request);

    if (!result.success) {
      console.log(`[OH Voter Lookup] Automated lookup failed, providing manual URL`);
      result = {
        success: true,
        source: 'voterlookup.ohiosos.gov',
        url: OH_VOTER_URL,
        state: 'OH',
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
    console.error('[OH Voter Lookup] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'An error occurred',
        url: OH_VOTER_URL,
        state: 'OH',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
