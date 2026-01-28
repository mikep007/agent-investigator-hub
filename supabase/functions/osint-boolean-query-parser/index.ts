import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParsedCondition {
  field: string;
  value: string;
  operator: 'AND' | 'OR' | 'NOT';
  type: 'must' | 'should' | 'must_not';
}

interface QueryStructure {
  conditions: ParsedCondition[];
  rawQuery: string;
  naturalLanguageSummary: string;
  searchParams: {
    fullName?: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
    location?: string;
    city?: string;
    state?: string;
    zip?: string;
    email?: string;
    phone?: string;
    username?: string;
    employer?: string;
    age?: number;
    keywords?: string[];
    excludeTerms?: string[];
  };
  suggestedDataSources: string[];
  queryComplexity: 'simple' | 'moderate' | 'complex';
  generatedQueries: GeneratedQuery[];
}

interface GeneratedQuery {
  query: string;
  priority: number;
  totalValue: number;
  template: string;
}

// Parameter weights from the algorithm specification
const PARAM_WEIGHTS: Record<string, number> = {
  first_name: 10,
  middle_name: 10,
  last_name: 20,
  maiden_name: 20,
  first_name_alias: 5,
  last_name_alias: 5,
  house_number: 5,
  street: 15,
  apt_number: 2,
  city: 10,
  state: 5,
  zip: 10,
  house_type: 1,
  age: 5,
  dob: 10,
  age_alt: 1,
  height: 1,
  weight: 1,
  race: 5,
  gender: 5,
  email: 100,
  driver_license: 100,
  vehicle_make: 10,
  vehicle_model: 10,
  vehicle_year: 5,
  injury: 25,
  screenname: 40,
  injury_restrictions: 15,
  injury_date: 15,
  phone: 50,
  marital_status: 5,
  tattoo: 20,
  occupation: 15,
  skill: 5,
  accident_past: 10,
  injury_past: 10,
  arrest_past: 20,
  criminal_record_past: 20,
  locale: 1,
  first_name_initial: 1,
  last_name_initial: 1,
  middle_name_initial: 3,
  first_name_nickname: 3,
  email_username: 5,
  email_alternate_domains: 5,
  spouse_first_name: 3,
  spouse_last_name: 3,
  spouse_middle_name: 3,
  spouse_age: 1,
  keyword: 0,
  username: 40,
};

// Query templates with priorities (sorted by priority, lower = higher priority)
const QUERY_TEMPLATES = [
  // Priority 1 - Highest value queries (name + full address)
  { template: '"{first_name} {last_name}" "{house_number} {street} {city} {state} {zip}"', priority: 1, baseValue: 10000 },
  { template: '"{first_name} {last_name}" "{house_number} {street} {city}, {state} {zip}"', priority: 1, baseValue: 9960 },
  { template: '"{first_name} {last_name}" "{house_number} {street} {city} {state}"', priority: 2, baseValue: 9920 },
  
  // Priority 2-3 - Name + phone + address
  { template: '"{first_name} {last_name}" "{phone}" "{house_number} {street} {city} {state}"', priority: 2, baseValue: 9880 },
  { template: '"{first_name} {last_name}" "{house_number} {street} {city}"', priority: 3, baseValue: 9840 },
  { template: '"{first_name} {last_name}" "{email}"', priority: 3, baseValue: 9800 },
  
  // Priority 5 - Email only (high value)
  { template: '"{email}"', priority: 5, baseValue: 9760 },
  
  // Priority 7-15 - Various combinations
  { template: '"{first_name} {last_name}" "{phone}" "{city} {state}"', priority: 7, baseValue: 9720 },
  { template: '"{first_name} {last_name}" "{street} {city}"', priority: 10, baseValue: 9680 },
  { template: '"{first_name} {last_name}" {age} "{house_number} {street} {city} {state}"', priority: 12, baseValue: 9640 },
  { template: '"{first_name} {last_name}" {age} "{house_number} {street} {city}"', priority: 13, baseValue: 9600 },
  { template: '"{first_name} {last_name}" {age} "{street} {city}"', priority: 15, baseValue: 9560 },
  { template: '"{first_name} {last_name}" "{house_number} {street}"', priority: 15, baseValue: 9520 },
  
  // Priority 17-25 - Name + phone variations
  { template: '{first_name} {last_name} "{phone}" "{house_number} {street} {city} {state}"', priority: 17, baseValue: 9480 },
  { template: '"{first_name} {last_name}" {age} "{city} {state}"', priority: 18, baseValue: 9440 },
  { template: '"{first_name} {middle_name} {last_name}" "{phone}"', priority: 22, baseValue: 9320 },
  { template: '"{first_name} {last_name}" "{street}"', priority: 22, baseValue: 9280 },
  { template: '{first_name} {last_name} "{email}"', priority: 25, baseValue: 9240 },
  
  // Priority 45-50 - Phone and email username
  { template: '"{first_name} {last_name}" {email_username}', priority: 45, baseValue: 9200 },
  { template: '"{first_name} {last_name}" "{phone}"', priority: 45, baseValue: 9160 },
  { template: '{first_name} "{phone}"', priority: 46, baseValue: 9120 },
  { template: '"{spouse_first_name} {spouse_last_name}" "{phone}"', priority: 50, baseValue: 9000 },
  
  // Priority 60-85 - Various phone formats and middle name
  { template: '"{first_name} {last_name}" "{phone}" {city}', priority: 55, baseValue: 8920 },
  { template: '"{first_name} {middle_name} {last_name}" "{phone}"', priority: 75, baseValue: 8760 },
  { template: '"{first_name} {last_name}" {keyword}', priority: 80, baseValue: 8360 },
  { template: '"{first_name} {middle_name} {last_name}"', priority: 85, baseValue: 8240 },
  
  // Priority 100-120 - Username and social media
  { template: '"{first_name} {last_name}" "@{username}"', priority: 100, baseValue: 8160 },
  { template: '"{phone}"', priority: 110, baseValue: 8080 },
  { template: '"{first_name} {last_name}"', priority: 120, baseValue: 7520 },
  { template: '{first_name} "@{username}"', priority: 120, baseValue: 7800 },
  { template: '"{email_username}@"', priority: 120, baseValue: 7760 },
  
  // Priority 180-200 - Lower priority searches
  { template: '"{email_username}"', priority: 180, baseValue: 6200 },
  { template: '"{first_name} {last_name}" "{phone}"', priority: 180, baseValue: 6240 },
  { template: '{last_name} "{phone}" "{city} {state}"', priority: 180, baseValue: 6160 },
  { template: '"{phone}"', priority: 200, baseValue: 5720 },
  { template: '"{first_name} {last_name}" {keyword}', priority: 250, baseValue: 4880 },
  
  // Priority 300+ - Fallback queries
  { template: '"{last_name}, {first_name}"', priority: 300, baseValue: 3760 },
  { template: '"{first_name} {last_name}" {age} {city}', priority: 300, baseValue: 3720 },
  { template: '{first_name} {last_name} {city} {state}', priority: 370, baseValue: 2320 },
  { template: '{first_name} {last_name} "{house_number} {street} {city} {state}"', priority: 400, baseValue: 1080 },
  
  // Social media specific
  { template: 'site:facebook.com "{first_name} {last_name}"', priority: 180, baseValue: 6040 },
  { template: 'site:linkedin.com "{first_name} {last_name}"', priority: 180, baseValue: 6020 },
  { template: 'site:twitter.com "{first_name} {last_name}"', priority: 190, baseValue: 5900 },
  { template: 'site:instagram.com "{username}"', priority: 190, baseValue: 5880 },
  
  // Employer specific
  { template: '"{first_name} {last_name}" "{employer}"', priority: 100, baseValue: 8100 },
  { template: '"{first_name} {last_name}" site:linkedin.com "{employer}"', priority: 110, baseValue: 8000 },
];

// Function to generate queries based on input parameters
function generateQueries(params: Record<string, string | number | undefined>, topN = 50): GeneratedQuery[] {
  const queries: GeneratedQuery[] = [];
  
  for (const templateDef of QUERY_TEMPLATES) {
    let query = templateDef.template;
    let hasAllRequiredParams = true;
    let inputValue = 0;
    let placeholderCount = 0;
    let matchedCount = 0;
    
    // Find all placeholders in template
    const placeholders = query.match(/\{(\w+)\}/g) || [];
    placeholderCount = placeholders.length;
    
    for (const placeholder of placeholders) {
      const paramName = placeholder.replace(/[{}]/g, '');
      const value = params[paramName];
      
      if (value !== undefined && value !== null && value !== '') {
        query = query.replace(placeholder, String(value));
        matchedCount++;
        // Add weight for this parameter
        const weight = PARAM_WEIGHTS[paramName] || 1;
        inputValue += weight;
      } else {
        hasAllRequiredParams = false;
        break;
      }
    }
    
    // Only include queries where all placeholders were filled
    if (hasAllRequiredParams && matchedCount > 0) {
      // Calculate total value: base value * (input value / 100)
      const totalValue = Math.round(templateDef.baseValue * (inputValue / 100));
      
      queries.push({
        query: query.trim(),
        priority: templateDef.priority,
        totalValue,
        template: templateDef.template,
      });
    }
  }
  
  // Sort by priority (ascending) then by total value (descending)
  queries.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return b.totalValue - a.totalValue;
  });
  
  // Remove duplicates and return top N
  const uniqueQueries: GeneratedQuery[] = [];
  const seenQueries = new Set<string>();
  
  for (const q of queries) {
    if (!seenQueries.has(q.query)) {
      seenQueries.add(q.query);
      uniqueQueries.push(q);
      if (uniqueQueries.length >= topN) break;
    }
  }
  
  return uniqueQueries;
}

// Function to extract email username from email
function extractEmailUsername(email: string): string {
  return email.split('@')[0] || '';
}

// Function to parse phone into different formats
function formatPhone(phone: string): string {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  
  // Format as (###)###-####
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)})${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  
  return phone;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    if (!query || typeof query !== 'string') {
      throw new Error('Query string is required');
    }

    console.log('Parsing boolean query:', query);

    const systemPrompt = `You are an expert OSINT query parser. Your role is to:

1. Parse boolean queries containing AND, OR, NOT operators
2. Extract structured search parameters from natural language
3. Identify entity types (name, location, email, phone, username, employer)
4. Suggest optimal data sources for the query

Parse the input query and extract:
- Individual conditions with their boolean operators
- Structured search parameters for OSINT investigation
- Suggested data sources to query
- Query complexity assessment

Field types to recognize:
- Name/Person: first name, last name, full name, middle name
- Location: city, state, country, address, zip code
- Email: email addresses or domains
- Phone: phone numbers in any format
- Username: social media handles, usernames, screennames
- Employer/Company: business names, employers
- Age: numeric age values
- Keywords: general search terms

Boolean operators:
- AND: Both conditions must match (type: "must")
- OR: Either condition can match (type: "should")  
- NOT: Exclude this condition (type: "must_not")

Return structured JSON with the parsed query.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Parse this boolean query and extract structured search parameters:\n\n"${query}"` }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'parse_boolean_query',
              description: 'Parse a boolean query into structured search parameters',
              parameters: {
                type: 'object',
                properties: {
                  conditions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        field: { type: 'string', description: 'Field name (name, location, email, phone, username, employer, keyword, age)' },
                        value: { type: 'string', description: 'The search value' },
                        operator: { type: 'string', enum: ['AND', 'OR', 'NOT'] },
                        type: { type: 'string', enum: ['must', 'should', 'must_not'] }
                      },
                      required: ['field', 'value', 'operator', 'type'],
                      additionalProperties: false
                    }
                  },
                  naturalLanguageSummary: { type: 'string', description: 'Human-readable summary of what the query is searching for' },
                  searchParams: {
                    type: 'object',
                    properties: {
                      fullName: { type: 'string' },
                      firstName: { type: 'string' },
                      lastName: { type: 'string' },
                      middleName: { type: 'string' },
                      location: { type: 'string' },
                      city: { type: 'string' },
                      state: { type: 'string' },
                      zip: { type: 'string' },
                      email: { type: 'string' },
                      phone: { type: 'string' },
                      username: { type: 'string' },
                      employer: { type: 'string' },
                      age: { type: 'number' },
                      keywords: { type: 'array', items: { type: 'string' } },
                      excludeTerms: { type: 'array', items: { type: 'string' } }
                    },
                    additionalProperties: false
                  },
                  suggestedDataSources: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of suggested OSINT data sources to query'
                  },
                  queryComplexity: { type: 'string', enum: ['simple', 'moderate', 'complex'] }
                },
                required: ['conditions', 'naturalLanguageSummary', 'searchParams', 'suggestedDataSources', 'queryComplexity'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'parse_boolean_query' } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`AI request failed: ${response.status}`);
    }

    const aiResponse = await response.json();
    console.log('AI response:', JSON.stringify(aiResponse, null, 2));

    const toolCall = aiResponse.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('No tool call in AI response');
    }

    const parsedQuery = JSON.parse(toolCall.function.arguments);

    // Build parameters for query generation
    const queryParams: Record<string, string | number | undefined> = {};
    
    // Extract name parts
    if (parsedQuery.searchParams.fullName) {
      const nameParts = parsedQuery.searchParams.fullName.split(' ');
      queryParams.first_name = nameParts[0];
      queryParams.last_name = nameParts[nameParts.length - 1];
      if (nameParts.length > 2) {
        queryParams.middle_name = nameParts.slice(1, -1).join(' ');
      }
    }
    if (parsedQuery.searchParams.firstName) {
      queryParams.first_name = parsedQuery.searchParams.firstName;
    }
    if (parsedQuery.searchParams.lastName) {
      queryParams.last_name = parsedQuery.searchParams.lastName;
    }
    if (parsedQuery.searchParams.middleName) {
      queryParams.middle_name = parsedQuery.searchParams.middleName;
    }
    
    // Location
    if (parsedQuery.searchParams.city) {
      queryParams.city = parsedQuery.searchParams.city;
    }
    if (parsedQuery.searchParams.state) {
      queryParams.state = parsedQuery.searchParams.state;
    }
    if (parsedQuery.searchParams.zip) {
      queryParams.zip = parsedQuery.searchParams.zip;
    }
    if (parsedQuery.searchParams.location && !queryParams.city) {
      // Try to parse location into city, state
      const locationParts = parsedQuery.searchParams.location.split(',').map((s: string) => s.trim());
      if (locationParts.length >= 2) {
        queryParams.city = locationParts[0];
        queryParams.state = locationParts[1];
      } else {
        queryParams.city = locationParts[0];
      }
    }
    
    // Contact info
    if (parsedQuery.searchParams.email) {
      queryParams.email = parsedQuery.searchParams.email;
      queryParams.email_username = extractEmailUsername(parsedQuery.searchParams.email);
    }
    if (parsedQuery.searchParams.phone) {
      queryParams.phone = formatPhone(parsedQuery.searchParams.phone);
    }
    if (parsedQuery.searchParams.username) {
      queryParams.username = parsedQuery.searchParams.username;
    }
    if (parsedQuery.searchParams.employer) {
      queryParams.employer = parsedQuery.searchParams.employer;
    }
    if (parsedQuery.searchParams.age) {
      queryParams.age = parsedQuery.searchParams.age;
    }
    
    // Keywords
    if (parsedQuery.searchParams.keywords?.length > 0) {
      queryParams.keyword = parsedQuery.searchParams.keywords[0];
    }
    
    console.log('Query params for generation:', queryParams);
    
    // Generate prioritized search queries
    const generatedQueries = generateQueries(queryParams, 30);
    console.log(`Generated ${generatedQueries.length} prioritized queries`);

    const queryStructure: QueryStructure = {
      ...parsedQuery,
      rawQuery: query,
      generatedQueries,
    };

    return new Response(
      JSON.stringify(queryStructure),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in osint-boolean-query-parser:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to parse query' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
