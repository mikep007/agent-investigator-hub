import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Clock, AlertCircle, Shield, Instagram, Facebook, Twitter, Github, Linkedin, Check, X, Sparkles, Mail, User, Globe, MapPin, Phone, Search, Copy, Info, RefreshCw, Scale, LayoutDashboard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ConfidenceScoreBadge from "./ConfidenceScoreBadge";
import PlatformLogo from "./PlatformLogo";
import InvestigativeAssistant from "./InvestigativeAssistant";
import AddressResults from "./AddressResults";
import BreachResults from "./BreachResults";
import { ResultsDisplay, FindingData } from "./results";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface InvestigationPanelProps {
  active: boolean;
  investigationId: string | null;
}

interface SearchData {
  fullName?: string;
  address?: string;
  email?: string;
  phone?: string;
  username?: string;
  keywords?: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  agent: string;
  message: string;
  status: "success" | "processing" | "pending";
  data?: any;
  agent_type?: string;
  source?: string;
  verification_status?: 'verified' | 'needs_review' | 'inaccurate';
  confidence_score?: number;
}

const InvestigationPanel = ({ active, investigationId }: InvestigationPanelProps) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [deepDiveDialog, setDeepDiveDialog] = useState<{ open: boolean; platform: string; findingId: string } | null>(null);
  const [deepDiveLoading, setDeepDiveLoading] = useState(false);
  const [deepDiveResults, setDeepDiveResults] = useState<any>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [searchData, setSearchData] = useState<SearchData | null>(null);
  const [failedAgents, setFailedAgents] = useState<string[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (!active || !investigationId) {
      setLogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const fetchFindings = async () => {
      const { data: findings, error } = await supabase
        .from('findings')
        .select('*')
        .eq('investigation_id', investigationId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching findings:', error);
        setLoading(false);
        return;
      }

      // Extract search data and failed agents from diagnostic finding
      const diagnosticFinding = findings?.find(f => f.agent_type === 'System');
      if (diagnosticFinding?.data) {
        const data = diagnosticFinding.data as any;
        if (data.searchSummary) {
          const summary = data.searchSummary;
          const failed = summary
            .filter((s: any) => s.status === 'error' || s.status === 'failed')
            .map((s: any) => s.type);
          setFailedAgents(failed);
        }
        
        // Extract original search parameters if available
        if (findings && findings.length > 0) {
          const firstFinding = findings.find(f => {
            const fData = f.data as any;
            return fData?.searchContext;
          });
          if (firstFinding) {
            const fData = firstFinding.data as any;
            if (fData?.searchContext) {
              setSearchData({
                fullName: fData.searchContext.fullName,
                email: fData.searchContext.hasEmail ? 'provided' : undefined,
                phone: fData.searchContext.hasPhone ? 'provided' : undefined,
                username: fData.searchContext.hasUsername ? 'provided' : undefined,
                address: fData.searchContext.hasAddress ? 'provided' : undefined,
                keywords: fData.searchContext.keywords?.join(', '),
              });
            }
          }
        }
      }

      if (findings) {
        setLoading(findings.length === 0);
        const formattedLogs: LogEntry[] = findings.map((finding) => {
          const data = finding.data as any;
          let message = '';
          let status: "success" | "processing" | "pending" = "success";

          if (finding.agent_type === 'Social' || finding.agent_type === 'Social_name') {
            const profiles = data.profiles || [];
            const found = profiles.filter((p: any) => p.exists);
            message = found.length > 0 
              ? `Found ${found.length} profile match${found.length > 1 ? 'es' : ''}`
              : 'No profiles found';
          } else if (finding.agent_type === 'Idcrawl') {
            const profiles = data.profiles || [];
            message = profiles.length > 0
              ? `Found ${profiles.length} social profile${profiles.length > 1 ? 's' : ''} via IDCrawl`
              : 'No profiles found on IDCrawl';
          } else if (finding.agent_type === 'Web') {
            const items = data.items || [];
            message = items.length > 0
              ? `Found ${items.length} web match${items.length > 1 ? 'es' : ''}`
              : data.error || 'No web results found';
          } else if (finding.agent_type === 'Email') {
            message = data.isValid 
              ? `Email verified`
              : 'Email not verified';
          } else if (finding.agent_type === 'Phone') {
            message = data.validity?.isValid
              ? `Phone number verified`
              : 'Phone number not verified';
          } else if (finding.agent_type === 'Username') {
            message = data.foundOn > 0
              ? `Found ${data.foundOn} username match${data.foundOn > 1 ? 'es' : ''}`
              : 'No username matches found';
          } else if (finding.agent_type === 'Address') {
            message = data.found
              ? `Found ${data.count} location match${data.count > 1 ? 'es' : ''}`
              : 'No locations found';
          } else if (finding.agent_type === 'Holehe') {
            message = data.accountsFound > 0
              ? `Email found on ${data.accountsFound} platform${data.accountsFound > 1 ? 's' : ''}`
              : 'No accounts found for this email';
          } else if (finding.agent_type === 'Sherlock') {
            message = data.foundPlatforms?.length > 0
              ? `Username found on ${data.foundPlatforms.length} platform${data.foundPlatforms.length > 1 ? 's' : ''}`
              : 'No accounts found for this username';
          } else if (finding.agent_type === 'People_search') {
            const results = data.results || [];
            const totalContacts = results.reduce((acc: number, r: any) => 
              acc + (r.phones?.length || 0) + (r.emails?.length || 0), 0
            );
            message = totalContacts > 0
              ? `Found ${totalContacts} contact detail${totalContacts > 1 ? 's' : ''} from public records`
              : 'No public records found';
          } else {
            message = finding.source;
          }

          return {
            id: finding.id,
            timestamp: finding.created_at,
            agent: finding.source,
            message,
            status,
            data,
            agent_type: finding.agent_type,
            verification_status: finding.verification_status as 'verified' | 'needs_review' | 'inaccurate',
            confidence_score: finding.confidence_score || undefined
          };
        });

        setLogs(formattedLogs);
      }
    };

    fetchFindings();

    // Polling fallback - check for new findings every 2 seconds for first 30 seconds
    let pollCount = 0;
    const maxPolls = 15;
    const pollInterval = setInterval(() => {
      pollCount++;
      fetchFindings();
      if (pollCount >= maxPolls) {
        clearInterval(pollInterval);
      }
    }, 2000);

    // Realtime subscription for ongoing updates
    const channel = supabase
      .channel(`findings-${investigationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'findings',
          filter: `investigation_id=eq.${investigationId}`,
        },
        () => {
          fetchFindings();
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [active, investigationId]);

  const updateVerificationStatus = async (findingId: string, status: 'verified' | 'needs_review' | 'inaccurate') => {
    try {
      const { error } = await supabase
        .from('findings')
        .update({ verification_status: status })
        .eq('id', findingId);

      if (error) throw error;

      setLogs(logs.map(log => 
        log.id === findingId 
          ? { ...log, verification_status: status }
          : log
      ));

      toast({
        title: "Status Updated",
        description: `Finding marked as ${status.replace('_', ' ')}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update verification status",
        variant: "destructive",
      });
    }
  };

  const updatePlatformVerification = async (
    findingId: string, 
    platformIdentifier: string, 
    status: 'verified' | 'inaccurate',
    platformType: 'sherlock' | 'holehe' | 'social'
  ) => {
    try {
      // Find the current log
      const log = logs.find(l => l.id === findingId);
      if (!log) return;

      const updatedData = { ...log.data };
      
      // Update the specific platform's verification status
      if (platformType === 'sherlock' && updatedData.foundPlatforms) {
        updatedData.foundPlatforms = updatedData.foundPlatforms.map((p: any) =>
          p.url === platformIdentifier ? { ...p, verificationStatus: status } : p
        );
      } else if (platformType === 'holehe' && updatedData.allResults) {
        updatedData.allResults = updatedData.allResults.map((r: any) =>
          r.domain === platformIdentifier ? { ...r, verificationStatus: status } : r
        );
      } else if (platformType === 'social' && updatedData.profiles) {
        updatedData.profiles = updatedData.profiles.map((p: any) =>
          p.url === platformIdentifier ? { ...p, verificationStatus: status } : p
        );
      }

      // Update in database
      const { error } = await supabase
        .from('findings')
        .update({ data: updatedData })
        .eq('id', findingId);

      if (error) throw error;

      // Update local state
      setLogs(logs.map(l => 
        l.id === findingId ? { ...l, data: updatedData } : l
      ));

      toast({
        title: "Platform verified",
        description: `Marked as ${status}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update verification",
        variant: "destructive",
      });
    }
  };

  const handleDeepDive = async (platform: string, findingId: string) => {
    setDeepDiveDialog({ open: true, platform, findingId });
    setDeepDiveLoading(true);
    setDeepDiveResults(null);

    try {
      const { data, error } = await supabase.functions.invoke('deep-platform-investigation', {
        body: {
          investigationId,
          findingId,
          platform
        }
      });

      if (error) throw error;

      setDeepDiveResults(data.results);
      toast({
        title: "Deep Dive Complete",
        description: `Analysis completed for ${platform}`,
      });
    } catch (error: any) {
      console.error('Deep dive error:', error);
      toast({
        title: "Deep Dive Failed",
        description: error.message || "Failed to perform deep investigation",
        variant: "destructive",
      });
    } finally {
      setDeepDiveLoading(false);
    }
  };

  const getVerificationBadge = (status?: 'verified' | 'needs_review' | 'inaccurate') => {
    switch (status) {
      case 'verified':
        return <Badge variant="default" className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/50">Verified</Badge>;
      case 'inaccurate':
        return <Badge variant="destructive" className="bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/50">Inaccurate</Badge>;
      case 'needs_review':
      default:
        return <Badge variant="outline" className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/50">Needs Review</Badge>;
    }
  };

  const getPlatformIcon = (platform: string) => {
    const platformLower = platform.toLowerCase();
    if (platformLower.includes('instagram')) return <Instagram className="h-4 w-4" />;
    if (platformLower.includes('facebook')) return <Facebook className="h-4 w-4" />;
    if (platformLower.includes('twitter') || platformLower.includes('x.com')) return <Twitter className="h-4 w-4" />;
    if (platformLower.includes('github')) return <Github className="h-4 w-4" />;
    if (platformLower.includes('linkedin')) return <Linkedin className="h-4 w-4" />;
    return <Shield className="h-4 w-4" />;
  };

  const handleRetryAgent = async (agentType: string) => {
    if (!investigationId || !searchData) {
      toast({
        title: "Cannot Retry",
        description: "Missing investigation data",
        variant: "destructive",
      });
      return;
    }

    setRetrying(agentType);

    try {
      const { data, error } = await supabase.functions.invoke('osint-retry-agent', {
        body: {
          investigationId,
          agentType,
          searchData
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Retry Successful",
          description: `${agentType} search completed successfully`,
        });
        setFailedAgents(failedAgents.filter(a => a !== agentType));
      } else {
        throw new Error(data?.error || 'Retry failed');
      }
    } catch (error: any) {
      console.error('Retry error:', error);
      toast({
        title: "Retry Failed",
        description: error.message || `Failed to retry ${agentType}`,
        variant: "destructive",
      });
    } finally {
      setRetrying(null);
    }
  };

  if (!active) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>No active investigation</p>
      </div>
    );
  }

  if (logs.length === 0 && loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center space-y-2">
          <Clock className="h-8 w-8 mx-auto animate-pulse" />
          <p>Running OSINT searches...</p>
          <p className="text-sm">This may take 10-20 seconds</p>
        </div>
      </div>
    );
  }

  // Filter logs based on search query
  const filterLogsBySearch = (logsToFilter: LogEntry[]) => {
    if (!searchQuery.trim()) return logsToFilter;
    
    const query = searchQuery.toLowerCase();
    return logsToFilter.filter(log => {
      // Search in agent type and message
      if (log.agent_type?.toLowerCase().includes(query) || log.message.toLowerCase().includes(query)) {
        return true;
      }
      
      // Search in web results
      if (log.data?.items) {
        return log.data.items.some((item: any) => 
          item.title?.toLowerCase().includes(query) ||
          item.snippet?.toLowerCase().includes(query) ||
          item.displayLink?.toLowerCase().includes(query)
        );
      }
      
      // Search in Sherlock platforms
      if (log.data?.foundPlatforms) {
        return log.data.foundPlatforms.some((platform: any) =>
          platform.name?.toLowerCase().includes(query) ||
          platform.url?.toLowerCase().includes(query)
        );
      }
      
      // Search in Holehe results
      if (log.data?.allResults) {
        return log.data.allResults.some((result: any) =>
          result.name?.toLowerCase().includes(query) ||
          result.domain?.toLowerCase().includes(query)
        );
      }
      
      // Search in social profiles
      if (log.data?.profiles) {
        return log.data.profiles.some((profile: any) =>
          profile.platform?.toLowerCase().includes(query) ||
          profile.url?.toLowerCase().includes(query)
        );
      }
      
      // Search in address data
      if (log.data?.location) {
        return log.data.location.formatted_address?.toLowerCase().includes(query);
      }
      
      return false;
    });
  };

  // Categorize logs - simplified for clarity
  const filteredLogs = filterLogsBySearch(logs);
  
  // DEBUG: Log all incoming findings
  console.log('=== INVESTIGATION PANEL DEBUG ===');
  console.log('Total logs received:', logs.length);
  console.log('Filtered logs:', filteredLogs.length);
  filteredLogs.forEach((log, i) => {
    console.log(`Log ${i}: agent_type="${log.agent_type}", source="${log.source}", hasData=${!!log.data}`);
    if (log.data) {
      console.log(`  Data keys:`, Object.keys(log.data));
      if (log.data.confirmedItems) console.log(`  confirmedItems: ${log.data.confirmedItems.length}`);
      if (log.data.possibleItems) console.log(`  possibleItems: ${log.data.possibleItems.length}`);
    }
  });
  
  // Web search results - catch all web-related agent types
  const webLogs = filteredLogs.filter(log => {
    const agentType = log.agent_type?.toLowerCase() || '';
    const source = log.source?.toLowerCase() || '';
    
    const isWeb = agentType === 'web' || 
           agentType.startsWith('web_') ||
           (agentType.includes('_search') && !agentType.includes('people')) ||
           source.includes('osint-web') || 
           source.includes('web_search') ||
           source.includes('address_owner') ||
           source.includes('address_residents');
    
    if (isWeb) {
      console.log(`  -> Categorized as WEB: agent_type="${log.agent_type}", source="${log.source}"`);
    }
    return isWeb;
  });
  
  console.log('Web logs count:', webLogs.length);
  
  // Account discovery - platforms where email/username was found registered
  const accountLogs = filteredLogs.filter(log => 
    log.agent_type === 'Holehe' || 
    log.agent_type === 'Sherlock' ||
    log.agent_type === 'Social' ||
    log.agent_type === 'Social_name' ||
    log.agent_type === 'Idcrawl'
  );
  
  // Address/location data
  const addressLogs = filteredLogs.filter(log => 
    log.agent_type === 'Address' ||
    (log.source && (
      log.source.includes('address_owner') || 
      log.source.includes('address_residents')
    ))
  );
  
  // People search - public records, phone/email lookups
  const peopleLogs = filteredLogs.filter(log => 
    log.agent_type === 'Email' || 
    log.agent_type === 'Phone' || 
    log.agent_type === 'People_search'
  );
  
  // Data breaches
  const breachLogs = filteredLogs.filter(log => log.agent_type?.toLowerCase().startsWith('leakcheck'));

  // Court records
  const courtLogs = filteredLogs.filter(log => log.agent_type === 'Court_records');

  // Relatives - extract from People_search results
  const relativesLogs = filteredLogs.filter(log => {
    if (log.agent_type !== 'People_search') return false;
    const results = log.data?.results || [];
    return results.some((r: any) => r.relatives && r.relatives.length > 0);
  });

  const renderWebResultItem = (item: any, log: LogEntry, idx: number | string) => (
    <div key={idx} className="group overflow-hidden">
      <div className="flex items-start gap-1">
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 text-sm mb-1 flex-wrap">
            <span className="text-muted-foreground truncate max-w-[200px]">{item.displayLink}</span>
            {item.confidenceScore !== undefined && (
              <ConfidenceScoreBadge score={item.confidenceScore} />
            )}
            {item.isExactMatch && item.hasLocation && (
              <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-white">
                <MapPin className="h-3 w-3 mr-1" />
                Location Match
              </Badge>
            )}
            {item.isExactMatch && !item.hasLocation && (
              <Badge variant="secondary" className="bg-blue-600/20 text-blue-400">
                <Check className="h-3 w-3 mr-1" />
                Name Match
              </Badge>
            )}
          </div>
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block group-hover:underline overflow-hidden"
          >
            <h3 className="text-xl text-primary mb-1 line-clamp-1 break-words">
              {item.title}
            </h3>
          </a>
          <p className="text-sm text-muted-foreground line-clamp-2 mb-2 break-words">
            {item.snippet}
          </p>
          <div className="flex gap-2 items-center flex-wrap">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant={log.verification_status === 'verified' ? 'default' : 'ghost'}
                  className="h-7 text-xs"
                  onClick={() => updateVerificationStatus(log.id, 'verified')}
                >
                  <Check className="h-3 w-3 mr-1" />
                  Verified
                </Button>
              </TooltipTrigger>
              <TooltipContent>Mark as verified</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant={log.verification_status === 'inaccurate' ? 'destructive' : 'ghost'}
                  className="h-7 text-xs"
                  onClick={() => updateVerificationStatus(log.id, 'inaccurate')}
                >
                  <X className="h-3 w-3 mr-1" />
                  Inaccurate
                </Button>
              </TooltipTrigger>
              <TooltipContent>Mark as inaccurate</TooltipContent>
            </Tooltip>
            {getVerificationBadge(log.verification_status)}
          </div>
        </div>
      </div>
    </div>
  );

  const renderWebResults = (filteredLogs: LogEntry[]) => (
    <>
      {filteredLogs.map((log) => {
        // Handle all web-related agent types
        const agentType = log.agent_type?.toLowerCase() || '';
        const source = log.source?.toLowerCase() || '';
        const isWebType = agentType === 'web' || 
                          agentType.startsWith('web_') ||
                          (agentType.includes('_search') && !agentType.includes('people')) ||
                          source.includes('osint-web') || 
                          source.includes('web_search') ||
                          source.includes('address_owner') ||
                          source.includes('address_residents');
        
        if (!isWebType) return null;
        
        const confirmedItems = log.data?.confirmedItems || [];
        const possibleItems = log.data?.possibleItems || [];
        const legacyItems = !log.data?.confirmedItems && log.data?.items ? log.data.items : [];
        
        const hasConfirmed = confirmedItems.length > 0;
        const hasPossible = possibleItems.length > 0;
        const hasLegacy = legacyItems.length > 0;
        
        if (!hasConfirmed && !hasPossible && !hasLegacy) return null;
        
        return (
          <div key={log.id} className="space-y-6 overflow-hidden">
            {/* Confirmed Results */}
            {hasConfirmed && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-green-500" />
                  <h3 className="text-base font-medium text-green-400">Confirmed Matches ({confirmedItems.length})</h3>
                </div>
                <div className="space-y-4">
                  {confirmedItems.map((item: any, idx: number) => renderWebResultItem(item, log, idx))}
                </div>
              </div>
            )}
            
            {/* Possible Results */}
            {hasPossible && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <AlertCircle className="h-5 w-5 text-yellow-500" />
                  <h3 className="text-base font-medium text-yellow-400">Possible Matches ({possibleItems.length})</h3>
                  <span className="text-xs text-muted-foreground">— Requires manual verification</span>
                </div>
                <div className="space-y-4 opacity-80">
                  {possibleItems.map((item: any, idx: number) => renderWebResultItem(item, log, `possible-${idx}`))}
                </div>
              </div>
            )}
            
            {/* Legacy results (for backward compatibility) */}
            {hasLegacy && (
              <div className="space-y-4">
                {legacyItems.map((item: any, idx: number) => renderWebResultItem(item, log, idx))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );

  const renderSocialResults = (filteredLogs: LogEntry[]) => (
    <>
      {filteredLogs.map((log) => {
        // Sherlock Results
        if (log.agent_type === 'Sherlock' && log.data?.foundPlatforms?.length > 0) {
          return (
            <div key={log.id} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-5 w-5 text-primary" />
                <h3 className="text-base font-medium">Username found on {log.data.foundPlatforms.length} platforms</h3>
              </div>
              {log.data.foundPlatforms.map((platform: any, idx: number) => (
                <div key={idx} className="group border border-border rounded-lg p-3 hover:border-primary/50 transition-colors">
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 mt-1">
                      {getPlatformIcon(platform.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-muted-foreground mb-1">{platform.name}</div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a
                            href={platform.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="block group-hover:underline"
                          >
                            <h3 className="text-xl text-primary line-clamp-1 mb-1">
                              Profile on {platform.name}
                            </h3>
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="flex items-start gap-2 max-w-xs">
                            <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                            <span>Click to open in new tab. Some platforms may require manual verification.</span>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                      <div className="flex items-center gap-2 mt-1 mb-2">
                        <p className="text-sm text-muted-foreground truncate flex-1">
                          {platform.url}
                        </p>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => {
                            navigator.clipboard.writeText(platform.url);
                            toast({ title: "Link copied to clipboard" });
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex gap-2 items-center">
                        <Button
                          size="sm"
                          variant={platform.verificationStatus === 'verified' ? 'default' : 'ghost'}
                          className="h-7 text-xs"
                          onClick={() => updatePlatformVerification(log.id, platform.url, 'verified', 'sherlock')}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Verified
                        </Button>
                        <Button
                          size="sm"
                          variant={platform.verificationStatus === 'inaccurate' ? 'destructive' : 'ghost'}
                          className="h-7 text-xs"
                          onClick={() => updatePlatformVerification(log.id, platform.url, 'inaccurate', 'sherlock')}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Inaccurate
                        </Button>
                        {platform.verificationStatus === 'verified' && (
                          <Badge variant="default" className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/50">
                            Verified
                          </Badge>
                        )}
                        {platform.verificationStatus === 'inaccurate' && (
                          <Badge variant="destructive" className="bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/50">
                            Inaccurate
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        }

        // Holehe Results
        if (log.agent_type === 'Holehe' && log.data?.accountsFound > 0) {
          return (
            <div key={log.id} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="h-5 w-5 text-primary" />
                <h3 className="text-base font-medium">Email found on {log.data.accountsFound} platforms</h3>
              </div>
              {log.data.allResults
                .filter((r: any) => r.exists)
                .map((result: any, idx: number) => (
                  <div key={idx} className="group border border-border rounded-lg p-3 hover:border-primary/50 transition-colors">
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 mt-1">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-muted-foreground mb-1">{result.domain}</div>
                        <h3 className="text-xl text-foreground mb-1">
                          {result.name}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-2">
                          Account registered on this platform
                        </p>
                        <div className="flex gap-2 items-center flex-wrap">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8"
                                onClick={() => handleDeepDive(result.name, log.id)}
                              >
                                <Sparkles className="h-3 w-3 mr-2" />
                                Deep Dive
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Investigate this account in detail</TooltipContent>
                          </Tooltip>
                          <Button
                            size="sm"
                            variant={result.verificationStatus === 'verified' ? 'default' : 'ghost'}
                            className="h-7 text-xs"
                            onClick={() => updatePlatformVerification(log.id, result.domain, 'verified', 'holehe')}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Verified
                          </Button>
                          <Button
                            size="sm"
                            variant={result.verificationStatus === 'inaccurate' ? 'destructive' : 'ghost'}
                            className="h-7 text-xs"
                            onClick={() => updatePlatformVerification(log.id, result.domain, 'inaccurate', 'holehe')}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Inaccurate
                          </Button>
                          {result.verificationStatus === 'verified' && (
                            <Badge variant="default" className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/50">
                              Verified
                            </Badge>
                          )}
                          {result.verificationStatus === 'inaccurate' && (
                            <Badge variant="destructive" className="bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/50">
                              Inaccurate
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          );
        }

        // Social Media Results
        if (log.agent_type === 'Social' && log.data?.profiles?.some((p: any) => p.exists)) {
          const foundProfiles = log.data.profiles.filter((p: any) => p.exists);
          return (
            <div key={log.id} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <User className="h-5 w-5 text-primary" />
                <h3 className="text-base font-medium">Social profiles found</h3>
              </div>
              {foundProfiles.map((profile: any, idx: number) => (
                <div key={idx} className="group border border-border rounded-lg p-3 hover:border-primary/50 transition-colors">
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 mt-1">
                      <PlatformLogo platform={profile.platform} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-muted-foreground mb-1">{profile.platform}</div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a
                            href={profile.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="block group-hover:underline"
                          >
                            <h3 className="text-xl text-primary line-clamp-1 mb-1">
                              {profile.name || `Profile on ${profile.platform}`}
                            </h3>
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="flex items-start gap-2 max-w-xs">
                            <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                            <span>Click to open in new tab. Some platforms may require manual verification.</span>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                      {profile.snippet && (
                        <p className="text-sm text-muted-foreground mb-1">{profile.snippet}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1 mb-2">
                        <p className="text-sm text-muted-foreground truncate flex-1">
                          {profile.url}
                        </p>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => {
                            navigator.clipboard.writeText(profile.url);
                            toast({ title: "Link copied to clipboard" });
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex gap-2 items-center">
                        <Button
                          size="sm"
                          variant={profile.verificationStatus === 'verified' ? 'default' : 'ghost'}
                          className="h-7 text-xs"
                          onClick={() => updatePlatformVerification(log.id, profile.url, 'verified', 'social')}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Verified
                        </Button>
                        <Button
                          size="sm"
                          variant={profile.verificationStatus === 'inaccurate' ? 'destructive' : 'ghost'}
                          className="h-7 text-xs"
                          onClick={() => updatePlatformVerification(log.id, profile.url, 'inaccurate', 'social')}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Inaccurate
                        </Button>
                        {profile.verificationStatus === 'verified' && (
                          <Badge variant="default" className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/50">
                            Verified
                          </Badge>
                        )}
                        {profile.verificationStatus === 'inaccurate' && (
                          <Badge variant="destructive" className="bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/50">
                            Inaccurate
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        }

        // IDCrawl Aggregator Results - Multiple Facebook, LinkedIn, TikTok profiles
        if (log.agent_type === 'Idcrawl' && log.data?.profiles?.length > 0) {
          const profiles = log.data.profiles;
          const images = log.data.images || [];
          return (
            <div key={log.id} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="h-5 w-5 text-primary" />
                <h3 className="text-base font-medium">
                  IDCrawl found {profiles.length} profile{profiles.length > 1 ? 's' : ''} 
                  {log.data.totalFound > 0 && ` (from ${log.data.totalFound} total matches)`}
                </h3>
              </div>
              
              {/* Display profile images if available */}
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {images.slice(0, 6).map((img: string, idx: number) => (
                    <img 
                      key={idx} 
                      src={img} 
                      alt={`Profile image ${idx + 1}`}
                      className="w-16 h-16 rounded-lg object-cover border border-border"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  ))}
                  {images.length > 6 && (
                    <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center text-sm text-muted-foreground">
                      +{images.length - 6}
                    </div>
                  )}
                </div>
              )}
              
              {profiles.map((profile: any, idx: number) => (
                <div key={idx} className="group border border-border rounded-lg p-3 hover:border-primary/50 transition-colors">
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 mt-1">
                      <PlatformLogo platform={profile.platform} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm text-muted-foreground">{profile.platform}</span>
                        {profile.snippet?.includes('[Keyword match]') && (
                          <Badge variant="secondary" className="text-xs">Keyword Match</Badge>
                        )}
                        {profile.snippet?.includes('[Location match]') && (
                          <Badge variant="secondary" className="text-xs">Location Match</Badge>
                        )}
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a
                            href={profile.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="block group-hover:underline"
                          >
                            <h3 className="text-xl text-primary line-clamp-1 mb-1">
                              {profile.name || `Profile on ${profile.platform}`}
                            </h3>
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="flex items-start gap-2 max-w-xs">
                            <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                            <span>Click to open in new tab. Verify this is the correct person.</span>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                      <div className="flex items-center gap-2 mt-1 mb-2">
                        <p className="text-sm text-muted-foreground truncate flex-1">
                          {profile.url}
                        </p>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => {
                            navigator.clipboard.writeText(profile.url);
                            toast({ title: "Link copied to clipboard" });
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex gap-2 items-center">
                        <Button
                          size="sm"
                          variant={profile.verificationStatus === 'verified' ? 'default' : 'ghost'}
                          className="h-7 text-xs"
                          onClick={() => updatePlatformVerification(log.id, profile.url, 'verified', 'social')}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Verified
                        </Button>
                        <Button
                          size="sm"
                          variant={profile.verificationStatus === 'inaccurate' ? 'destructive' : 'ghost'}
                          className="h-7 text-xs"
                          onClick={() => updatePlatformVerification(log.id, profile.url, 'inaccurate', 'social')}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Inaccurate
                        </Button>
                        {profile.verificationStatus === 'verified' && (
                          <Badge variant="default" className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/50">
                            Verified
                          </Badge>
                        )}
                        {profile.verificationStatus === 'inaccurate' && (
                          <Badge variant="destructive" className="bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/50">
                            Inaccurate
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        }

        return null;
      })}
    </>
  );

  const renderAddressResults = (filteredLogs: LogEntry[]) => (
    <>
      {filteredLogs.map((log) => {
        if (log.agent_type === 'Address' && log.data?.found) {
          return (
            <div key={log.id} className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="h-5 w-5 text-primary" />
                <h3 className="text-base font-medium">Address Information</h3>
              </div>
              
              <AddressResults 
                data={log.data} 
                confidenceScore={log.confidence_score} 
              />
            </div>
          );
        }
        return null;
      })}
    </>
  );

  const renderContactResults = (filteredLogs: LogEntry[]) => (
    <>
      {filteredLogs.map((log) => {
        if (log.agent_type === 'Email' || log.agent_type === 'Phone') {
          return (
            <div key={log.id} className="border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                {log.agent_type === 'Email' ? (
                  <Mail className="h-5 w-5 text-primary" />
                ) : (
                  <Phone className="h-5 w-5 text-primary" />
                )}
                <h4 className="font-medium">{log.message}</h4>
              </div>
              {log.confidence_score !== undefined && (
                <ConfidenceScoreBadge score={log.confidence_score} />
              )}
            </div>
          );
        }

        // People Search Results
        if (log.agent_type === 'People_search' && log.data?.results?.length > 0) {
          return (
            <div key={log.id} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <User className="h-5 w-5 text-primary" />
                <h3 className="text-base font-medium">Public Records Found</h3>
                {log.confidence_score !== undefined && (
                  <ConfidenceScoreBadge score={log.confidence_score} />
                )}
              </div>
              {log.data.results.map((result: any, idx: number) => (
                <div key={idx} className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-foreground">{result.name}</h4>
                    <Badge variant="outline" className="text-xs">{result.sources || result.source}</Badge>
                  </div>

                  {/* Phone Numbers */}
                  {result.phones && result.phones.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Phone className="h-4 w-4" />
                        Phone Numbers:
                      </div>
                      {result.phones.map((phone: any, pIdx: number) => {
                        const phoneValue = typeof phone === 'string' ? phone : phone.value;
                        const isVerified = typeof phone === 'object' && phone.verified;
                        return (
                          <div key={pIdx} className="pl-6 text-sm text-foreground flex items-center gap-2">
                            {phoneValue}
                            {isVerified && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">Cross-referenced across multiple sources</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Email Addresses */}
                  {result.emails && result.emails.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Mail className="h-4 w-4" />
                        Email Addresses:
                      </div>
                      {result.emails.map((email: any, eIdx: number) => {
                        const emailValue = typeof email === 'string' ? email : email.value;
                        const isVerified = typeof email === 'object' && email.verified;
                        return (
                          <div key={eIdx} className="pl-6 text-sm text-foreground flex items-center gap-2">
                            {emailValue}
                            {isVerified && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">Cross-referenced across multiple sources</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Physical Addresses */}
                  {result.addresses && result.addresses.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        Addresses:
                      </div>
                      {result.addresses.map((address: any, aIdx: number) => {
                        const addressValue = typeof address === 'string' ? address : address.value;
                        const isVerified = typeof address === 'object' && address.verified;
                        return (
                          <div key={aIdx} className="pl-6 text-sm text-foreground flex items-center gap-2">
                            {addressValue}
                            {isVerified && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">Cross-referenced across multiple sources</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Ages */}
                  {result.ages && result.ages.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <User className="h-4 w-4" />
                        Age:
                      </div>
                      <div className="pl-6 text-sm text-foreground flex items-center gap-2 flex-wrap">
                        {result.ages.map((age: any, aIdx: number) => {
                          const ageValue = typeof age === 'string' ? age : age.value;
                          const isVerified = typeof age === 'object' && age.verified;
                          return (
                            <span key={aIdx} className="flex items-center gap-1">
                              {ageValue}
                              {isVerified && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">Cross-referenced across multiple sources</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {aIdx < result.ages.length - 1 && <span className="mr-1">,</span>}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Relatives */}
                  {result.relatives && result.relatives.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <User className="h-4 w-4" />
                        Possible Relatives:
                      </div>
                      {result.relatives.map((relative: any, rIdx: number) => {
                        const relativeName = typeof relative === 'string' ? relative : relative.value;
                        const isVerified = typeof relative === 'object' && relative.verified;
                        return (
                          <div key={rIdx} className="pl-6 text-sm text-foreground flex items-center gap-2">
                            {relativeName}
                            {isVerified && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">Cross-referenced across multiple sources</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {result.note && (
                    <div className="text-xs text-muted-foreground italic pt-2 border-t">
                      {result.note}
                    </div>
                  )}
                </div>
              ))}
              
              {/* Manual Verification Links - Organized by Category */}
              {log.data?.manualVerificationUrls && log.data.manualVerificationUrls.length > 0 && (() => {
                const links = log.data.manualVerificationUrls;
                
                // Categorize links
                const categories: Record<string, { title: string; icon: string; links: any[] }> = {
                  people_search: { title: 'People Search', icon: 'user', links: [] },
                  relatives: { title: 'Relatives & Family', icon: 'users', links: [] },
                  background: { title: 'Background & Intelligence', icon: 'shield', links: [] },
                  social: { title: 'Social Media', icon: 'globe', links: [] },
                  public_records: { title: 'Public Records', icon: 'file', links: [] },
                  phone: { title: 'Phone Lookup', icon: 'phone', links: [] },
                  email: { title: 'Email Lookup', icon: 'mail', links: [] },
                  address: { title: 'Address Lookup', icon: 'map', links: [] },
                  property: { title: 'Property Records', icon: 'home', links: [] },
                  other: { title: 'Other Resources', icon: 'link', links: [] },
                };
                
                links.forEach((link: any) => {
                  const cat = link.category || 'other';
                  if (categories[cat]) {
                    categories[cat].links.push(link);
                  } else {
                    categories.other.links.push(link);
                  }
                });
                
                // Filter out empty categories
                const activeCategories = Object.entries(categories).filter(([_, cat]) => cat.links.length > 0);
                
                return (
                  <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-4 mt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Info className="h-4 w-4 text-amber-500" />
                      <h4 className="text-sm font-medium text-amber-600 dark:text-amber-400">
                        Additional Intelligence Sources
                      </h4>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                      {log.data?.note || 'Expand your investigation with these verified OSINT sources:'}
                    </p>
                    
                    <div className="space-y-4">
                      {activeCategories.map(([catKey, category]) => (
                        <div key={catKey}>
                          <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                            {catKey === 'relatives' && <User className="h-3 w-3" />}
                            {catKey === 'background' && <Shield className="h-3 w-3" />}
                            {catKey === 'phone' && <Phone className="h-3 w-3" />}
                            {catKey === 'email' && <Mail className="h-3 w-3" />}
                            {catKey === 'address' && <MapPin className="h-3 w-3" />}
                            {catKey === 'social' && <Globe className="h-3 w-3" />}
                            {(catKey === 'people_search' || catKey === 'public_records' || catKey === 'property' || catKey === 'other') && <User className="h-3 w-3" />}
                            {category.title}
                          </h5>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {category.links.map((link: any, lIdx: number) => (
                              <a
                                key={lIdx}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 p-2 rounded border border-border hover:bg-accent/50 transition-colors group"
                              >
                                <Globe className="h-4 w-4 text-primary flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">{link.name}</div>
                                  <div className="text-xs text-muted-foreground truncate">{link.description}</div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 flex-shrink-0"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    navigator.clipboard.writeText(link.url);
                                    toast({ title: "Link copied", description: "URL copied to clipboard" });
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </a>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        }
        
        return null;
      })}
    </>
  );


  return (
    <TooltipProvider>
      <div className="flex flex-col h-full -mx-6 -mt-6">
        {/* Search Bar */}
        <div className="px-6 pt-6 pb-3 border-b space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search results by keyword, platform, or URL..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          {searchQuery && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Found {filteredLogs.length} result{filteredLogs.length !== 1 ? 's' : ''}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchQuery("")}
                className="h-7 text-xs"
              >
                Clear
              </Button>
            </div>
          )}
        </div>

        {/* Failed Agents Alert */}
        {failedAgents.length > 0 && (
          <div className="px-6 py-3 bg-destructive/10 border-b">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <div className="text-sm font-medium text-destructive">
                  {failedAgents.length} search{failedAgents.length !== 1 ? 'es' : ''} failed
                </div>
                <div className="flex flex-wrap gap-2">
                  {failedAgents.map(agent => (
                    <Tooltip key={agent}>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => handleRetryAgent(agent)}
                          disabled={retrying === agent}
                        >
                          {retrying === agent ? (
                            <>
                              <Clock className="h-3 w-3 mr-1 animate-spin" />
                              Retrying...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Retry {agent}
                            </>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        Re-run this search
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <Tabs defaultValue="summary" className="flex-1 flex flex-col">
          <div className="px-6 pb-3 mb-4 border-b">
            <TabsList className="inline-flex h-auto w-full justify-start gap-2 bg-transparent p-0 flex-wrap">
               <TabsTrigger 
                 value="summary" 
                 className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-sm px-4 py-2.5 text-sm font-medium"
               >
                 <LayoutDashboard className="h-4 w-4 mr-2" />
                 Summary
               </TabsTrigger>
               <TabsTrigger 
                 value="all" 
                 className="data-[state=active]:bg-background rounded-sm px-4 py-2.5 text-sm font-medium"
               >
                 All
                 <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                   {filteredLogs.length}
                 </span>
               </TabsTrigger>
               <TabsTrigger 
                 value="web" 
                 className="data-[state=active]:bg-background rounded-sm px-4 py-2.5 text-sm font-medium"
               >
                 <Globe className="h-4 w-4 mr-2" />
                 Web
                 <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                   {webLogs.length}
                 </span>
               </TabsTrigger>
               <TabsTrigger 
                 value="accounts" 
                 className="data-[state=active]:bg-background rounded-sm px-4 py-2.5 text-sm font-medium"
               >
                 <User className="h-4 w-4 mr-2" />
                 Accounts
                 <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                   {accountLogs.length}
                 </span>
               </TabsTrigger>
               <TabsTrigger 
                 value="address" 
                 className="data-[state=active]:bg-background rounded-sm px-4 py-2.5 text-sm font-medium"
               >
                 <MapPin className="h-4 w-4 mr-2" />
                 Address
                 <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                   {addressLogs.length}
                 </span>
               </TabsTrigger>
               <TabsTrigger 
                 value="people" 
                 className="data-[state=active]:bg-background rounded-sm px-4 py-2.5 text-sm font-medium"
               >
                 <Mail className="h-4 w-4 mr-2" />
                 People
                 <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                   {peopleLogs.length}
                 </span>
               </TabsTrigger>
               <TabsTrigger 
                 value="breaches" 
                 className="data-[state=active]:bg-background rounded-sm px-4 py-2.5 text-sm font-medium"
               >
                 <Shield className="h-4 w-4 mr-2" />
                 Breaches
                 <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                   {breachLogs.length}
                 </span>
               </TabsTrigger>
               <TabsTrigger 
                 value="court" 
                 className="data-[state=active]:bg-background rounded-sm px-4 py-2.5 text-sm font-medium"
               >
                 <Scale className="h-4 w-4 mr-2" />
                 Court Records
                 <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                   {courtLogs.length}
                 </span>
               </TabsTrigger>
               <TabsTrigger 
                 value="relatives" 
                 className="data-[state=active]:bg-background rounded-sm px-4 py-2.5 text-sm font-medium"
               >
                 <User className="h-4 w-4 mr-2" />
                 Relatives
                 <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                   {relativesLogs.reduce((acc, log) => {
                     const results = log.data?.results || [];
                     return acc + results.reduce((sum: number, r: any) => sum + (r.relatives?.length || 0), 0);
                   }, 0)}
                 </span>
               </TabsTrigger>
             </TabsList>
           </div>

          {/* Summary View - 4 View Modes */}
          <TabsContent value="summary" className="flex-1 mt-0 px-6">
            <div className="h-[600px]">
              <ResultsDisplay
                findings={logs.map(log => ({
                  id: log.id,
                  agent_type: log.agent_type || '',
                  source: log.agent,
                  data: log.data,
                  confidence_score: log.confidence_score,
                  verification_status: log.verification_status,
                  created_at: log.timestamp,
                }))}
                targetName={searchData?.fullName}
                investigationId={investigationId || undefined}
                onVerifyPlatform={(url, status) => {
                  // Find the log that contains this platform
                  const log = logs.find(l => {
                    if (l.data?.foundPlatforms) {
                      return l.data.foundPlatforms.some((p: any) => p.url === url);
                    }
                    if (l.data?.allResults) {
                      return l.data.allResults.some((r: any) => `https://${r.domain}` === url);
                    }
                    return false;
                  });
                  if (log) {
                    const platformType = log.agent_type === 'Sherlock' ? 'sherlock' : 
                                        log.agent_type === 'Holehe' ? 'holehe' : 'social';
                    updatePlatformVerification(log.id, url, status, platformType);
                  }
                }}
                onDeepDive={handleDeepDive}
              />
            </div>
          </TabsContent>

          <TabsContent value="all" className="flex-1 mt-0 px-6">
            <ScrollArea className="h-[550px]">
              <div className="space-y-6 pb-4 pr-4">
                {/* AI Investigative Assistant */}
                {filteredLogs.length > 0 && !searchQuery && (
                  <InvestigativeAssistant findings={logs} />
                )}
                
                {filteredLogs.length > 0 ? (
                  <>
                    {renderWebResults(filteredLogs)}
                    {renderSocialResults(filteredLogs)}
                    {renderAddressResults(filteredLogs)}
                    {renderContactResults(filteredLogs)}
                  </>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    No results match your search
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>


          <TabsContent value="web" className="flex-1 mt-0 px-6">
            <ScrollArea className="h-[550px]">
              <div className="space-y-6 pb-4 pr-4">
                {webLogs.length > 0 ? renderWebResults(webLogs) : (
                  <div className="text-center text-muted-foreground py-8">
                    {searchQuery ? "No web results match your search" : "No web results found"}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="accounts" className="flex-1 mt-0 px-6">
            <ScrollArea className="h-[550px]">
              <div className="space-y-6 pb-4 pr-4">
                {accountLogs.length > 0 ? renderSocialResults(accountLogs) : (
                  <div className="text-center text-muted-foreground py-8">
                    {searchQuery ? "No account results match your search" : "No accounts found on platforms"}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="address" className="flex-1 mt-0 px-6">
            <ScrollArea className="h-[550px]">
              <div className="space-y-6 pb-4 pr-4">
                {addressLogs.length > 0 ? renderAddressResults(addressLogs) : (
                  <div className="text-center text-muted-foreground py-8">
                    {searchQuery ? "No address results match your search" : "No address results found"}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="people" className="flex-1 mt-0 px-6">
            <ScrollArea className="h-[550px]">
              <div className="space-y-6 pb-4 pr-4">
                {peopleLogs.length > 0 ? renderContactResults(peopleLogs) : (
                  <div className="text-center text-muted-foreground py-8">
                    {searchQuery ? "No people records match your search" : "No people records found"}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="breaches" className="flex-1 mt-0 px-6">
            <ScrollArea className="h-[550px]">
              <div className="space-y-6 pb-4 pr-4">
                {breachLogs.map((log) => (
                  <BreachResults key={log.id} data={log.data} />
                ))}
                {breachLogs.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No breach data available. Include an email address, phone number, or username in your search to check for data breaches.
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="court" className="flex-1 mt-0 px-6">
            <ScrollArea className="h-[550px]">
              <div className="space-y-6 pb-4 pr-4">
                {courtLogs.length > 0 ? (
                  courtLogs.map((log) => {
                    const data = log.data;
                    const criminal = data?.criminal || [];
                    const civil = data?.civil || [];
                    const traffic = data?.traffic || [];
                    const family = data?.family || [];
                    const other = data?.other || [];
                    const allResults = data?.allResults || [];

                    if (allResults.length === 0) {
                      return (
                        <div key={log.id} className="text-center text-muted-foreground py-4">
                          No court records found for this search.
                        </div>
                      );
                    }

                    const renderCourtResult = (result: any, idx: number) => (
                      <div key={idx} className="border border-border rounded-lg p-4 hover:border-primary/50 transition-colors">
                        <div className="flex items-start gap-3">
                          <Scale className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Badge variant={
                                result.recordType === 'criminal' ? 'destructive' :
                                result.recordType === 'civil' ? 'secondary' :
                                result.recordType === 'traffic' ? 'outline' :
                                result.recordType === 'family' ? 'default' : 'outline'
                              }>
                                {result.recordType?.charAt(0).toUpperCase() + result.recordType?.slice(1) || 'Unknown'}
                              </Badge>
                              {result.caseNumber && (
                                <span className="text-xs text-muted-foreground">
                                  Case #: {result.caseNumber}
                                </span>
                              )}
                              {result.filedDate && (
                                <span className="text-xs text-muted-foreground">
                                  Filed: {result.filedDate}
                                </span>
                              )}
                              {result.confidence && (
                                <ConfidenceScoreBadge score={result.confidence * 100} />
                              )}
                            </div>
                            <a
                              href={result.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block hover:underline"
                            >
                              <h3 className="text-lg text-primary mb-1 line-clamp-2">
                                {result.title}
                              </h3>
                            </a>
                            {result.snippet && (
                              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                                {result.snippet}
                              </p>
                            )}
                            {result.note && (
                              <p className="text-xs text-yellow-500 italic mb-2">
                                {result.note}
                              </p>
                            )}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>Source: {result.source}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2"
                                onClick={() => {
                                  navigator.clipboard.writeText(result.link);
                                  toast({ title: "Link copied to clipboard" });
                                }}
                              >
                                <Copy className="h-3 w-3 mr-1" />
                                Copy
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );

                    return (
                      <div key={log.id} className="space-y-6">
                        {/* Criminal Records */}
                        {criminal.length > 0 && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-5 w-5 text-red-500" />
                              <h3 className="text-base font-medium text-red-400">
                                Criminal Records ({criminal.length})
                              </h3>
                            </div>
                            {criminal.map((r: any, i: number) => renderCourtResult(r, i))}
                          </div>
                        )}

                        {/* Civil Records */}
                        {civil.length > 0 && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <Scale className="h-5 w-5 text-blue-500" />
                              <h3 className="text-base font-medium text-blue-400">
                                Civil Records ({civil.length})
                              </h3>
                            </div>
                            {civil.map((r: any, i: number) => renderCourtResult(r, i))}
                          </div>
                        )}

                        {/* Traffic Records */}
                        {traffic.length > 0 && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-5 w-5 text-yellow-500" />
                              <h3 className="text-base font-medium text-yellow-400">
                                Traffic Records ({traffic.length})
                              </h3>
                            </div>
                            {traffic.map((r: any, i: number) => renderCourtResult(r, i))}
                          </div>
                        )}

                        {/* Family Records */}
                        {family.length > 0 && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <User className="h-5 w-5 text-purple-500" />
                              <h3 className="text-base font-medium text-purple-400">
                                Family Records ({family.length})
                              </h3>
                            </div>
                            {family.map((r: any, i: number) => renderCourtResult(r, i))}
                          </div>
                        )}

                        {/* Other Records */}
                        {other.length > 0 && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <Globe className="h-5 w-5 text-muted-foreground" />
                              <h3 className="text-base font-medium text-muted-foreground">
                                Other Court Results ({other.length})
                              </h3>
                            </div>
                            {other.map((r: any, i: number) => renderCourtResult(r, i))}
                          </div>
                        )}

                        {/* Sources summary */}
                        {data?.sources && (
                          <div className="text-xs text-muted-foreground border-t pt-3">
                            Search sources: Google ({data.sources.google}), 
                            Court Aggregators ({data.sources.aggregators}), 
                            Court Portals ({data.sources.portals})
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    <Scale className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="mb-2">No court records found.</p>
                    <p className="text-sm">Include a full name in your search to check criminal and civil court records.</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="relatives" className="flex-1 mt-0 px-6">
            <ScrollArea className="h-[550px]">
              <div className="space-y-6 pb-4 pr-4">
                {relativesLogs.length > 0 ? (
                  relativesLogs.map((log) => {
                    const results = log.data?.results || [];
                    return results.map((result: any, resultIdx: number) => {
                      if (!result.relatives || result.relatives.length === 0) return null;
                      return (
                        <div key={`${log.id}-${resultIdx}`} className="border border-border rounded-lg p-4 space-y-4">
                          <div className="flex items-center gap-2 mb-3">
                            <User className="h-5 w-5 text-primary" />
                            <h3 className="text-base font-medium">
                              Relatives & Associates for {result.name}
                            </h3>
                            <Badge variant="secondary" className="ml-auto">
                              {result.relatives.length} found
                            </Badge>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {result.relatives.map((relative: any, rIdx: number) => {
                              const relativeName = typeof relative === 'string' ? relative : relative.value;
                              const isVerified = typeof relative === 'object' && relative.verified;
                              return (
                                <div 
                                  key={rIdx} 
                                  className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border/50"
                                >
                                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <User className="h-5 w-5 text-primary" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-foreground truncate">{relativeName}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {isVerified ? 'Verified across sources' : 'Possible relative/associate'}
                                    </p>
                                  </div>
                                  {isVerified && (
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="text-xs">Cross-referenced across multiple sources</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <p className="text-xs text-muted-foreground pt-2 border-t">
                            Source: {result.sources || log.source}
                          </p>
                        </div>
                      );
                    });
                  })
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    {searchQuery ? "No relatives match your search" : "No relatives or associates found. Include a name in your search to discover related persons."}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
          </Tabs>
        </div>

      {/* Deep Dive Dialog */}
      <Dialog open={deepDiveDialog?.open || false} onOpenChange={(open) => setDeepDiveDialog(deepDiveDialog ? { ...deepDiveDialog, open } : null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Deep Dive: {deepDiveDialog?.platform}</DialogTitle>
            <DialogDescription>
              Additional investigation results for this platform
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {deepDiveLoading ? (
              <div className="flex items-center justify-center py-8">
                <Clock className="h-8 w-8 animate-pulse text-primary" />
              </div>
            ) : deepDiveResults ? (
              <div className="space-y-4">
                <pre className="text-sm bg-muted p-4 rounded-lg overflow-auto max-h-96">
                  {JSON.stringify(deepDiveResults, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

export default InvestigationPanel;
