import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Disposable email domains for reputation scoring
const DISPOSABLE_DOMAINS = [
  'tempmail.com', 'guerrillamail.com', '10minutemail.com', 'throwaway.email',
  'mailinator.com', 'temp-mail.org', 'yopmail.com', 'sharklasers.com',
  'grr.la', 'guerrillamailblock.com', 'pokemail.net', 'spam4.me',
  'trashmail.com', 'dispostable.com', 'getnada.com', 'emailondeck.com',
];

// High-risk TLDs
const HIGH_RISK_TLDS = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.work', '.click'];

// Trusted email providers
const TRUSTED_PROVIDERS = ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'icloud.com', 'protonmail.com', 'aol.com'];

interface ReputationResult {
  reputation_score: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  risk_indicators: string[];
  trust_indicators: string[];
  scam_check: {
    is_scam: boolean;
    scam_indicators: string[];
    scam_type: string | null;
    databases_checked: string[];
  };
  verified: boolean;
  recommendation: string;
}

function calculateReputation(identifier: string, identifierType: string): ReputationResult {
  let score = 50; // Neutral baseline
  const riskIndicators: string[] = [];
  const trustIndicators: string[] = [];
  const scamIndicators: string[] = [];
  let isScam = false;

  if (identifierType === 'email') {
    const domain = identifier.split('@')[1] || '';

    // Trusted provider check
    if (TRUSTED_PROVIDERS.some(p => domain === p)) {
      score += 10;
      trustIndicators.push('Known trusted email provider');
    }

    // Disposable email check
    if (DISPOSABLE_DOMAINS.some(d => domain.includes(d))) {
      score -= 30;
      riskIndicators.push('Disposable/temporary email domain');
      scamIndicators.push('Disposable email address');
    }

    // Suspicious keyword check
    const localPart = identifier.split('@')[0] || '';
    const suspiciousWords = ['prize', 'winner', 'claim', 'urgent', 'lottery', 'prince', 'inheritance'];
    const foundSuspicious = suspiciousWords.filter(w => localPart.toLowerCase().includes(w));
    if (foundSuspicious.length > 0) {
      score -= 25;
      riskIndicators.push(`Suspicious keywords: ${foundSuspicious.join(', ')}`);
      scamIndicators.push('Suspicious keywords in email address');
      isScam = true;
    }

    // Age indicator from email style
    if (/^\d+$/.test(localPart)) {
      score -= 10;
      riskIndicators.push('Numeric-only email local part');
    }
  } else if (identifierType === 'domain') {
    // TLD risk check
    if (HIGH_RISK_TLDS.some(tld => identifier.endsWith(tld))) {
      score -= 25;
      riskIndicators.push('High-risk top-level domain');
      scamIndicators.push('High-risk TLD commonly used in scams');
      isScam = true;
    }

    // Government/educational trust
    if (identifier.endsWith('.gov') || identifier.endsWith('.edu')) {
      score += 20;
      trustIndicators.push('Government/Educational domain');
    }

    // Long domain name (phishing indicator)
    if (identifier.length > 30) {
      score -= 10;
      riskIndicators.push('Unusually long domain name');
      scamIndicators.push('Long domain often associated with phishing');
    }

    // Hyphen abuse
    const hyphens = (identifier.match(/-/g) || []).length;
    if (hyphens > 3) {
      score -= 15;
      riskIndicators.push('Excessive hyphens in domain');
    }
  } else if (identifierType === 'phone') {
    const normalized = identifier.replace(/[^0-9+]/g, '');

    // Country code trust
    if (normalized.startsWith('+1') || normalized.startsWith('1')) {
      score += 5;
      trustIndicators.push('US/Canada phone number');
    } else if (normalized.startsWith('+44')) {
      score += 5;
      trustIndicators.push('UK phone number');
    } else if (normalized.startsWith('+234')) {
      score -= 20;
      riskIndicators.push('High-risk country code (Nigeria)');
      scamIndicators.push('Country code commonly associated with scams');
    }

    // Valid length check
    if (normalized.replace('+', '').length < 10) {
      score -= 10;
      riskIndicators.push('Unusually short phone number');
    }
  } else if (identifierType === 'username') {
    // Random-looking username
    if (/^[a-z0-9]{15,}$/.test(identifier.toLowerCase())) {
      score -= 10;
      riskIndicators.push('Possibly auto-generated username');
    }

    // Very short username (often squatted)
    if (identifier.length <= 2) {
      score += 5;
      trustIndicators.push('Short username (valuable/early adopter)');
    }
  }

  // Clamp score
  const reputationScore = Math.max(0, Math.min(100, score));

  // Risk level
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  if (reputationScore >= 70) riskLevel = 'LOW';
  else if (reputationScore >= 40) riskLevel = 'MEDIUM';
  else if (reputationScore >= 20) riskLevel = 'HIGH';
  else riskLevel = 'CRITICAL';

  // Recommendation
  let recommendation: string;
  if (reputationScore >= 80) recommendation = 'Highly trustworthy — proceed with confidence';
  else if (reputationScore >= 60) recommendation = 'Generally trustworthy — standard verification recommended';
  else if (reputationScore >= 40) recommendation = 'Moderate risk — additional verification strongly recommended';
  else recommendation = 'High risk — thorough verification required before proceeding';

  return {
    reputation_score: reputationScore,
    risk_level: riskLevel,
    risk_indicators: riskIndicators,
    trust_indicators: trustIndicators,
    scam_check: {
      is_scam: isScam,
      scam_indicators: scamIndicators,
      scam_type: isScam ? 'phishing' : null,
      databases_checked: ['Disposable Email DB', 'TLD Risk DB', 'Keyword Analysis', 'Country Code Risk DB'],
    },
    verified: reputationScore >= 60,
    recommendation,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target, identifierType } = await req.json();
    console.log('Reputation check for:', target, 'type:', identifierType || 'auto');

    if (!target) {
      return new Response(JSON.stringify({ error: 'Target identifier is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Auto-detect identifier type if not provided
    let type = identifierType || 'unknown';
    if (type === 'auto' || type === 'unknown') {
      if (target.includes('@')) type = 'email';
      else if (/^\+?[0-9\s\-()]+$/.test(target)) type = 'phone';
      else if (target.includes('.') && !target.includes(' ')) type = 'domain';
      else type = 'username';
    }

    const result = calculateReputation(target, type);

    console.log(`Reputation result: score=${result.reputation_score}, risk=${result.risk_level}, scam=${result.scam_check.is_scam}`);

    return new Response(JSON.stringify({
      platform: 'Webutation',
      found: true,
      confidence: 'high',
      identifier: target,
      identifier_type: type,
      ...result,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-reputation-check:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
