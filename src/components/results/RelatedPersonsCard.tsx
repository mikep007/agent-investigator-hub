import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Users, UserCheck, Tag, Brain, 
  CheckCircle2, HelpCircle, Sparkles,
  ExternalLink, Search
} from "lucide-react";
import { FindingData } from "./types";

interface RelatedPersonsCardProps {
  findings: FindingData[];
  inputKeywords?: string[];
  aiSuggestedPersons?: string[];
  onPivot?: (type: string, value: string) => void;
}

interface PersonCategory {
  name: string;
  source: 'confirmed' | 'keyword' | 'ai_suggested';
  relationship?: string;
  confidence?: number;
}

const RelatedPersonsCard = ({ 
  findings, 
  inputKeywords = [], 
  aiSuggestedPersons = [],
  onPivot
}: RelatedPersonsCardProps) => {
  
  // Extract confirmed relatives from verified OSINT data sources
  // Web-discovered relatives from obituaries are shown separately for review
  const extractConfirmedRelatives = (): PersonCategory[] => {
    const confirmed: PersonCategory[] = [];
    
    findings.forEach(finding => {
      // Accept relatives from People_search findings (actual people databases)
      if (finding.agent_type === 'People_search' && finding.data?.results) {
        finding.data.results.forEach((result: any) => {
          if (result.relatives && Array.isArray(result.relatives)) {
            result.relatives.forEach((rel: any) => {
              const name = typeof rel === 'string' ? rel : rel.name;
              const relationship = typeof rel === 'object' ? rel.relationship : undefined;
              if (name && 
                  name.trim().length > 2 && 
                  !confirmed.find(c => c.name.toLowerCase() === name.toLowerCase())) {
                confirmed.push({
                  name: name.trim(),
                  source: 'confirmed',
                  relationship: relationship || 'From people database',
                  confidence: finding.confidence_score || 0.7
                });
              }
            });
          }
        });
      }

      // Accept relatives from FamilyTreeNow enrichment
      if (finding.agent_type === 'FamilyTreeNow' && finding.data?.relatives) {
        finding.data.relatives.forEach((rel: any) => {
          const name = rel.person?.name 
            ? `${rel.person.name.first || ''} ${rel.person.name.last || ''}`.trim()
            : (typeof rel === 'string' ? rel : rel.name);
          const relationship = rel.link?.relationship_type || rel.relationship;
          if (name && 
              name.trim().length > 2 && 
              !confirmed.find(c => c.name.toLowerCase() === name.toLowerCase())) {
            confirmed.push({
              name: name.trim(),
              source: 'confirmed',
              relationship: relationship || 'Family connection',
              confidence: rel.link?.score?.relationship_confidence || finding.confidence_score || 0.8
            });
          }
        });
      }

      // Extract from Power Automate Global Findings
      if (finding.agent_type === 'Power_automate') {
        const powerData = finding.data?.data || finding.data;
        const persons = powerData?.persons || [];
        
        persons.forEach((person: any) => {
          if (person.aliases && Array.isArray(person.aliases)) {
            person.aliases.forEach((alias: string) => {
              if (alias && 
                  alias.trim().length > 2 && 
                  !confirmed.find(c => c.name.toLowerCase() === alias.toLowerCase())) {
                confirmed.push({
                  name: alias.trim(),
                  source: 'confirmed',
                  relationship: 'Associated identity (Global Findings)',
                  confidence: (person.confidence || 50) / 100
                });
              }
            });
          }
        });
      }
    });

    return confirmed;
  };

  // Extract relatives discovered from web search (obituaries, memorials, etc.)
  // These require manual review before treating as confirmed
  const extractWebDiscoveredRelatives = (): PersonCategory[] => {
    const discovered: PersonCategory[] = [];
    const seenNames = new Set<string>();
    
    findings.forEach(finding => {
      // Web search findings contain discoveredRelatives from obituaries
      if (finding.agent_type === 'Web' && finding.data?.discoveredRelatives) {
        const relatives = finding.data.discoveredRelatives;
        if (Array.isArray(relatives)) {
          relatives.forEach((rel: any) => {
            const name = typeof rel === 'string' ? rel : rel.name;
            const relationship = typeof rel === 'object' ? rel.relationship : undefined;
            const nameLower = name?.toLowerCase()?.trim();
            
            if (name && 
                name.trim().length > 2 && 
                !seenNames.has(nameLower)) {
              seenNames.add(nameLower);
              discovered.push({
                name: name.trim(),
                source: 'keyword' as const, // Using keyword style for visual distinction
                relationship: relationship || 'From obituary/memorial',
                confidence: 0.6
              });
            }
          });
        }
      }
      
      // Also check individual web results that found relatives
      if (finding.agent_type === 'Web' && finding.data?.confirmedItems) {
        finding.data.confirmedItems.forEach((item: any) => {
          if (item.foundRelatives && Array.isArray(item.foundRelatives)) {
            item.foundRelatives.forEach((rel: string) => {
              const nameLower = rel?.toLowerCase()?.trim();
              if (rel && 
                  rel.trim().length > 2 && 
                  !seenNames.has(nameLower)) {
                seenNames.add(nameLower);
                discovered.push({
                  name: rel.trim(),
                  source: 'keyword' as const,
                  relationship: `Found in: ${item.displayLink || 'web result'}`,
                  confidence: item.confidenceScore || 0.5
                });
              }
            });
          }
        });
      }
    });

    return discovered;
  };

  // Process input keywords as associates
  const processKeywordAssociates = (): PersonCategory[] => {
    return inputKeywords
      .filter(kw => kw && kw.trim().length > 0)
      .map(keyword => ({
        name: keyword,
        source: 'keyword' as const,
        relationship: 'User-provided associate/keyword',
        confidence: 1.0
      }));
  };

  // Process AI-suggested related persons
  const processAISuggestions = (): PersonCategory[] => {
    return aiSuggestedPersons
      .filter(person => person && person.trim().length > 0)
      .map(person => ({
        name: person,
        source: 'ai_suggested' as const,
        relationship: 'AI-detected potential connection',
        confidence: 0.6
      }));
  };

  const confirmedRelatives = extractConfirmedRelatives();
  const webDiscoveredRelatives = extractWebDiscoveredRelatives();
  const keywordAssociates = processKeywordAssociates();
  const aiSuggested = processAISuggestions();
  
  // Dedupe web-discovered against confirmed and keywords
  const confirmedNames = new Set(confirmedRelatives.map(r => r.name.toLowerCase()));
  const keywordNames = new Set(keywordAssociates.map(r => r.name.toLowerCase()));
  const filteredWebDiscovered = webDiscoveredRelatives.filter(
    r => !confirmedNames.has(r.name.toLowerCase()) && !keywordNames.has(r.name.toLowerCase())
  );

  const totalCount = confirmedRelatives.length + filteredWebDiscovered.length + keywordAssociates.length + aiSuggested.length;

  if (totalCount === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground py-4">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No relatives or associates found.</p>
            <p className="text-xs mt-1">Include a name in your search to discover related persons.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Related Persons & Associates</h3>
          </div>
          <Badge variant="secondary">{totalCount} total</Badge>
        </div>
        
        {/* Legend for beginners */}
        <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 cursor-help">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  <span>Confirmed</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Found in people search databases</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 cursor-help">
                  <Users className="h-3 w-3 text-orange-600" />
                  <span>Obituaries</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Names from obituaries/memorial pages (verify relationship)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 cursor-help">
                  <Tag className="h-3 w-3 text-blue-600" />
                  <span>Your Keywords</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Names/keywords you entered in the search form</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 cursor-help">
                  <Sparkles className="h-3 w-3 text-purple-600" />
                  <span>AI Suggested</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Detected by AI analysis of investigation patterns</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Confirmed Relatives - Green section */}
        {confirmedRelatives.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-700">
                Confirmed Relatives ({confirmedRelatives.length})
              </span>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50/50 p-3">
              <div className="flex flex-wrap gap-2">
                {confirmedRelatives.map((person, idx) => (
                  <TooltipProvider key={idx}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1">
                          <Badge 
                            variant="outline" 
                            className="bg-white border-green-300 text-green-800 hover:bg-green-100 cursor-pointer transition-colors"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" />
                            {person.name}
                          </Badge>
                          {onPivot && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 hover:bg-green-100"
                              onClick={() => onPivot('name', person.name)}
                            >
                              <Search className="h-3 w-3 text-green-600" />
                            </Button>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs space-y-1">
                          <p className="font-semibold">{person.name}</p>
                          {person.relationship && (
                            <p className="text-muted-foreground">{person.relationship}</p>
                          )}
                          <p className="text-green-600">
                            Confidence: {Math.round((person.confidence || 0) * 100)}%
                          </p>
                          <p className="text-primary flex items-center gap-1 mt-1">
                            <Search className="h-3 w-3" />
                            Click search icon to investigate
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Web-Discovered Relatives - Orange section (from obituaries, memorials) */}
        {filteredWebDiscovered.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-orange-600" />
              <span className="text-sm font-medium text-orange-700">
                From Obituaries/Memorials ({filteredWebDiscovered.length})
              </span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs text-xs">Names extracted from obituaries and memorial pages. These are likely relatives but should be verified.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-3">
              <div className="flex flex-wrap gap-2">
                {filteredWebDiscovered.map((person, idx) => (
                  <TooltipProvider key={idx}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1">
                          <Badge 
                            variant="outline" 
                            className="bg-white border-orange-300 text-orange-800 hover:bg-orange-100 cursor-pointer transition-colors"
                          >
                            <Users className="h-3 w-3 mr-1 text-orange-600" />
                            {person.name}
                          </Badge>
                          {onPivot && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 hover:bg-orange-100"
                              onClick={() => onPivot('name', person.name)}
                            >
                              <Search className="h-3 w-3 text-orange-600" />
                            </Button>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs space-y-1">
                          <p className="font-semibold">{person.name}</p>
                          {person.relationship && (
                            <p className="text-muted-foreground">{person.relationship}</p>
                          )}
                          <p className="text-orange-600">
                            Needs verification
                          </p>
                          <p className="text-primary flex items-center gap-1 mt-1">
                            <Search className="h-3 w-3" />
                            Click to investigate
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Keyword Associates - Blue section */}
        {keywordAssociates.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-700">
                Your Input Keywords ({keywordAssociates.length})
              </span>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
              <div className="flex flex-wrap gap-2">
                {keywordAssociates.map((person, idx) => (
                  <TooltipProvider key={idx}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1">
                          <Badge 
                            variant="outline" 
                            className="bg-white border-blue-300 text-blue-800 hover:bg-blue-100 cursor-pointer transition-colors"
                          >
                            <Tag className="h-3 w-3 mr-1 text-blue-600" />
                            {person.name}
                          </Badge>
                          {onPivot && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 hover:bg-blue-100"
                              onClick={() => onPivot('name', person.name)}
                            >
                              <Search className="h-3 w-3 text-blue-600" />
                            </Button>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs space-y-1">
                          <p className="font-semibold">{person.name}</p>
                          <p className="text-muted-foreground">
                            You entered this as a search keyword/associate
                          </p>
                          <p className="text-primary flex items-center gap-1">
                            <Search className="h-3 w-3" />
                            Click search icon to investigate
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* AI-Suggested Persons - Purple section */}
        {aiSuggested.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-700">
                AI-Suggested Connections ({aiSuggested.length})
              </span>
              <HelpCircle className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-3">
              <div className="flex flex-wrap gap-2">
                {aiSuggested.map((person, idx) => (
                  <TooltipProvider key={idx}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1">
                          <Badge 
                            variant="outline" 
                            className="bg-white border-purple-300 text-purple-800 hover:bg-purple-100 cursor-pointer transition-colors"
                          >
                            <Sparkles className="h-3 w-3 mr-1 text-purple-600" />
                            {person.name}
                          </Badge>
                          {onPivot && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 hover:bg-purple-100"
                              onClick={() => onPivot('name', person.name)}
                            >
                              <Search className="h-3 w-3 text-purple-600" />
                            </Button>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs space-y-1">
                          <p className="font-semibold">{person.name}</p>
                          <p className="text-muted-foreground">
                            AI detected potential connection based on investigation patterns
                          </p>
                          <p className="text-purple-600">
                            Confidence: {Math.round((person.confidence || 0) * 100)}%
                          </p>
                          <p className="text-primary flex items-center gap-1 mt-1">
                            <Search className="h-3 w-3" />
                            Click search icon to investigate
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
              <p className="text-xs text-purple-600 mt-2 flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                AI-suggested persons require manual verification before use
              </p>
            </div>
          </div>
        )}

        {/* Expert tips section */}
        <div className="mt-4 pt-3 border-t border-dashed">
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium">💡 OSINT Analyst Tips:</p>
            <ul className="list-disc list-inside space-y-0.5 ml-1">
              <li><span className="text-green-600 font-medium">Confirmed</span>: High-confidence matches from people databases</li>
              <li><span className="text-orange-600 font-medium">Obituaries</span>: Names from memorial pages (verify relationship)</li>
              <li><span className="text-blue-600 font-medium">Keywords</span>: Search terms you provided</li>
              <li><span className="text-purple-600 font-medium">AI-Suggested</span>: Patterns detected by analysis</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default RelatedPersonsCard;