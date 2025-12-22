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
  
  // Extract confirmed relatives from people search findings
  const extractConfirmedRelatives = (): PersonCategory[] => {
    const confirmed: PersonCategory[] = [];
    
    findings.forEach(finding => {
      if (finding.agent_type === 'People_search' && finding.data?.results) {
        finding.data.results.forEach((result: any) => {
          if (result.relatives) {
            result.relatives.forEach((rel: any) => {
              const name = typeof rel === 'string' ? rel : rel.name;
              const relationship = typeof rel === 'object' ? rel.relationship : undefined;
              if (name && !confirmed.find(c => c.name.toLowerCase() === name.toLowerCase())) {
                confirmed.push({
                  name,
                  source: 'confirmed',
                  relationship,
                  confidence: finding.confidence_score || 0.7
                });
              }
            });
          }
        });
      }

      // Also check for names appearing together in breach data
      if (finding.agent_type === 'Breach' && finding.data?.sources) {
        finding.data.sources.forEach((src: any) => {
          if (src.first_name && src.last_name) {
            const fullName = `${src.first_name} ${src.last_name}`;
            if (!confirmed.find(c => c.name.toLowerCase() === fullName.toLowerCase())) {
              confirmed.push({
                name: fullName,
                source: 'confirmed',
                relationship: 'Co-occurs in breach data',
                confidence: 0.5
              });
            }
          }
        });
      }

      // Extract relatives discovered from web search (obituaries, news articles, etc.)
      if (finding.agent_type === 'Web' && finding.data?.discoveredRelatives) {
        finding.data.discoveredRelatives.forEach((rel: any) => {
          const name = typeof rel === 'string' ? rel : rel.name;
          const relationship = typeof rel === 'object' ? rel.relationship : 'Web search discovery';
          if (name && !confirmed.find(c => c.name.toLowerCase() === name.toLowerCase())) {
            confirmed.push({
              name,
              source: 'confirmed',
              relationship,
              confidence: finding.confidence_score || 0.65
            });
          }
        });
      }

      // Also check web search results text for mentioned relatives
      if (finding.agent_type === 'Web' && finding.data?.results) {
        finding.data.results.forEach((result: any) => {
          // Check if result has extracted relatives
          if (result.relatives) {
            result.relatives.forEach((rel: any) => {
              const name = typeof rel === 'string' ? rel : rel.name;
              const relationship = typeof rel === 'object' ? rel.relationship : 'Mentioned in web result';
              if (name && !confirmed.find(c => c.name.toLowerCase() === name.toLowerCase())) {
                confirmed.push({
                  name,
                  source: 'confirmed',
                  relationship,
                  confidence: result.confidence || 0.6
                });
              }
            });
          }
        });
      }
    });

    return confirmed;
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
  const keywordAssociates = processKeywordAssociates();
  const aiSuggested = processAISuggestions();

  const totalCount = confirmedRelatives.length + keywordAssociates.length + aiSuggested.length;

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
                <p>Found in data sources like people search databases</p>
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
              <li><span className="text-green-600 font-medium">Confirmed</span>: High-confidence matches from data sources</li>
              <li><span className="text-blue-600 font-medium">Keywords</span>: Search terms you provided (verify manually)</li>
              <li><span className="text-purple-600 font-medium">AI-Suggested</span>: Possible connections detected by pattern analysis</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default RelatedPersonsCard;