import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LeakCheckProResult {
  success: boolean;
  found: number;
  quota: number;
  result: BreachRecord[];
}

interface BreachRecord {
  source: {
    name: string;
    breach_date: string;
    unverified?: number;
    passwordless?: number;
    compilation?: number;
  };
  fields: string[];
  [key: string]: any; // Allow any additional fields like email, username, password, etc.
}

interface BreachSource {
  name: string;
  date: string;
  line?: string;
  record?: BreachRecord; // Add the full record data
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target, type } = await req.json(); // target can be email, phone, or username
    // LeakCheck API v2 uses 'login' for username searches, not 'username'
    let searchType = type || 'email';
    if (searchType === 'username') {
      searchType = 'login';
    }
    
    // Clean and format target based on type
    let cleanTarget = target?.trim();
    if (searchType === 'phone') {
      // LeakCheck expects phone numbers without formatting - digits only
      cleanTarget = cleanTarget.replace(/[\s\-\(\)\+\.]/g, '');
      // If it starts with 1 and is 11 digits, it's likely US format - keep as is
      // Otherwise ensure proper format
      console.log(`Phone cleaned: ${target} -> ${cleanTarget}`);
    }
    
    if (!cleanTarget) {
      throw new Error('No target provided');
    }
    
    console.log(`LeakCheck search for ${searchType}:`, cleanTarget);

    const leakCheckApiKey = Deno.env.get('LEAKCHECK_API_KEY');
    if (!leakCheckApiKey) {
      throw new Error('LEAKCHECK_API_KEY not configured');
    }

    // Call LeakCheck.io Pro API v2 for detailed breach data
    const apiUrl = `https://leakcheck.io/api/v2/query/${encodeURIComponent(cleanTarget)}?type=${searchType}`;
    console.log('Calling LeakCheck Pro API v2:', apiUrl);
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-API-Key': leakCheckApiKey,
      },
    });

    if (!response.ok) {
      console.error('LeakCheck API error:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('Error response:', errorText);
      
      return new Response(JSON.stringify({ 
        error: `LeakCheck API error: ${response.statusText}`,
        found: 0,
        sources: []
      }), {
        status: 200, // Return 200 to not break the investigation flow
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data: LeakCheckProResult = await response.json();
    console.log('LeakCheck Pro API v2 results:', {
      found: data.found,
      records: data.result?.length || 0,
      quota: data.quota,
    });

    // Extract all unique fields from all breach records
    const allFields = new Set<string>();
    data.result?.forEach(record => {
      record.fields?.forEach(field => allFields.add(field));
    });

    // Convert breach records to sources format with detailed data
    const sources: BreachSource[] = data.result?.map(record => {
      // Build a line showing the leaked data
      const dataLine = record.fields
        ?.map(field => {
          const value = record[field];
          return value ? `${field}: ${value}` : null;
        })
        .filter(Boolean)
        .join(' | ') || 'No data details available';

      return {
        name: record.source.name,
        date: record.source.breach_date,
        line: dataLine,
        record: record, // Include the full record for detailed display
      };
    }) || [];

    console.log('Processed breach sources:', sources.length);

    return new Response(JSON.stringify({
      target: cleanTarget,
      type: searchType,
      found: data.found || 0,
      fields: Array.from(allFields),
      sources: sources,
      success: data.success,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-leakcheck:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage,
      found: 0,
      sources: []
    }), {
      status: 200, // Return 200 to not break the investigation flow
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
