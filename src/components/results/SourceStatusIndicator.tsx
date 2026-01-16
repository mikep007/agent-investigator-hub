import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, 
  XCircle, 
  ShieldAlert, 
  AlertTriangle,
  Loader2,
  Globe
} from "lucide-react";
import { FindingData } from "./types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SourceStatusIndicatorProps {
  findings: FindingData[];
}

interface SourceStatus {
  name: string;
  status: 'success' | 'blocked' | 'error' | 'pending';
  captchaType?: string;
  resultsCount?: number;
  note?: string;
}

const SourceStatusIndicator = ({ findings }: SourceStatusIndicatorProps) => {
  // Extract source statuses from findings
  const getSourceStatuses = (): SourceStatus[] => {
    const statuses: SourceStatus[] = [];
    const seenSources = new Set<string>();

    findings.forEach(finding => {
      const data = finding.data;
      const agentType = finding.agent_type;

      // People Search results (TruePeopleSearch, FastPeopleSearch)
      if (agentType === 'People_search' || agentType === 'PeopleSearch' || agentType === 'People_search_phone') {
        // Check for blocked status in results
        if (data.results && Array.isArray(data.results)) {
          data.results.forEach((result: any) => {
            const sourceName = result.source || 'People Search';
            if (!seenSources.has(sourceName)) {
              seenSources.add(sourceName);
              if (result.blocked) {
                statuses.push({
                  name: sourceName,
                  status: 'blocked',
                  captchaType: result.captchaType || 'CAPTCHA',
                  note: result.note,
                });
              } else if (result.phones?.length || result.emails?.length || result.addresses?.length) {
                statuses.push({
                  name: sourceName,
                  status: 'success',
                  resultsCount: (result.phones?.length || 0) + (result.emails?.length || 0) + (result.addresses?.length || 0),
                });
              }
            }
          });
        }
        
        // Check for blocked indicators in note/success fields
        if (data.note && (data.note.includes('CAPTCHA') || data.note.includes('blocked'))) {
          if (!seenSources.has('TruePeopleSearch')) {
            seenSources.add('TruePeopleSearch');
            statuses.push({
              name: 'TruePeopleSearch',
              status: 'blocked',
              captchaType: 'CAPTCHA',
              note: 'Blocked by bot protection',
            });
          }
          if (!seenSources.has('FastPeopleSearch')) {
            seenSources.add('FastPeopleSearch');
            statuses.push({
              name: 'FastPeopleSearch',
              status: 'blocked',
              captchaType: 'HTTP Block',
              note: 'Connection refused - use manual links',
            });
          }
        }
        
        // Check merged results for blocked indicators
        if (data.merged) {
          const merged = data.merged;
          if (merged.blocked) {
            if (!seenSources.has('TruePeopleSearch')) {
              seenSources.add('TruePeopleSearch');
              statuses.push({
                name: 'TruePeopleSearch',
                status: 'blocked',
                captchaType: merged.captchaType || 'CAPTCHA',
              });
            }
            if (!seenSources.has('FastPeopleSearch')) {
              seenSources.add('FastPeopleSearch');
              statuses.push({
                name: 'FastPeopleSearch',
                status: 'blocked',
                captchaType: merged.captchaType || 'CAPTCHA',
              });
            }
          }
        }
        
        // If we have manualVerificationUrls, show as partial success with manual option
        if (data.manualVerificationUrls && !seenSources.has('People Search')) {
          seenSources.add('People Search');
          const hasResults = data.results?.some((r: any) => r.phones?.length || r.emails?.length);
          statuses.push({
            name: 'People Search',
            status: hasResults ? 'success' : 'blocked',
            note: hasResults ? undefined : 'Use manual verification links',
            resultsCount: hasResults ? data.results?.reduce((acc: number, r: any) => 
              acc + (r.phones?.length || 0) + (r.emails?.length || 0), 0) : undefined,
          });
        }
      }

      // Sherlock results
      if (agentType === 'Sherlock') {
        if (!seenSources.has('Sherlock')) {
          seenSources.add('Sherlock');
          if (data.error) {
            statuses.push({
              name: 'Sherlock',
              status: 'error',
              note: data.error,
            });
          } else {
            statuses.push({
              name: 'Sherlock',
              status: 'success',
              resultsCount: data.foundCount || data.foundPlatforms?.length || 0,
            });
          }
        }
      }

      // Holehe results
      if (agentType === 'Holehe') {
        if (!seenSources.has('Holehe')) {
          seenSources.add('Holehe');
          if (data.error) {
            statuses.push({
              name: 'Holehe',
              status: 'error',
              note: data.error,
            });
          } else {
            statuses.push({
              name: 'Holehe',
              status: 'success',
              resultsCount: data.allResults?.filter((r: any) => r.exists)?.length || 0,
            });
          }
        }
      }

      // Web search results
      if (agentType === 'WebSearch' || agentType === 'Web' || agentType === 'WebSearch_email' || agentType === 'WebSearch_phone') {
        const sourceName = 'Web Search';
        if (!seenSources.has(sourceName)) {
          seenSources.add(sourceName);
          if (data.error) {
            statuses.push({
              name: sourceName,
              status: 'error',
              note: data.error,
            });
          } else {
            statuses.push({
              name: sourceName,
              status: 'success',
              resultsCount: data.results?.length || data.confirmedResults?.length || 0,
            });
          }
        }
      }

      // LeakCheck/Breach results
      if (agentType === 'LeakCheck' || agentType === 'Breach') {
        if (!seenSources.has('LeakCheck')) {
          seenSources.add('LeakCheck');
          if (data.error) {
            statuses.push({
              name: 'LeakCheck',
              status: 'error',
              note: data.error,
            });
          } else {
            statuses.push({
              name: 'LeakCheck',
              status: 'success',
              resultsCount: data.breaches?.length || data.found || 0,
            });
          }
        }
      }

      // IDCrawl results
      if (agentType === 'Idcrawl') {
        if (!seenSources.has('IDCrawl')) {
          seenSources.add('IDCrawl');
          if (data.blocked) {
            statuses.push({
              name: 'IDCrawl',
              status: 'blocked',
              captchaType: 'CAPTCHA',
            });
          } else if (data.error) {
            statuses.push({
              name: 'IDCrawl',
              status: 'error',
              note: data.error,
            });
          } else {
            statuses.push({
              name: 'IDCrawl',
              status: 'success',
              resultsCount: data.profiles?.length || 0,
            });
          }
        }
      }

      // Social search
      if (agentType === 'Social' || agentType === 'Social_name') {
        const sourceName = 'Social Media';
        if (!seenSources.has(sourceName)) {
          seenSources.add(sourceName);
          if (data.error) {
            statuses.push({
              name: sourceName,
              status: 'error',
              note: data.error,
            });
          } else {
            statuses.push({
              name: sourceName,
              status: 'success',
              resultsCount: data.profiles?.filter((p: any) => p.exists)?.length || 0,
            });
          }
        }
      }

      // Court Records
      if (agentType === 'CourtRecords') {
        if (!seenSources.has('Court Records')) {
          seenSources.add('Court Records');
          if (data.blocked) {
            statuses.push({
              name: 'Court Records',
              status: 'blocked',
              captchaType: 'CAPTCHA',
            });
          } else if (data.error) {
            statuses.push({
              name: 'Court Records',
              status: 'error',
              note: data.error,
            });
          } else {
            statuses.push({
              name: 'Court Records',
              status: 'success',
              resultsCount: data.records?.length || 0,
            });
          }
        }
      }

      // Address search
      if (agentType === 'Address') {
        if (!seenSources.has('Address')) {
          seenSources.add('Address');
          if (data.error) {
            statuses.push({
              name: 'Address Lookup',
              status: 'error',
              note: data.error,
            });
          } else {
            statuses.push({
              name: 'Address Lookup',
              status: 'success',
              resultsCount: data.coordinates ? 1 : 0,
            });
          }
        }
      }

      // Power Automate Global Findings
      if (agentType === 'Power_automate') {
        if (!seenSources.has('Global Findings')) {
          seenSources.add('Global Findings');
          const powerData = data?.data || data;
          if (powerData?.status === 'pending' || powerData?.pending === true || data?.pending === true) {
            statuses.push({
              name: 'Global Findings',
              status: 'pending',
              note: 'Polling every 30 seconds...',
            });
          } else if (data.error || data.success === false) {
            statuses.push({
              name: 'Global Findings',
              status: 'error',
              note: data.error || 'Failed to retrieve data',
            });
          } else {
            const persons = powerData?.persons || [];
            const summary = powerData?.summary || {};
            const totalResults = (summary.totalEmails || 0) + (summary.totalPhones || 0) + 
                                 (summary.totalAddresses || 0) + (summary.totalSocialProfiles || 0);
            statuses.push({
              name: 'Global Findings',
              status: 'success',
              resultsCount: totalResults,
              note: persons.length > 0 ? `${persons.length} person(s) found` : undefined,
            });
          }
        }
      }
    });

    return statuses;
  };

  const statuses = getSourceStatuses();
  
  const successCount = statuses.filter(s => s.status === 'success').length;
  const blockedCount = statuses.filter(s => s.status === 'blocked').length;
  const errorCount = statuses.filter(s => s.status === 'error').length;
  const pendingCount = statuses.filter(s => s.status === 'pending').length;

  if (statuses.length === 0) {
    return null;
  }

  const getStatusIcon = (status: SourceStatus['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
      case 'blocked':
        return <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />;
      case 'error':
        return <XCircle className="h-3.5 w-3.5 text-red-500" />;
      case 'pending':
        return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />;
      default:
        return <Globe className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: SourceStatus['status']) => {
    switch (status) {
      case 'success':
        return 'bg-green-500/10 text-green-600 border-green-500/20 transition-all duration-500';
      case 'blocked':
        return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'error':
        return 'bg-red-500/10 text-red-600 border-red-500/20';
      case 'pending':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20 animate-pulse';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          Data Source Status
        </h4>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {successCount} Success
          </span>
          {blockedCount > 0 && (
            <span className="flex items-center gap-1 text-amber-600">
              <ShieldAlert className="h-3.5 w-3.5" />
              {blockedCount} CAPTCHA
            </span>
          )}
          {errorCount > 0 && (
            <span className="flex items-center gap-1 text-red-600">
              <XCircle className="h-3.5 w-3.5" />
              {errorCount} Failed
            </span>
          )}
          {pendingCount > 0 && (
            <span className="flex items-center gap-1 text-blue-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {pendingCount} Processing
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <TooltipProvider>
          {statuses.map((source, idx) => (
            <Tooltip key={idx}>
              <TooltipTrigger asChild>
                <Badge 
                  variant="outline" 
                  className={`flex items-center gap-1.5 py-1 px-2 cursor-default ${getStatusColor(source.status)}`}
                >
                  {getStatusIcon(source.status)}
                  <span className="font-normal">{source.name}</span>
                  {source.resultsCount !== undefined && source.status === 'success' && (
                    <span className="ml-1 bg-green-500/20 text-green-700 px-1.5 py-0.5 rounded text-[10px] font-medium">
                      {source.resultsCount}
                    </span>
                  )}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[250px]">
                <div className="text-xs space-y-1">
                  <div className="font-medium">{source.name}</div>
                  {source.status === 'success' && (
                    <div className="text-green-600">
                      Successfully scraped{source.resultsCount !== undefined ? ` • ${source.resultsCount} results` : ''}
                    </div>
                  )}
                  {source.status === 'blocked' && (
                    <div className="text-amber-600">
                      Blocked by {source.captchaType || 'CAPTCHA'} • Use manual verification links
                    </div>
                  )}
                  {source.status === 'error' && (
                    <div className="text-red-600">
                      {source.note || 'Request failed'}
                    </div>
                  )}
                  {source.status === 'pending' && (
                    <div className="text-muted-foreground">
                      {source.note || 'Results are being generated...'}
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </div>

      {blockedCount > 0 && (
        <div className="mt-3 flex items-start gap-2 p-2 bg-amber-500/5 border border-amber-500/20 rounded text-xs text-amber-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            {blockedCount} source{blockedCount > 1 ? 's' : ''} blocked by CAPTCHA. 
            Use the manual verification links below to access this data directly.
          </span>
        </div>
      )}
    </div>
  );
};

export default SourceStatusIndicator;
