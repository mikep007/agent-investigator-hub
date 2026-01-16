import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUBMIT_URL = 'https://41ae7b753004e478ae9fccc9566122.19.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/9d92c539ada14bc6b85a39e32b8a2d14/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=Vorj6ao8FHhbFAfTWZs5T_TaLsjD2oEPJs4OzZjiff8';
const RESULTS_URL = 'https://41ae7b753004e478ae9fccc9566122.19.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/fa15cee7c118490d98b2b3697cc038df/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=FJXEOOnLEZLZUscQv-7kvSt_C5WuBRWyz-3Y0MNy1YM';
// Frontend handles polling - we just submit and return immediately with pending status
const INITIAL_WAIT_MS = 5000; // Wait 5 seconds before returning to allow quick results

interface SearchData {
  fullName?: string;
  address?: string;
  email?: string;
  phone?: string;
  username?: string;
}

interface PowerAutomateResult {
  full_name: string;
  age: number | null;
  confidence: number;
  dob: string | null;
  dod: string | null;
  firstname: string | null;
  lastname: string | null;
  middlename: string | null;
  prefix: string | null;
  source: string | null;
  ssn: string | null;
  suffix: string | null;
  possibleAddresses: Array<{
    addressline: string;
    city: string;
    confidence: number;
    countryregion: string | null;
    stateprovince: string;
    street1: string;
    street2: string | null;
    zippostalcode: string;
  }>;
  possibleEmail: Array<{
    confidence: number;
    email: string;
    type: string | null;
  }>;
  possibleName: Array<{
    confidence: number;
    firstname: string | null;
    lastname: string | null;
    middlename: string | null;
    name: string;
    prefix: string | null;
    suffix: string | null;
  }>;
  possiblePhone: Array<{
    confidence: number;
    phone: string;
  }>;
  possibleSocialProfile: Array<{
    bio: string | null;
    confidence: number;
    pictureurl: string | null;
    profilename: string | null;
    profileurl: string | null;
    profileusername: string | null;
  }>;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkResultsOnce(apiKey: string, workorderid: string): Promise<PowerAutomateResult[] | null> {
  console.log('Checking for results once, workorderid:', workorderid);
  
  try {
    const response = await fetch(RESULTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ workorderid }),
    });

    if (!response.ok) {
      console.error('Power Automate check failed:', response.status);
      return null;
    }

    const result = await response.json();
    
    // Check if still processing
    if (result.message?.includes('still being created') || result.message?.includes('try again later')) {
      console.log('Results still processing');
      return null;
    }

    // Check if we got valid results
    if (Array.isArray(result) && result.length > 0) {
      console.log(`Got ${result.length} results from Power Automate`);
      return result as PowerAutomateResult[];
    }

    return null;
  } catch (error) {
    console.error('Power Automate check error:', error);
    return null;
  }
}

async function submitCase(apiKey: string, searchData: SearchData): Promise<{ workorderid: string } | null> {
  console.log('Submitting case to Power Automate with searchData:', JSON.stringify(searchData));
  
  const requestBody = {
    typeOfCase: [1],
    referrerInformation: {
      firstName: "external",
      lastName: "lovable",
      companyName: "Lovable"
    },
    claimantInformation: {
      typeOfAssignment: 1,
      username: searchData.username || "",
      fullName: searchData.fullName || "",
      address: searchData.address || "",
      phoneNumber: searchData.phone || "",
      email: searchData.email || ""
    }
  };

  console.log('Power Automate request body:', JSON.stringify(requestBody));

  try {
    const response = await fetch(SUBMIT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      console.error('Power Automate submit failed:', response.status, await response.text());
      return null;
    }

    const result = await response.json();
    console.log('Power Automate submit result:', result);

    if (result.workorderid) {
      return { workorderid: result.workorderid };
    } else if (result.message?.includes('Work Order ID')) {
      // Extract workorderid from message if present
      const match = result.message.match(/Work Order ID:\s*([a-f0-9-]+)/i);
      if (match) {
        return { workorderid: match[1] };
      }
    }

    return null;
  } catch (error) {
    console.error('Power Automate submit error:', error);
    return null;
  }
}

// Old pollForResults removed - frontend now handles polling via osint-power-automate-poll

function normalizeResults(results: PowerAutomateResult[], searchData: SearchData) {
  // Normalize to common format used by other OSINT functions
  const persons = results.map(person => ({
    full_name: person.full_name,
    firstName: person.firstname,
    lastName: person.lastname,
    middleName: person.middlename,
    age: person.age,
    confidence: person.confidence,
    dob: person.dob,
    dod: person.dod,
    addresses: person.possibleAddresses.map(addr => ({
      street: addr.street1,
      street2: addr.street2,
      city: addr.city,
      state: addr.stateprovince,
      zip: addr.zippostalcode,
      full: addr.addressline,
      confidence: addr.confidence,
    })),
    emails: person.possibleEmail.map(e => ({
      email: e.email,
      type: e.type,
      confidence: e.confidence,
    })),
    phones: person.possiblePhone.map(p => ({
      phone: p.phone,
      confidence: p.confidence,
    })),
    aliases: person.possibleName.map(n => n.name).filter(Boolean),
    socialProfiles: person.possibleSocialProfile
      .filter(sp => sp.profileurl)
      .map(sp => ({
        url: sp.profileurl,
        username: sp.profileusername,
        name: sp.profilename,
        bio: sp.bio,
        pictureUrl: sp.pictureurl,
        confidence: sp.confidence,
      })),
  }));

  // Summary statistics
  const totalEmails = results.reduce((sum, p) => sum + p.possibleEmail.length, 0);
  const totalPhones = results.reduce((sum, p) => sum + p.possiblePhone.length, 0);
  const totalAddresses = results.reduce((sum, p) => sum + p.possibleAddresses.length, 0);
  const totalSocialProfiles = results.reduce((sum, p) => 
    sum + p.possibleSocialProfile.filter(sp => sp.profileurl).length, 0);

  return {
    source: 'PowerAutomate',
    sourceLabel: 'Global Findings',
    searchedFor: searchData,
    personCount: persons.length,
    summary: {
      totalEmails,
      totalPhones,
      totalAddresses,
      totalSocialProfiles,
    },
    persons,
    rawResults: results,
    timestamp: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('POWER_AUTOMATE_API_KEY');
    if (!apiKey) {
      throw new Error('POWER_AUTOMATE_API_KEY not configured');
    }

    const searchData: SearchData = await req.json();
    console.log('osint-power-automate starting with:', searchData);

    // Validate at least one parameter is provided
    const hasParams = searchData.fullName || searchData.email || 
                      searchData.phone || searchData.username || 
                      searchData.address;
    
    if (!hasParams) {
      return new Response(JSON.stringify({
        success: false,
        error: 'At least one search parameter is required',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 1: Submit the case
    const submitResult = await submitCase(apiKey, searchData);
    if (!submitResult?.workorderid) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to submit case to Power Automate',
        data: null,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Case submitted, workorderid:', submitResult.workorderid);

    // Step 2: Wait briefly and check once for quick results
    await sleep(INITIAL_WAIT_MS);
    const quickResults = await checkResultsOnce(apiKey, submitResult.workorderid);
    
    if (quickResults && quickResults.length > 0) {
      // Got results quickly, return them
      const normalizedData = normalizeResults(quickResults, searchData);
      return new Response(JSON.stringify({
        success: true,
        workorderid: submitResult.workorderid,
        status: 'complete',
        data: normalizedData,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Return pending status - frontend will handle polling via osint-power-automate-poll
    return new Response(JSON.stringify({
      success: true,
      workorderid: submitResult.workorderid,
      status: 'pending',
      pending: true,
      message: 'Global Findings are being generated. Results will appear automatically.',
      data: null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('osint-power-automate error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
