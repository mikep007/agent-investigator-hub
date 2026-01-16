const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESULTS_URL = 'https://41ae7b753004e478ae9fccc9566122.19.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/fa15cee7c118490d98b2b3697cc038df/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=FJXEOOnLEZLZUscQv-7kvSt_C5WuBRWyz-3Y0MNy1YM';

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

function normalizeResults(results: PowerAutomateResult[]) {
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

  const totalEmails = results.reduce((sum, p) => sum + p.possibleEmail.length, 0);
  const totalPhones = results.reduce((sum, p) => sum + p.possiblePhone.length, 0);
  const totalAddresses = results.reduce((sum, p) => sum + p.possibleAddresses.length, 0);
  const totalSocialProfiles = results.reduce((sum, p) => 
    sum + p.possibleSocialProfile.filter(sp => sp.profileurl).length, 0);

  return {
    source: 'PowerAutomate',
    sourceLabel: 'Global Findings',
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

    const { workorderid } = await req.json();
    
    if (!workorderid) {
      return new Response(JSON.stringify({
        success: false,
        error: 'workorderid is required',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Polling for Power Automate results, workorderid:', workorderid);

    const response = await fetch(RESULTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ workorderid }),
    });

    if (!response.ok) {
      console.error('Power Automate poll failed:', response.status);
      return new Response(JSON.stringify({
        success: false,
        pending: true,
        message: 'Failed to fetch results, will retry',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await response.json();
    console.log('Poll result type:', typeof result, Array.isArray(result) ? `array(${result.length})` : 'not array');

    // Check if still processing
    if (result.message?.includes('still being created') || result.message?.includes('try again later')) {
      console.log('Results still processing');
      return new Response(JSON.stringify({
        success: true,
        pending: true,
        workorderid,
        message: 'Global Findings are still being generated.',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if we got valid results
    if (Array.isArray(result) && result.length > 0) {
      console.log(`Got ${result.length} results from Power Automate`);
      const normalizedData = normalizeResults(result as PowerAutomateResult[]);

      return new Response(JSON.stringify({
        success: true,
        pending: false,
        workorderid,
        status: 'complete',
        data: normalizedData,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Empty or unexpected response
    return new Response(JSON.stringify({
      success: true,
      pending: true,
      workorderid,
      message: 'Waiting for results',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('osint-power-automate-poll error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
