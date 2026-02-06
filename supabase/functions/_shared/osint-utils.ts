// Shared OSINT utilities used across multiple edge functions
// Extracted from osint-web-search and osint-comprehensive-investigation

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ========== STATE REGISTRY DATA ==========

export const STATE_BUSINESS_REGISTRIES: Record<string, { domain: string; name: string; searchTypes: string[] }> = {
  'FL': { domain: 'dos.fl.gov', name: 'Florida SunBiz', searchTypes: ['officer', 'registered agent', 'business'] },
  'FLORIDA': { domain: 'dos.fl.gov', name: 'Florida SunBiz', searchTypes: ['officer', 'registered agent', 'business'] },
  'CA': { domain: 'bizfileonline.sos.ca.gov', name: 'California Business Search', searchTypes: ['officer', 'agent', 'business'] },
  'CALIFORNIA': { domain: 'bizfileonline.sos.ca.gov', name: 'California Business Search', searchTypes: ['officer', 'agent', 'business'] },
  'NY': { domain: 'apps.dos.ny.gov', name: 'NY Business Entity Search', searchTypes: ['officer', 'agent', 'business'] },
  'NEW YORK': { domain: 'apps.dos.ny.gov', name: 'NY Business Entity Search', searchTypes: ['officer', 'agent', 'business'] },
  'TX': { domain: 'mycpa.cpa.state.tx.us', name: 'Texas Comptroller', searchTypes: ['officer', 'business'] },
  'TEXAS': { domain: 'mycpa.cpa.state.tx.us', name: 'Texas Comptroller', searchTypes: ['officer', 'business'] },
  'PA': { domain: 'file.dos.pa.gov', name: 'PA Business Entity Search', searchTypes: ['officer', 'agent', 'business'] },
  'PENNSYLVANIA': { domain: 'file.dos.pa.gov', name: 'PA Business Entity Search', searchTypes: ['officer', 'agent', 'business'] },
  'NJ': { domain: 'njportal.com', name: 'NJ Business Gateway', searchTypes: ['officer', 'agent', 'business'] },
  'NEW JERSEY': { domain: 'njportal.com', name: 'NJ Business Gateway', searchTypes: ['officer', 'agent', 'business'] },
  'IL': { domain: 'apps.ilsos.gov', name: 'Illinois Business Search', searchTypes: ['officer', 'agent', 'business'] },
  'ILLINOIS': { domain: 'apps.ilsos.gov', name: 'Illinois Business Search', searchTypes: ['officer', 'agent', 'business'] },
  'OH': { domain: 'businesssearch.ohiosos.gov', name: 'Ohio Business Search', searchTypes: ['officer', 'agent', 'business'] },
  'OHIO': { domain: 'businesssearch.ohiosos.gov', name: 'Ohio Business Search', searchTypes: ['officer', 'agent', 'business'] },
  'GA': { domain: 'ecorp.sos.ga.gov', name: 'Georgia Business Search', searchTypes: ['officer', 'agent', 'business'] },
  'GEORGIA': { domain: 'ecorp.sos.ga.gov', name: 'Georgia Business Search', searchTypes: ['officer', 'agent', 'business'] },
  'NC': { domain: 'sosnc.gov', name: 'NC Business Search', searchTypes: ['officer', 'agent', 'business'] },
  'NORTH CAROLINA': { domain: 'sosnc.gov', name: 'NC Business Search', searchTypes: ['officer', 'agent', 'business'] },
  'MI': { domain: 'cofs.lara.state.mi.us', name: 'Michigan Business Search', searchTypes: ['officer', 'agent', 'business'] },
  'MICHIGAN': { domain: 'cofs.lara.state.mi.us', name: 'Michigan Business Search', searchTypes: ['officer', 'agent', 'business'] },
  'AZ': { domain: 'azsos.gov', name: 'Arizona Corporation Commission', searchTypes: ['officer', 'agent', 'business'] },
  'ARIZONA': { domain: 'azsos.gov', name: 'Arizona Corporation Commission', searchTypes: ['officer', 'agent', 'business'] },
  'WA': { domain: 'sos.wa.gov', name: 'Washington Business Search', searchTypes: ['officer', 'agent', 'business'] },
  'WASHINGTON': { domain: 'sos.wa.gov', name: 'Washington Business Search', searchTypes: ['officer', 'agent', 'business'] },
  'CO': { domain: 'sos.state.co.us', name: 'Colorado Business Search', searchTypes: ['officer', 'agent', 'business'] },
  'COLORADO': { domain: 'sos.state.co.us', name: 'Colorado Business Search', searchTypes: ['officer', 'agent', 'business'] },
  'MA': { domain: 'corp.sec.state.ma.us', name: 'Massachusetts Corporations', searchTypes: ['officer', 'agent', 'business'] },
  'MASSACHUSETTS': { domain: 'corp.sec.state.ma.us', name: 'Massachusetts Corporations', searchTypes: ['officer', 'agent', 'business'] },
  'VA': { domain: 'scc.virginia.gov', name: 'Virginia Business Search', searchTypes: ['officer', 'agent', 'business'] },
  'VIRGINIA': { domain: 'scc.virginia.gov', name: 'Virginia Business Search', searchTypes: ['officer', 'agent', 'business'] },
  'NV': { domain: 'nvsos.gov', name: 'Nevada Business Search', searchTypes: ['officer', 'agent', 'business'] },
  'NEVADA': { domain: 'nvsos.gov', name: 'Nevada Business Search', searchTypes: ['officer', 'agent', 'business'] },
  'MD': { domain: 'egov.maryland.gov', name: 'Maryland Business Express', searchTypes: ['officer', 'agent', 'business'] },
  'MARYLAND': { domain: 'egov.maryland.gov', name: 'Maryland Business Express', searchTypes: ['officer', 'agent', 'business'] },
};

export const STATE_PROPERTY_ASSESSORS: Record<string, { domains: string[]; name: string }> = {
  'FL': { domains: ['appraiser.miamidade.gov', 'bcpa.net', 'pabroward.gov', 'ocpafl.org', 'hcpafl.org', 'pcpao.org', 'leepa.org', 'scpafl.org', 'ccappraiser.com'], name: 'Florida Property Appraiser' },
  'FLORIDA': { domains: ['appraiser.miamidade.gov', 'bcpa.net', 'pabroward.gov', 'ocpafl.org', 'hcpafl.org', 'pcpao.org', 'leepa.org', 'scpafl.org', 'ccappraiser.com'], name: 'Florida Property Appraiser' },
  'CA': { domains: ['assessor.lacounty.gov', 'sccassessor.org', 'assr.sfdlg.org', 'acgov.org', 'sdcounty.ca.gov'], name: 'California Assessor' },
  'CALIFORNIA': { domains: ['assessor.lacounty.gov', 'sccassessor.org', 'assr.sfdlg.org', 'acgov.org', 'sdcounty.ca.gov'], name: 'California Assessor' },
  'TX': { domains: ['hcad.org', 'dallascad.org', 'bcad.org', 'taad.org', 'traviscad.org', 'collincad.org'], name: 'Texas Appraisal District' },
  'TEXAS': { domains: ['hcad.org', 'dallascad.org', 'bcad.org', 'taad.org', 'traviscad.org', 'collincad.org'], name: 'Texas Appraisal District' },
  'NY': { domains: ['nyc.gov/finance', 'nassaucountyny.gov', 'suffolkcountyny.gov', 'westchestergov.com'], name: 'NY Property Records' },
  'NEW YORK': { domains: ['nyc.gov/finance', 'nassaucountyny.gov', 'suffolkcountyny.gov', 'westchestergov.com'], name: 'NY Property Records' },
  'PA': { domains: ['philadelphiarealestate.phila.gov', 'alleghenycounty.us/real-estate', 'montcopa.org'], name: 'PA Property Assessment' },
  'PENNSYLVANIA': { domains: ['philadelphiarealestate.phila.gov', 'alleghenycounty.us/real-estate', 'montcopa.org'], name: 'PA Property Assessment' },
  'NJ': { domains: ['njactb.org', 'tax1.co.monmouth.nj.us', 'bergencounty.com'], name: 'NJ Property Tax Records' },
  'NEW JERSEY': { domains: ['njactb.org', 'tax1.co.monmouth.nj.us', 'bergencounty.com'], name: 'NJ Property Tax Records' },
  'IL': { domains: ['cookcountyassessor.com', 'cciillinois.org'], name: 'Illinois Assessor' },
  'ILLINOIS': { domains: ['cookcountyassessor.com', 'cciillinois.org'], name: 'Illinois Assessor' },
  'OH': { domains: ['fiscalofficer.cuyahogacounty.us', 'auditor.franklincountyohio.gov', 'hamiltoncountyauditor.org'], name: 'Ohio Auditor/Assessor' },
  'OHIO': { domains: ['fiscalofficer.cuyahogacounty.us', 'auditor.franklincountyohio.gov', 'hamiltoncountyauditor.org'], name: 'Ohio Auditor/Assessor' },
  'GA': { domains: ['qpublic.net', 'fultoncountyga.gov', 'cobbassessor.org', 'dekalbcountyga.gov'], name: 'Georgia Property Records' },
  'GEORGIA': { domains: ['qpublic.net', 'fultoncountyga.gov', 'cobbassessor.org', 'dekalbcountyga.gov'], name: 'Georgia Property Records' },
  'NC': { domains: ['wake.gov', 'mecklenburgcountync.gov', 'guilfordcountync.gov'], name: 'NC Property Tax' },
  'NORTH CAROLINA': { domains: ['wake.gov', 'mecklenburgcountync.gov', 'guilfordcountync.gov'], name: 'NC Property Tax' },
  'AZ': { domains: ['mcassessor.maricopa.gov', 'asr.pima.gov', 'assessor.pinal.gov'], name: 'Arizona Assessor' },
  'ARIZONA': { domains: ['mcassessor.maricopa.gov', 'asr.pima.gov', 'assessor.pinal.gov'], name: 'Arizona Assessor' },
  'NV': { domains: ['clarkcountynv.gov', 'washoecounty.us/assessor'], name: 'Nevada Assessor' },
  'NEVADA': { domains: ['clarkcountynv.gov', 'washoecounty.us/assessor'], name: 'Nevada Assessor' },
  'CO': { domains: ['denvergov.org/assessor', 'arapahoegov.com/assessor', 'elpasoco.com/assessor'], name: 'Colorado Assessor' },
  'COLORADO': { domains: ['denvergov.org/assessor', 'arapahoegov.com/assessor', 'elpasoco.com/assessor'], name: 'Colorado Assessor' },
  'WA': { domains: ['kingcounty.gov/assessor', 'co.pierce.wa.us/assessor', 'snoco.org/assessor'], name: 'Washington Assessor' },
  'WASHINGTON': { domains: ['kingcounty.gov/assessor', 'co.pierce.wa.us/assessor', 'snoco.org/assessor'], name: 'Washington Assessor' },
  'MI': { domains: ['waynecounty.com', 'oakgov.com/treasury', 'accesskent.com'], name: 'Michigan Property Records' },
  'MICHIGAN': { domains: ['waynecounty.com', 'oakgov.com/treasury', 'accesskent.com'], name: 'Michigan Property Records' },
  'VA': { domains: ['fairfaxcounty.gov/tax', 'loudoun.gov/commissioner', 'henrico.us/real-estate'], name: 'Virginia Property Records' },
  'VIRGINIA': { domains: ['fairfaxcounty.gov/tax', 'loudoun.gov/commissioner', 'henrico.us/real-estate'], name: 'Virginia Property Records' },
  'MA': { domains: ['cityofboston.gov/assessing', 'sec.state.ma.us/rod'], name: 'Massachusetts Property Records' },
  'MASSACHUSETTS': { domains: ['cityofboston.gov/assessing', 'sec.state.ma.us/rod'], name: 'Massachusetts Property Records' },
  'MD': { domains: ['sdat.dat.maryland.gov', 'baltimorecity.gov/real-property'], name: 'Maryland Property Records' },
  'MARYLAND': { domains: ['sdat.dat.maryland.gov', 'baltimorecity.gov/real-property'], name: 'Maryland Property Records' },
};

// ========== REGISTRY LOOKUP HELPERS ==========

export function getPropertyAssessors(stateInput: string): { domains: string[]; name: string } | null {
  if (!stateInput) return null;
  const normalized = stateInput.toUpperCase().trim();
  return STATE_PROPERTY_ASSESSORS[normalized] || null;
}

export function getStateRegistry(stateInput: string): { domain: string; name: string; searchTypes: string[] } | null {
  if (!stateInput) return null;
  const normalized = stateInput.toUpperCase().trim();
  return STATE_BUSINESS_REGISTRIES[normalized] || null;
}

// ========== NAME MATCHING ==========

// Check if full name appears as an exact phrase or adjacent words
// STRICT: Require close adjacency for names to prevent false positives in legal documents
export function checkNameMatch(text: string, fullName: string, sourceUrl?: string): { exact: boolean; partial: boolean } {
  const textLower = text.toLowerCase();
  const nameLower = fullName.toLowerCase().trim();
  
  // Exact phrase match: "John Smith" as-is
  if (textLower.includes(nameLower)) {
    return { exact: true, partial: true };
  }
  
  const nameParts = nameLower.split(/\s+/).filter(p => p.length > 1);
  if (nameParts.length >= 2) {
    const firstName = nameParts[0];
    const lastName = nameParts[nameParts.length - 1];
    
    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const firstEsc = escapeRegex(firstName);
    const lastEsc = escapeRegex(lastName);
    
    // Adjacent match: "John A. Smith" or "John Smith" (up to 15 chars between)
    const forwardPattern = new RegExp(`\\b${firstEsc}\\b.{0,15}\\b${lastEsc}\\b`, 'i');
    const reversePattern = new RegExp(`\\b${lastEsc}\\b[,;]?\\s{0,5}\\b${firstEsc}\\b`, 'i');
    
    if (forwardPattern.test(text) || reversePattern.test(text)) {
      return { exact: true, partial: true };
    }
    
    // Check if this is a low-quality source that requires stricter matching
    const isLegalOrCourtSource = sourceUrl && (
      sourceUrl.includes('pacer') ||
      sourceUrl.includes('court') ||
      sourceUrl.includes('docket') ||
      sourceUrl.includes('case') ||
      sourceUrl.includes('filing') ||
      sourceUrl.includes('/pdf') ||
      sourceUrl.includes('.pdf') ||
      sourceUrl.includes('bankruptcy') ||
      sourceUrl.includes('judicial')
    );
    
    // For legal documents, we ONLY accept adjacent matches
    if (isLegalOrCourtSource) {
      console.log(`[STRICT] Legal/court source detected, requiring adjacent match only: ${sourceUrl}`);
      return { exact: false, partial: false };
    }
    
    // For regular sources, allow proximity matching (30 chars)
    const firstRegex = new RegExp(`\\b${firstEsc}\\b`, 'gi');
    const lastRegex = new RegExp(`\\b${lastEsc}\\b`, 'gi');
    
    const firstMatches: number[] = [];
    const lastMatches: number[] = [];
    
    let match;
    while ((match = firstRegex.exec(textLower)) !== null) {
      firstMatches.push(match.index);
    }
    while ((match = lastRegex.exec(textLower)) !== null) {
      lastMatches.push(match.index);
    }
    
    const PROXIMITY_THRESHOLD = 30;
    let hasProximateMatch = false;
    
    for (const fPos of firstMatches) {
      for (const lPos of lastMatches) {
        if (Math.abs(fPos - lPos) <= PROXIMITY_THRESHOLD) {
          hasProximateMatch = true;
          break;
        }
      }
      if (hasProximateMatch) break;
    }
    
    if (hasProximateMatch) {
      return { exact: false, partial: true };
    }
  }
  
  return { exact: false, partial: false };
}

// ========== NAME VALIDATION ==========

export const NON_NAME_WORDS = new Set([
  'one', 'two', 'three', 'four', 'five', 'his', 'her', 'their', 'the', 'and', 'or', 'by',
  'with', 'of', 'in', 'at', 'to', 'from', 'for', 'on', 'as', 'was', 'were', 'is', 'are',
  'beloved', 'loving', 'dear', 'late', 'brother', 'sister', 'father', 'mother', 'wife',
  'husband', 'son', 'daughter', 'grandfather', 'grandmother', 'uncle', 'aunt', 'nephew',
  'niece', 'cousin', 'friend', 'side', 'alongside', 'survived', 'preceded', 'death',
  'memorial', 'service', 'funeral', 'obituary', 'years', 'age', 'born', 'died', 'passed',
  'peacefully', 'suddenly', 'unexpectedly', 'after', 'before', 'during', 'view', 'vista'
]);

export const COMMON_FIRST_NAMES = new Set([
  'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph', 'thomas', 'charles',
  'christopher', 'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua',
  'kenneth', 'kevin', 'brian', 'george', 'timothy', 'ronald', 'edward', 'jason', 'jeffrey', 'ryan',
  'jacob', 'gary', 'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott', 'brandon',
  'benjamin', 'samuel', 'raymond', 'gregory', 'frank', 'alexander', 'patrick', 'jack', 'dennis', 'jerry',
  'tyler', 'aaron', 'jose', 'adam', 'nathan', 'henry', 'douglas', 'zachary', 'peter', 'kyle',
  'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan', 'jessica', 'sarah', 'karen',
  'lisa', 'nancy', 'betty', 'margaret', 'sandra', 'ashley', 'kimberly', 'emily', 'donna', 'michelle',
  'dorothy', 'carol', 'amanda', 'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon', 'laura', 'cynthia',
  'kathleen', 'amy', 'angela', 'shirley', 'anna', 'brenda', 'pamela', 'emma', 'nicole', 'helen',
  'samantha', 'katherine', 'christine', 'debra', 'rachel', 'carolyn', 'janet', 'catherine', 'maria', 'heather',
  'diane', 'ruth', 'julie', 'olivia', 'joyce', 'virginia', 'victoria', 'kelly', 'lauren', 'christina',
  'joan', 'evelyn', 'judith', 'megan', 'andrea', 'cheryl', 'hannah', 'jacqueline', 'martha', 'gloria',
  'teresa', 'ann', 'sara', 'madison', 'frances', 'kathryn', 'janice', 'jean', 'abigail', 'alice',
  'judy', 'sophia', 'grace', 'denise', 'amber', 'doris', 'marilyn', 'danielle', 'beverly', 'isabella',
  'theresa', 'diana', 'natalie', 'brittany', 'charlotte', 'marie', 'kayla', 'alexis', 'lori', 'chad',
  'moira', 'kate', 'caroline', 'brigida', 'triplett', 'dee', 'sarah', 'debra', 'robert', 'daniel'
]);

export function isValidFirstName(word: string): boolean {
  const lower = word.toLowerCase();
  if (word.length < 2 || !/^[A-Z]/.test(word)) return false;
  if (NON_NAME_WORDS.has(lower)) return false;
  if (COMMON_FIRST_NAMES.has(lower)) return true;
  return word.length >= 3 && /^[A-Z][a-z]+$/.test(word);
}

// ========== RELATIVE EXTRACTION ==========

// Extract potential relative names from text (especially obituaries)
// Enhanced to detect relationship context, maiden name patterns, and comma-separated lists
export function extractPotentialRelatives(text: string, primaryName: string): { name: string; relationship?: string }[] {
  const relatives: { name: string; relationship?: string }[] = [];
  const primaryNameLower = primaryName.toLowerCase();
  
  const primaryParts = primaryName.split(/\s+/).filter(p => p.length > 1);
  const primaryLastName = primaryParts.length > 1 ? primaryParts[primaryParts.length - 1].toLowerCase() : '';
  const primaryFirstName = primaryParts[0]?.toLowerCase() || '';
  
  const relationshipPatterns: { pattern: RegExp; relationship: string }[] = [
    { pattern: /\b(son|sons)\b/i, relationship: 'son' },
    { pattern: /\b(daughter|daughters)\b/i, relationship: 'daughter' },
    { pattern: /\b(wife|spouse)\b/i, relationship: 'spouse' },
    { pattern: /\b(husband)\b/i, relationship: 'spouse' },
    { pattern: /\b(brother|brothers)\b/i, relationship: 'brother' },
    { pattern: /\b(sister|sisters)\b/i, relationship: 'sister' },
    { pattern: /\b(mother|mom)\b/i, relationship: 'mother' },
    { pattern: /\b(father|dad)\b/i, relationship: 'father' },
    { pattern: /\b(grandfather|grandpa)\b/i, relationship: 'grandfather' },
    { pattern: /\b(grandmother|grandma)\b/i, relationship: 'grandmother' },
    { pattern: /\b(ex-wife|former wife|ex wife)\b/i, relationship: 'ex-spouse' },
    { pattern: /\b(ex-husband|former husband|ex husband)\b/i, relationship: 'ex-spouse' },
  ];
  
  // 1. Same-surname relatives
  if (primaryLastName && primaryLastName.length > 2) {
    const escapedLastName = primaryLastName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sameSurnamePattern = new RegExp(`\\b([A-Z][a-z]{2,15})\\s+${escapedLastName}\\b`, 'gi');
    let match;
    while ((match = sameSurnamePattern.exec(text)) !== null) {
      const firstName = match[1];
      if (firstName && isValidFirstName(firstName) && firstName.toLowerCase() !== primaryFirstName) {
        const fullName = `${firstName.charAt(0).toUpperCase()}${firstName.slice(1).toLowerCase()} ${primaryParts[primaryParts.length - 1]}`;
        
        const contextStart = Math.max(0, match.index - 50);
        const contextEnd = Math.min(text.length, match.index + match[0].length + 50);
        const context = text.substring(contextStart, contextEnd).toLowerCase();
        
        let relationship: string | undefined;
        for (const rp of relationshipPatterns) {
          if (rp.pattern.test(context)) {
            relationship = rp.relationship;
            break;
          }
        }
        
        if (!relatives.some(r => r.name.toLowerCase() === fullName.toLowerCase()) && 
            fullName.toLowerCase() !== primaryNameLower) {
          relatives.push({ name: fullName, relationship });
        }
      }
    }
  }
  
  // 2. Maiden name / Former spouse pattern
  if (primaryLastName && primaryLastName.length > 2) {
    const escapedLastName = primaryLastName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    const maidenNamePattern = new RegExp(`\\b([A-Z][a-z]{2,15})\\s+${escapedLastName}\\s+([A-Z][a-z]{2,15})\\b`, 'gi');
    let maidenMatch;
    while ((maidenMatch = maidenNamePattern.exec(text)) !== null) {
      const firstName = maidenMatch[1];
      const marriedLastName = maidenMatch[2];
      if (firstName && marriedLastName && isValidFirstName(firstName) && isValidFirstName(marriedLastName)) {
        const fullName = `${firstName} ${primaryParts[primaryParts.length - 1]} ${marriedLastName}`;
        if (!relatives.some(r => r.name.toLowerCase() === fullName.toLowerCase()) &&
            fullName.toLowerCase() !== primaryNameLower) {
          relatives.push({ name: fullName, relationship: 'ex-spouse' });
          console.log(`[RELATIVE] Found maiden name pattern: ${fullName}`);
        }
      }
    }
    
    const neePattern = new RegExp(`\\b([A-Z][a-z]{2,15})\\s+([A-Z][a-z]{2,15})\\s*[\\(,]?\\s*(?:née|born|maiden name)\\s+${escapedLastName}`, 'gi');
    let neeMatch;
    while ((neeMatch = neePattern.exec(text)) !== null) {
      const firstName = neeMatch[1];
      const currentLastName = neeMatch[2];
      if (firstName && currentLastName && isValidFirstName(firstName)) {
        const fullName = `${firstName} ${currentLastName}`;
        if (!relatives.some(r => r.name.toLowerCase() === fullName.toLowerCase())) {
          relatives.push({ name: fullName, relationship: 'spouse' });
          console.log(`[RELATIVE] Found née pattern: ${fullName} (née ${primaryLastName})`);
        }
      }
    }
  }
  
  // 3. Obituary-specific patterns: "survived by his wife Yana", "his daughter Moira"
  const obituaryPatterns = [
    /\b(?:his|her)\s+(wife|husband|spouse)\s+([A-Z][a-z]{2,15}(?:\s+[A-Z][a-z]{2,15})?)/gi,
    /\b(?:his|her)\s+(son|daughter|brother|sister|mother|father)\s+([A-Z][a-z]{2,15}(?:\s+[A-Z][a-z]{2,15})?)/gi,
    /\bsurvived\s+by\s+(?:his|her)\s+(wife|husband|spouse|son|daughter|brother|sister)\s+([A-Z][a-z]{2,15}(?:\s+[A-Z][a-z]{2,15})?)/gi,
  ];
  
  for (const pattern of obituaryPatterns) {
    let obituaryMatch;
    while ((obituaryMatch = pattern.exec(text)) !== null) {
      const relationship = obituaryMatch[1].toLowerCase();
      const name = obituaryMatch[2];
      if (name && name.length > 2) {
        let mappedRelationship = relationship;
        if (relationship === 'wife' || relationship === 'husband' || relationship === 'spouse') {
          mappedRelationship = 'spouse';
        }
        if (!relatives.some(r => r.name.toLowerCase() === name.toLowerCase())) {
          relatives.push({ name, relationship: mappedRelationship });
          console.log(`[RELATIVE] Obituary pattern: ${name} (${mappedRelationship})`);
        }
      }
    }
  }
  
  // 4. Comma-separated list patterns from obituaries
  const listRelationshipMap: Record<string, string> = {
    'children': 'child', 'child': 'child', 'kids': 'child',
    'sons': 'son', 'daughters': 'daughter',
    'grandchildren': 'grandchild', 'grandkids': 'grandchild',
    'great-grandchildren': 'great-grandchild', 'great grandchildren': 'great-grandchild',
    'siblings': 'sibling', 'brothers': 'brother', 'sisters': 'sister',
    'nieces': 'niece', 'nephews': 'nephew',
    'cousins': 'cousin',
    'step-children': 'step-child', 'stepchildren': 'step-child',
  };
  
  const listRelKeywords = Object.keys(listRelationshipMap).join('|');
  const commaListPattern = new RegExp(
    `(?:survived\\s+by\\s+)?(?:his|her)\\s+(?:beloved\\s+|loving\\s+|dear\\s+)?` +
    `(${listRelKeywords})\\s+` +
    `((?:[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2})` +
    `(?:\\s*,\\s*[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2})*` +
    `(?:\\s+and\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2})?)`,
    'gi'
  );
  
  let commaListMatch;
  while ((commaListMatch = commaListPattern.exec(text)) !== null) {
    const relType = commaListMatch[1].toLowerCase();
    const namesBlock = commaListMatch[2];
    const relationship = listRelationshipMap[relType] || relType;
    
    console.log(`[RELATIVE] Found comma-list for "${relType}": "${namesBlock}"`);
    
    const namesList = namesBlock
      .split(/\s*,\s*|\s+and\s+/i)
      .map(n => n.trim())
      .filter(n => n.length > 2 && /^[A-Z]/.test(n));
    
    for (const name of namesList) {
      const nameParts = name.split(/\s+/);
      const firstWord = nameParts[0];
      if (!firstWord || !isValidFirstName(firstWord)) continue;
      if (name.toLowerCase() === primaryNameLower) continue;
      
      if (!relatives.some(r => r.name.toLowerCase() === name.toLowerCase())) {
        relatives.push({ name, relationship });
        console.log(`[RELATIVE] Comma-list extracted: ${name} (${relationship})`);
      }
    }
  }
  
  // 5. Simpler comma-list without explicit relationship word
  if (primaryLastName && primaryLastName.length > 2) {
    const escapedLastName = primaryLastName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    const survivedByListPattern = new RegExp(
      `survived\\s+by\\s+` +
      `((?:[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2})` +
      `(?:\\s*,\\s*[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2})*` +
      `(?:\\s+and\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2})?)`,
      'gi'
    );
    
    let survivedMatch;
    while ((survivedMatch = survivedByListPattern.exec(text)) !== null) {
      const namesBlock = survivedMatch[1];
      if (!new RegExp(`\\b${escapedLastName}\\b`, 'i').test(namesBlock)) continue;
      
      const namesList = namesBlock
        .split(/\s*,\s*|\s+and\s+/i)
        .map(n => n.trim())
        .filter(n => n.length > 2 && /^[A-Z]/.test(n));
      
      for (const name of namesList) {
        const nameParts = name.split(/\s+/);
        const firstWord = nameParts[0];
        if (!firstWord || !isValidFirstName(firstWord)) continue;
        if (name.toLowerCase() === primaryNameLower) continue;
        
        if (!relatives.some(r => r.name.toLowerCase() === name.toLowerCase())) {
          relatives.push({ name, relationship: 'family' });
          console.log(`[RELATIVE] Survived-by list extracted: ${name}`);
        }
      }
    }
  }
  
  // Dedupe and return (limit to 25)
  const seen = new Set<string>();
  return relatives.filter(r => {
    const key = r.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 25);
}

// ========== KEYWORD / RELATIVE MATCHING ==========

export function isKeywordPotentialRelative(keyword: string, primaryName: string, providedRelatives?: string[]): boolean {
  const primaryParts = primaryName.split(/\s+/).filter(p => p.length > 1);
  const primaryLastName = primaryParts.length > 1 ? primaryParts[primaryParts.length - 1].toLowerCase() : '';
  
  const keywordLower = keyword.toLowerCase().trim();
  const keywordParts = keywordLower.split(/\s+/).filter(p => p.length > 1);
  
  if (providedRelatives && providedRelatives.length > 0) {
    for (const rel of providedRelatives) {
      const relLower = (typeof rel === 'string' ? rel : (rel as any).name || '').toLowerCase().trim();
      if (relLower && (keywordLower === relLower || keywordLower.includes(relLower) || relLower.includes(keywordLower))) {
        console.log(`[RELATIVE] Keyword "${keyword}" matches provided relative "${relLower}"`);
        return true;
      }
    }
  }
  
  if (!primaryLastName || primaryLastName.length < 2) return false;
  
  if (keywordParts.length >= 2) {
    const keywordLastName = keywordParts[keywordParts.length - 1];
    if (keywordLastName === primaryLastName) {
      return true;
    }
  }
  
  if (keywordLower === primaryLastName) {
    return true;
  }
  
  return false;
}

// ========== ADDRESS UTILITIES ==========

export function normalizeAddressForSearch(addr: string): string {
  if (!addr) return '';
  const parts = addr.split(',');
  const street = (parts[0] || '').toLowerCase().trim();
  return street
    .replace(/\bstreet\b/gi, 'st')
    .replace(/\bavenue\b/gi, 'ave')
    .replace(/\bdrive\b/gi, 'dr')
    .replace(/\broad\b/gi, 'rd')
    .replace(/\blane\b/gi, 'ln')
    .replace(/\bcourt\b/gi, 'ct')
    .replace(/\bapartment\b/gi, 'apt')
    .replace(/\bsuite\b/gi, 'ste')
    .replace(/[#.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ========== URL UTILITIES ==========

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    let host = parsed.hostname.replace(/^www\./, '');
    let path = parsed.pathname.replace(/\/$/, '') || '/';
    return `${host}${path}`.toLowerCase();
  } catch {
    return url
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '')
      .split('?')[0]
      .split('#')[0];
  }
}

// ========== SEARCH DATA INTERFACE ==========

export interface SearchData {
  fullName?: string;
  address?: string;
  email?: string;
  phone?: string;
  username?: string;
  keywords?: string;
  knownRelatives?: string;
  city?: string;
  state?: string;
  _parsedQuery?: any;
  _excludeTerms?: string[];
  _generatedQueries?: GeneratedQuery[];
}

export interface GeneratedQuery {
  query: string;
  priority: number;
  totalValue: number;
  template: string;
}

export interface SearchBatch {
  promises: Promise<any>[];
  types: string[];
}

// ========== LOCATION PARSING ==========

export function parseLocationFromAddress(address?: string): { city?: string; state?: string } {
  if (!address) return {};
  const addressMatch = address.match(/,\s*([^,]+),\s*([A-Z]{2})/i);
  if (addressMatch) {
    return { city: addressMatch[1].trim(), state: addressMatch[2].trim().toUpperCase() };
  }
  return {};
}

export function detectStateCode(address: string): string | null {
  const stateMatch = address.match(/,\s*([A-Z]{2})\s*\d{5}/i) ||
                     address.match(/,\s*([A-Z]{2})\s*$/i);
  if (stateMatch) return stateMatch[1].toUpperCase();
  
  const statePatterns: [RegExp, string][] = [
    [/,\s*Florida\s*/i, 'FL'],
    [/,\s*California\s*/i, 'CA'],
    [/,\s*New\s*York\s*/i, 'NY'],
    [/,\s*Texas\s*/i, 'TX'],
    [/,\s*Nevada\s*/i, 'NV'],
    [/,\s*Georgia\s*/i, 'GA'],
    [/,\s*Arizona\s*/i, 'AZ'],
  ];
  
  for (const [pattern, code] of statePatterns) {
    if (pattern.test(address)) return code;
  }
  
  return null;
}
