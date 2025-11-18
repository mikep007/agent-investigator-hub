const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target } = await req.json();
    console.log('Phone lookup for:', target);

    // Extract phone number from target (basic validation)
    const phoneRegex = /[\d\s\-\+\(\)]+/g;
    const matches = target.match(phoneRegex);
    const phoneNumber = matches ? matches.join('').replace(/\D/g, '') : target;

    // Basic phone number analysis
    const results = {
      number: phoneNumber,
      formatted: formatPhoneNumber(phoneNumber),
      validity: {
        isValid: phoneNumber.length >= 10 && phoneNumber.length <= 15,
        length: phoneNumber.length,
        type: determinePhoneType(phoneNumber)
      },
      carrier: {
        estimated: estimateCarrier(phoneNumber),
        country: estimateCountry(phoneNumber)
      },
      risk: {
        isVoip: phoneNumber.startsWith('1') && phoneNumber.length === 11,
        isTollFree: ['800', '888', '877', '866', '855', '844', '833'].some(code => 
          phoneNumber.startsWith('1' + code)
        )
      }
    };

    console.log('Phone lookup results:', results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-phone-lookup:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function formatPhoneNumber(phone: string): string {
  if (phone.length === 10) {
    return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
  } else if (phone.length === 11 && phone.startsWith('1')) {
    return `+1 (${phone.slice(1, 4)}) ${phone.slice(4, 7)}-${phone.slice(7)}`;
  }
  return phone;
}

function determinePhoneType(phone: string): string {
  if (phone.length === 10 || (phone.length === 11 && phone.startsWith('1'))) {
    return 'Mobile/Landline';
  }
  return 'Unknown';
}

function estimateCarrier(phone: string): string {
  // This is a simplified carrier estimation based on area codes
  // In production, you'd use a proper carrier lookup API
  const areaCode = phone.slice(0, 3);
  const knownCarriers: Record<string, string> = {
    '310': 'AT&T/T-Mobile (CA)',
    '212': 'Verizon/AT&T (NY)',
    '415': 'AT&T/Verizon (CA)',
  };
  return knownCarriers[areaCode] || 'Unknown';
}

function estimateCountry(phone: string): string {
  if (phone.startsWith('1') && phone.length === 11) {
    return 'United States/Canada';
  } else if (phone.startsWith('44')) {
    return 'United Kingdom';
  } else if (phone.startsWith('61')) {
    return 'Australia';
  }
  return 'Unknown';
}
