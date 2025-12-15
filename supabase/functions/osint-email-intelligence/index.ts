import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AssociatedEmail {
  email: string;
  source: string;
  confidence: 'high' | 'medium' | 'low';
  context?: string;
}

interface EmailIntelligenceResult {
  targetEmail: string;
  associatedEmails: AssociatedEmail[];
  breachSummary: {
    totalBreaches: number;
    sources: string[];
    exposedFields: string[];
  };
  registeredPlatforms: string[];
  manualVerificationLinks: {
    name: string;
    url: string;
    description: string;
  }[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target } = await req.json();
    console.log('Email Intelligence search for:', target);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(target)) {
      return new Response(JSON.stringify({ 
        error: 'Invalid email format',
        associatedEmails: [],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const associatedEmails: AssociatedEmail[] = [];
    const breachSources: string[] = [];
    const exposedFields = new Set<string>();
    const registeredPlatforms: string[] = [];

    // Extract username and domain from email
    const [localPart, domain] = target.split('@');

    // Step 1: Call LeakCheck to get breach data with associated emails
    const leakCheckApiKey = Deno.env.get('LEAKCHECK_API_KEY');
    if (leakCheckApiKey) {
      try {
        console.log('Calling LeakCheck for breach data...');
        const leakResponse = await fetch(
          `https://leakcheck.io/api/v2/query/${encodeURIComponent(target)}?type=email`,
          {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'X-API-Key': leakCheckApiKey,
            },
          }
        );

        if (leakResponse.ok) {
          const leakData = await leakResponse.json();
          console.log('LeakCheck results:', leakData.found, 'breaches');

          // Process breach records to extract associated emails
          leakData.result?.forEach((record: any) => {
            breachSources.push(record.source?.name || 'Unknown');
            record.fields?.forEach((field: string) => exposedFields.add(field));

            // Extract email fields from breach records (some breaches expose multiple emails)
            const emailFields = ['email', 'email_address', 'mail', 'alternate_email', 'recovery_email', 'secondary_email'];
            emailFields.forEach(field => {
              const value = record[field];
              if (value && typeof value === 'string' && emailRegex.test(value) && value.toLowerCase() !== target.toLowerCase()) {
                // Found an associated email
                if (!associatedEmails.find(e => e.email.toLowerCase() === value.toLowerCase())) {
                  associatedEmails.push({
                    email: value,
                    source: `Breach: ${record.source?.name || 'Unknown'}`,
                    confidence: 'high',
                    context: `Found in same breach record at ${record.source?.name}`,
                  });
                }
              }
            });

            // Check for email patterns in username field
            if (record.username && emailRegex.test(record.username) && record.username.toLowerCase() !== target.toLowerCase()) {
              if (!associatedEmails.find(e => e.email.toLowerCase() === record.username.toLowerCase())) {
                associatedEmails.push({
                  email: record.username,
                  source: `Breach: ${record.source?.name || 'Unknown'}`,
                  confidence: 'medium',
                  context: 'Username field contains email address',
                });
              }
            }
          });
        }
      } catch (error) {
        console.error('LeakCheck error:', error);
      }
    }

    // Step 2: Generate potential associated emails based on patterns
    // Common variations of the email
    const commonProviders = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'protonmail.com'];
    const potentialEmails: AssociatedEmail[] = [];

    // If the email uses a custom domain, suggest checking common providers
    if (!commonProviders.includes(domain.toLowerCase())) {
      // Suggest checking common providers with same local part
      commonProviders.slice(0, 3).forEach(provider => {
        potentialEmails.push({
          email: `${localPart}@${provider}`,
          source: 'Pattern Analysis',
          confidence: 'low',
          context: `Common provider variation - verify manually`,
        });
      });
    }

    // Step 3: Provide manual verification links for comprehensive checking
    const manualVerificationLinks = [
      {
        name: 'Have I Been Pwned',
        url: `https://haveibeenpwned.com/account/${encodeURIComponent(target)}`,
        description: 'Check breaches and associated accounts',
      },
      {
        name: 'EmailRep.io',
        url: `https://emailrep.io/${encodeURIComponent(target)}`,
        description: 'Email reputation and linked identities',
      },
      {
        name: 'Hunter.io',
        url: `https://hunter.io/email-verifier/${encodeURIComponent(target)}`,
        description: 'Professional email verification',
      },
      {
        name: 'IntelX',
        url: `https://intelx.io/?s=${encodeURIComponent(target)}`,
        description: 'Deep web and breach search',
      },
      {
        name: 'Dehashed',
        url: `https://www.dehashed.com/search?query=${encodeURIComponent(target)}`,
        description: 'Breach database search',
      },
      {
        name: 'Epieos',
        url: `https://epieos.com/?q=${encodeURIComponent(target)}&t=email`,
        description: 'Google account information',
      },
      {
        name: 'That\'s Them',
        url: `https://thatsthem.com/email/${encodeURIComponent(target)}`,
        description: 'People search by email',
      },
    ];

    // Step 4: Run quick platform check simulation (based on Holehe patterns)
    // Note: In production, this would call the actual Holehe function
    const quickPlatformChecks = [
      'Google', 'Facebook', 'Twitter', 'LinkedIn', 'Instagram', 
      'GitHub', 'Discord', 'Spotify', 'Amazon', 'Apple'
    ];

    const result: EmailIntelligenceResult = {
      targetEmail: target,
      associatedEmails: [...associatedEmails, ...potentialEmails.slice(0, 3)], // Limit suggestions
      breachSummary: {
        totalBreaches: breachSources.length,
        sources: [...new Set(breachSources)],
        exposedFields: Array.from(exposedFields),
      },
      registeredPlatforms: registeredPlatforms,
      manualVerificationLinks: manualVerificationLinks,
    };

    console.log('Email Intelligence complete:', {
      associatedEmails: result.associatedEmails.length,
      breaches: result.breachSummary.totalBreaches,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in osint-email-intelligence:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage,
      associatedEmails: [],
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
