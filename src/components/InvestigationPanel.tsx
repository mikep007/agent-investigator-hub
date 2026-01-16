import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Clock, AlertCircle, Shield, Instagram, Facebook, Twitter, Github, Linkedin, Check, X, Sparkles, Mail, User, Globe, MapPin, Phone, Search, Copy, Info, RefreshCw, Scale, LayoutDashboard, Camera, Link2, Eye, ExternalLink, Download, Video, FileDown, HelpCircle, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ConfidenceScoreBadge from "./ConfidenceScoreBadge";
import PlatformLogo from "./PlatformLogo";
import InvestigativeAssistant from "./InvestigativeAssistant";
import AddressResults from "./AddressResults";
import BreachResults from "./BreachResults";
import { ResultsDisplay, FindingData, GoogleSearchResults } from "./results";
import DeepDiveResultsCard from "./results/DeepDiveResultsCard";
import SelectorEnrichmentResults from "./results/SelectorEnrichmentResults";
import { exportWebResultsToCSV } from "@/utils/csvExport";
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
  onPivot?: (type: string, value: string) => void;
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

const InvestigationPanel = ({ active, investigationId, onPivot }: InvestigationPanelProps) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [webKeywordFilter, setWebKeywordFilter] = useState("");
  const [deepDiveDialog, setDeepDiveDialog] = useState<{ open: boolean; platform: string; findingId: string } | null>(null);
  const [deepDiveLoading, setDeepDiveLoading] = useState(false);
  const [deepDiveResults, setDeepDiveResults] = useState<any>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [searchData, setSearchData] = useState<SearchData | null>(null);
  const [failedAgents, setFailedAgents] = useState<string[]>([]);
  const [aiSuggestedPersons, setAiSuggestedPersons] = useState<string[]>([]);
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
          
          // Extract AI-suggested persons from analysis findings
          const analysisFinding = findings.find(f => f.agent_type === 'Analysis');
          if (analysisFinding) {
            const analysisData = analysisFinding.data as any;
            if (analysisData?.relatedPersons) {
              setAiSuggestedPersons(analysisData.relatedPersons);
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
          } else if (finding.agent_type === 'Toutatis' || finding.agent_type === 'Toutatis_from_email') {
            const dataPoints = data.dataPoints?.length || 0;
            const hasManualLinks = data.manualVerificationLinks?.length > 0;
            message = dataPoints > 0
              ? `Instagram: ${dataPoints} data point${dataPoints > 1 ? 's' : ''} extracted`
              : hasManualLinks 
                ? 'Instagram profile - anonymous viewers available'
                : 'Instagram profile lookup';
          } else if (finding.agent_type === 'Instaloader' || finding.agent_type === 'Instaloader_from_email') {
            const hasProfile = data.profileData?.success;
            const hasManualLinks = data.manualVerificationLinks?.length > 0;
            message = hasProfile
              ? `Instagram profile data downloaded`
              : hasManualLinks 
                ? 'Instagram profile - story viewers available'
                : 'Instagram profile lookup';
          } else if (finding.agent_type === 'Power_automate') {
            const personCount = data.personCount || data.data?.personCount || 0;
            const summary = data.summary || data.data?.summary || {};
            const totalData = (summary.totalEmails || 0) + (summary.totalPhones || 0) + (summary.totalAddresses || 0) + (summary.totalSocialProfiles || 0);
            if (data.status === 'pending') {
              message = 'Global Findings search in progress...';
            } else if (personCount > 0) {
              message = `Global Findings: ${personCount} person${personCount > 1 ? 's' : ''}, ${totalData} data point${totalData > 1 ? 's' : ''}`;
            } else {
              message = 'Global Findings: No results found';
            }
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
      
      // Search in Toutatis/Instagram data
      if (log.data?.extractedData || log.data?.manualVerificationLinks) {
        const extracted = log.data.extractedData || {};
        const manualLinks = log.data.manualVerificationLinks || [];
        return (
          extracted.username?.toLowerCase().includes(query) ||
          extracted.fullName?.toLowerCase().includes(query) ||
          extracted.biography?.toLowerCase().includes(query) ||
          log.data.username?.toLowerCase().includes(query) ||
          manualLinks.some((link: any) => link.name?.toLowerCase().includes(query))
        );
      }
      
      // Search in Instaloader profile data
      if (log.data?.profileData) {
        const profile = log.data.profileData;
        return (
          profile.username?.toLowerCase().includes(query) ||
          profile.fullName?.toLowerCase().includes(query) ||
          profile.biography?.toLowerCase().includes(query) ||
          log.data.username?.toLowerCase().includes(query)
        );
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
    log.agent_type === 'Sherlock_from_email' ||
    log.agent_type === 'Social' ||
    log.agent_type === 'Social_name' ||
    log.agent_type === 'Idcrawl' ||
    log.agent_type === 'Toutatis' ||
    log.agent_type === 'Toutatis_from_email' ||
    log.agent_type === 'Instaloader' ||
    log.agent_type === 'Instaloader_from_email' ||
    log.agent_type === 'Email_intelligence'
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
    log.agent_type === 'People_search' ||
    log.agent_type === 'Power_automate'
  );
  
  // Data breaches
  const breachLogs = filteredLogs.filter(log => log.agent_type?.toLowerCase().startsWith('leakcheck'));

  // Court records
  const courtLogs = filteredLogs.filter(log => log.agent_type === 'Court_records');

  // Username results (Sherlock-based)
  const usernameLogs = filteredLogs.filter(log => 
    log.agent_type === 'Sherlock' || 
    log.agent_type === 'Sherlock_from_email'
  );

  // Relatives - extract from People_search results
  const relativesLogs = filteredLogs.filter(log => {
    if (log.agent_type !== 'People_search') return false;
    const results = log.data?.results || [];
    return results.some((r: any) => r.relatives && r.relatives.length > 0);
  });

  // Selector Enrichment - 80+ platform real-time checks
  const enrichmentLogs = filteredLogs.filter(log => 
    log.agent_type === 'Selector_enrichment_email' || 
    log.agent_type === 'Selector_enrichment_phone'
  );

  // Transform enrichment logs into the format expected by SelectorEnrichmentResults
  const getEnrichmentData = () => {
    if (enrichmentLogs.length === 0) return null;
    
    // Combine all enrichment results
    const allResults: any[] = [];
    let selector = '';
    let selectorType: 'email' | 'phone' | 'unknown' = 'unknown';
    let timestamp = '';
    
    enrichmentLogs.forEach(log => {
      if (log.data?.results) {
        allResults.push(...log.data.results);
      }
      if (log.data?.selector) selector = log.data.selector;
      if (log.data?.selectorType) selectorType = log.data.selectorType;
      if (log.data?.timestamp) timestamp = log.data.timestamp;
    });
    
    if (allResults.length === 0) return null;
    
    const accountsFound = allResults.filter(r => r.exists).length;
    const errors = allResults.filter(r => r.error !== null).length;
    
    return {
      selector,
      selectorType,
      results: allResults,
      summary: {
        totalChecked: allResults.length,
        accountsFound,
        errors
      },
      timestamp: timestamp || new Date().toISOString()
    };
  };

  const renderWebResultItem = (item: any, log: LogEntry, idx: number | string) => (
    <div key={idx} className="group border-b border-border/50 pb-4 mb-4 last:border-0 last:pb-0 last:mb-0 hover:bg-muted/20 rounded-lg p-3 -mx-3 transition-colors">
      {/* Google-style result display */}
      <div className="space-y-1">
        {/* URL line with favicon-style indicator - now clickable */}
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm hover:text-primary transition-colors cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            window.open(item.link, '_blank', 'noopener,noreferrer');
          }}
        >
          <div className="w-5 h-5 rounded bg-muted flex items-center justify-center flex-shrink-0">
            <Globe className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <span className="text-muted-foreground truncate group-hover:text-primary transition-colors">{item.displayLink}</span>
          <span className="text-muted-foreground/60 text-xs">›</span>
          <span className="text-muted-foreground/60 text-xs truncate max-w-[150px]">
            {item.link?.replace(/^https?:\/\/[^/]+/, '').slice(0, 40) || ''}
          </span>
          <ExternalLink className="h-3 w-3 text-muted-foreground/40 group-hover:text-primary transition-colors ml-auto opacity-0 group-hover:opacity-100" />
        </a>
        
        {/* Title - clickable link with better styling */}
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="block hover:underline cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            window.open(item.link, '_blank', 'noopener,noreferrer');
          }}
        >
          <h3 className="text-lg text-primary font-medium line-clamp-2 hover:text-primary/80 transition-colors">
            {item.title || 'Untitled Result'}
          </h3>
        </a>
        
        {/* Snippet/Description */}
        <p className="text-sm text-muted-foreground line-clamp-2">
          {item.snippet}
        </p>
        
        {/* Match indicators */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          {item.confidenceScore !== undefined && (
            <ConfidenceScoreBadge score={item.confidenceScore <= 1 ? item.confidenceScore * 100 : item.confidenceScore} />
          )}
          {item.isExactMatch && (
            <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs">
              <Check className="h-3 w-3 mr-1" />
              Name Match
            </Badge>
          )}
          {item.hasLocation && (
            <Badge variant="secondary" className="bg-green-500/10 text-green-600 dark:text-green-400 text-xs">
              <MapPin className="h-3 w-3 mr-1" />
              Location
            </Badge>
          )}
          {item.hasKeywords && item.keywordMatches?.length > 0 && (
            <Badge variant="secondary" className="bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs">
              <Search className="h-3 w-3 mr-1" />
              {item.keywordMatches.join(', ')}
            </Badge>
          )}
          {item.hasPhone && (
            <Badge variant="secondary" className="bg-orange-500/10 text-orange-600 dark:text-orange-400 text-xs">
              <Phone className="h-3 w-3 mr-1" />
              Phone
            </Badge>
          )}
          {item.hasEmail && (
            <Badge variant="secondary" className="bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 text-xs">
              <Mail className="h-3 w-3 mr-1" />
              Email
            </Badge>
          )}
          {item.sourceType && (
            <span className="text-xs text-muted-foreground/60 italic">
              via {item.queryDescription || item.sourceType}
            </span>
          )}
        </div>
        
        {/* Action buttons */}
        <div className="flex gap-2 items-center pt-2 flex-wrap">
          <Button
            size="sm"
            variant="default"
            className="h-7 px-3 text-xs bg-primary hover:bg-primary/90"
            onClick={() => window.open(item.link, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Visit Page
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => {
              navigator.clipboard.writeText(item.link);
              toast({ title: "Link copied to clipboard" });
            }}
          >
            <Copy className="h-3 w-3 mr-1" />
            Copy Link
          </Button>
          <Button
            size="sm"
            variant={log.verification_status === 'verified' ? 'default' : 'ghost'}
            className="h-7 text-xs"
            onClick={() => updateVerificationStatus(log.id, 'verified')}
          >
            <Check className="h-3 w-3 mr-1" />
            Verified
          </Button>
          <Button
            size="sm"
            variant={log.verification_status === 'inaccurate' ? 'destructive' : 'ghost'}
            className="h-7 text-xs"
            onClick={() => updateVerificationStatus(log.id, 'inaccurate')}
          >
            <X className="h-3 w-3 mr-1" />
            Inaccurate
          </Button>
          {getVerificationBadge(log.verification_status)}
        </div>
      </div>
    </div>
  );

  // Collect all web results for export
  const collectWebResultsForExport = (filteredLogs: LogEntry[]) => {
    const allConfirmed: any[] = [];
    const allPossible: any[] = [];
    
    filteredLogs.forEach(log => {
      const agentType = log.agent_type?.toLowerCase() || '';
      const source = log.source?.toLowerCase() || '';
      const isWebType = agentType === 'web' || 
                        agentType.startsWith('web_') ||
                        (agentType.includes('_search') && !agentType.includes('people')) ||
                        source.includes('osint-web') || 
                        source.includes('web_search') ||
                        source.includes('address_owner') ||
                        source.includes('address_residents');
      
      if (!isWebType) return;
      
      const confirmedItems = log.data?.confirmedItems || [];
      const possibleItems = log.data?.possibleItems || [];
      const legacyItems = !log.data?.confirmedItems && log.data?.items ? log.data.items : [];
      
      allConfirmed.push(...confirmedItems);
      allPossible.push(...possibleItems, ...legacyItems);
    });
    
    return { allConfirmed, allPossible };
  };

  const handleExportWebResults = (filteredLogs: LogEntry[]) => {
    const { allConfirmed, allPossible } = collectWebResultsForExport(filteredLogs);
    const targetName = searchData?.fullName;
    exportWebResultsToCSV(allConfirmed, allPossible, targetName);
    toast({
      title: "Export Complete",
      description: `Exported ${allConfirmed.length + allPossible.length} web results to CSV`,
    });
  };

  // Filter web results by keyword
  const filterWebItemsByKeyword = (items: any[]) => {
    if (!webKeywordFilter.trim()) return items;
    const keyword = webKeywordFilter.toLowerCase();
    return items.filter((item: any) => 
      item.title?.toLowerCase().includes(keyword) ||
      item.snippet?.toLowerCase().includes(keyword) ||
      item.link?.toLowerCase().includes(keyword) ||
      item.displayLink?.toLowerCase().includes(keyword)
    );
  };

  const renderWebResults = (filteredLogs: LogEntry[]) => {
    const { allConfirmed, allPossible } = collectWebResultsForExport(filteredLogs);
    
    // Collect queries, keywords, and errors from all web logs
    let allQueriesUsed: { type: string; query: string; description: string }[] = [];
    let allKeywordsSearched: string[] = [];
    let webError: string | null = null;
    
    filteredLogs.forEach(log => {
      const agentType = log.agent_type?.toLowerCase() || '';
      const source = log.source?.toLowerCase() || '';
      const isWebType = agentType === 'web' || 
                        agentType.startsWith('web_') ||
                        (agentType.includes('_search') && !agentType.includes('people')) ||
                        source.includes('osint-web') || 
                        source.includes('web_search');
      
      if (isWebType) {
        const queriesUsed = log.data?.queriesUsed || [];
        const keywordsSearched = log.data?.searchInformation?.keywordsSearched || [];
        allQueriesUsed = [...allQueriesUsed, ...queriesUsed];
        allKeywordsSearched = [...new Set([...allKeywordsSearched, ...keywordsSearched])];
        
        // Check for error in web results
        if (log.data?.error && !webError) {
          webError = log.data.error;
        }
      }
    });

    return (
      <GoogleSearchResults
        confirmedResults={allConfirmed}
        possibleResults={allPossible}
        queriesUsed={allQueriesUsed}
        keywordsSearched={allKeywordsSearched}
        targetName={searchData?.fullName}
        error={webError}
      />
    );
  };

  const renderSocialResults = (filteredLogs: LogEntry[]) => (
    <>
      {filteredLogs.map((log) => {
        // Sherlock Results - handle both foundPlatforms and profileLinks formats
        // Using same 2-column grid layout as Holehe email results
        const sherlockPlatforms = log.data?.foundPlatforms || log.data?.profileLinks || [];
        if ((log.agent_type === 'Sherlock' || log.agent_type === 'Sherlock_from_email') && sherlockPlatforms.length > 0) {
          return (
            <div key={log.id} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <User className="h-5 w-5 text-primary" />
                <h3 className="text-base font-medium">
                  Username "{log.data.username}" found on {sherlockPlatforms.length} platforms
                </h3>
                <Badge variant="secondary" className="ml-auto text-xs">
                  @{log.data.username}
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sherlockPlatforms.map((platform: any, idx: number) => (
                  <div key={idx} className="group border border-border rounded-lg p-3 hover:border-primary/50 transition-colors bg-card">
                    <div className="flex items-start gap-3">
                      {/* Platform Logo/Avatar - matching Holehe style */}
                      <div className="flex-shrink-0">
                        {platform.profileImage ? (
                          <img 
                            src={platform.profileImage} 
                            alt={platform.name || platform.platform}
                            className="w-12 h-12 rounded-lg object-cover border border-border"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={`w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center overflow-hidden ${platform.profileImage ? 'hidden' : ''}`}>
                          <PlatformLogo platform={platform.name || platform.platform || 'unknown'} size="lg" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-base font-semibold text-foreground">
                            {platform.name || platform.platform}
                          </h4>
                          <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                        </div>
                        <p className="text-xs text-muted-foreground mb-2 truncate">
                          @{log.data.username} • {new URL(platform.url).hostname}
                        </p>
                        <div className="flex gap-2 items-center flex-wrap">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => handleDeepDive(platform.name || platform.platform, log.id)}
                              >
                                <Sparkles className="h-3 w-3 mr-1" />
                                Deep Dive
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Investigate this account in detail</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                onClick={() => window.open(platform.url, '_blank')}
                              >
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Open profile</TooltipContent>
                          </Tooltip>
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
                        </div>
                        {platform.verificationStatus && (
                          <div className="mt-2">
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
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        // Holehe Results - handle both allResults and registeredOn formats
        const holeheResults = log.data?.allResults || log.data?.registeredOn || [];
        const holeheFound = holeheResults.filter((r: any) => r.exists !== false);
        if (log.agent_type === 'Holehe' && holeheFound.length > 0) {
          return (
            <div key={log.id} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="h-5 w-5 text-primary" />
                <h3 className="text-base font-medium">Email found on {holeheFound.length} platforms</h3>
                <Badge variant="secondary" className="ml-auto text-xs">
                  {log.data?.email || 'Email lookup'}
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {holeheFound.map((result: any, idx: number) => (
                  <div key={idx} className="group border border-border rounded-lg p-3 hover:border-primary/50 transition-colors bg-card">
                    <div className="flex items-start gap-3">
                      {/* Platform Logo/Avatar */}
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center overflow-hidden">
                          <PlatformLogo platform={result.name || result.domain || 'unknown'} size="lg" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-base font-semibold text-foreground">
                            {result.name || result.domain}
                          </h4>
                          <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">
                          Account registered • {result.domain}
                        </p>
                        <div className="flex gap-2 items-center flex-wrap">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => handleDeepDive(result.name, log.id)}
                              >
                                <Sparkles className="h-3 w-3 mr-1" />
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
                        </div>
                        {result.verificationStatus && (
                          <div className="mt-2">
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
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        // Email Intelligence Results - Associated Emails (like OSINT Industries)
        if (log.agent_type === 'Email_intelligence' && log.data?.associatedEmails?.length > 0) {
          return (
            <div key={log.id} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="h-5 w-5 text-primary" />
                <h3 className="text-base font-medium">Associated Emails Found ({log.data.associatedEmails.length})</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                These email addresses were found linked to the target email through breach data and pattern analysis
              </p>
              {log.data.associatedEmails.map((assocEmail: any, idx: number) => (
                <div key={idx} className="group border border-border rounded-lg p-3 hover:border-primary/50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1">
                      {assocEmail.confidence === 'high' ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : assocEmail.confidence === 'medium' ? (
                        <AlertCircle className="h-5 w-5 text-yellow-500" />
                      ) : (
                        <HelpCircle className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-medium text-foreground">{assocEmail.email}</h3>
                        <Badge 
                          variant={assocEmail.confidence === 'high' ? 'default' : 'secondary'}
                          className={
                            assocEmail.confidence === 'high' 
                              ? 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/50' 
                              : assocEmail.confidence === 'medium'
                                ? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/50'
                                : ''
                          }
                        >
                          {assocEmail.confidence} confidence
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{assocEmail.source}</p>
                      {assocEmail.context && (
                        <p className="text-xs text-muted-foreground italic">{assocEmail.context}</p>
                      )}
                      <div className="flex gap-2 mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => {
                            navigator.clipboard.writeText(assocEmail.email);
                            toast({ title: 'Email copied to clipboard' });
                          }}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => window.open(`https://haveibeenpwned.com/account/${encodeURIComponent(assocEmail.email)}`, '_blank')}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Check Breaches
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Manual Verification Links */}
              {log.data.manualVerificationLinks?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Additional Verification Sources</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {log.data.manualVerificationLinks.slice(0, 6).map((link: any, idx: number) => (
                      <a
                        key={idx}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 rounded-md border border-border hover:border-primary/50 hover:bg-accent/50 transition-colors text-xs"
                      >
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        <span className="truncate">{link.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Breach Summary */}
              {log.data.breachSummary?.totalBreaches > 0 && (
                <div className="mt-4 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-4 w-4 text-destructive" />
                    <span className="text-sm font-medium">Breach Summary</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Found in {log.data.breachSummary.totalBreaches} breach{log.data.breachSummary.totalBreaches > 1 ? 'es' : ''}
                    {log.data.breachSummary.exposedFields?.length > 0 && (
                      <span> • Exposed fields: {log.data.breachSummary.exposedFields.slice(0, 5).join(', ')}</span>
                    )}
                  </p>
                </div>
              )}
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

        // Toutatis Instagram OSINT Results
        if ((log.agent_type === 'Toutatis' || log.agent_type === 'Toutatis_from_email') && log.data) {
          const extractedData = log.data.extractedData || {};
          const dataPoints = log.data.dataPoints || [];
          const manualLinks = log.data.manualVerificationLinks || [];
          
          return (
            <div key={log.id} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Camera className="h-5 w-5 text-pink-500" />
                <h3 className="text-base font-medium">Instagram Intelligence (Toutatis)</h3>
              </div>
              
              {/* Profile Data */}
              {extractedData.success && (
                <div className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-4">
                    {extractedData.profilePicUrl && (
                      <img 
                        src={extractedData.profilePicUrl} 
                        alt="Profile" 
                        className="w-20 h-20 rounded-full object-cover border-2 border-pink-500/50"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      {extractedData.fullName && (
                        <h4 className="text-lg font-semibold">{extractedData.fullName}</h4>
                      )}
                      <p className="text-sm text-muted-foreground">@{extractedData.username || log.data.username}</p>
                      {extractedData.isVerified && (
                        <Badge className="bg-blue-500/20 text-blue-600 mt-1">Verified Account</Badge>
                      )}
                    </div>
                  </div>
                  
                  {extractedData.biography && (
                    <p className="text-sm text-foreground/80 italic">"{extractedData.biography}"</p>
                  )}
                  
                  {/* Extracted Contact Info */}
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                    {(extractedData.email || extractedData.publicEmail) && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-4 w-4 text-green-500" />
                        <span>{extractedData.email || extractedData.publicEmail}</span>
                      </div>
                    )}
                    {(extractedData.phoneNumber || extractedData.contactPhoneNumber) && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-4 w-4 text-green-500" />
                        <span>{extractedData.phoneNumber || extractedData.contactPhoneNumber}</span>
                      </div>
                    )}
                    {extractedData.externalUrl && (
                      <div className="flex items-center gap-2 text-sm col-span-2">
                        <Link2 className="h-4 w-4 text-blue-500" />
                        <a href={extractedData.externalUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                          {extractedData.externalUrl}
                        </a>
                      </div>
                    )}
                  </div>
                  
                  {/* Stats */}
                  {(extractedData.followersCount || extractedData.postsCount) && (
                    <div className="flex gap-4 pt-2 border-t text-sm text-muted-foreground">
                      {extractedData.followersCount && <span>{extractedData.followersCount.toLocaleString()} followers</span>}
                      {extractedData.followingCount && <span>{extractedData.followingCount.toLocaleString()} following</span>}
                      {extractedData.postsCount && <span>{extractedData.postsCount.toLocaleString()} posts</span>}
                    </div>
                  )}
                </div>
              )}
              
              {/* Data Points Summary */}
              {dataPoints.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {dataPoints.map((point: string, idx: number) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      <CheckCircle2 className="h-3 w-3 mr-1 text-green-500" />
                      {point}
                    </Badge>
                  ))}
                </div>
              )}
              
              {/* Anonymous Instagram Viewers */}
              {manualLinks.length > 0 && (
                <div className="border border-pink-500/30 bg-pink-500/5 rounded-lg p-3">
                  <h5 className="text-sm font-medium text-pink-600 dark:text-pink-400 mb-2 flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Anonymous Instagram Viewers
                  </h5>
                  <p className="text-xs text-muted-foreground mb-3">View profile anonymously without logging in:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {manualLinks.map((link: any, idx: number) => (
                      <a
                        key={idx}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 rounded border border-border hover:bg-accent/50 transition-colors text-sm"
                      >
                        <Globe className="h-4 w-4 text-pink-500 flex-shrink-0" />
                        <span className="truncate">{link.name}</span>
                        <ExternalLink className="h-3 w-3 ml-auto flex-shrink-0 opacity-50" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        }

        // Instaloader Profile Download Results
        if ((log.agent_type === 'Instaloader' || log.agent_type === 'Instaloader_from_email') && log.data) {
          const profileData = log.data.profileData || {};
          const statistics = log.data.statistics || {};
          const manualLinks = log.data.manualVerificationLinks || [];
          
          return (
            <div key={log.id} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Download className="h-5 w-5 text-purple-500" />
                <h3 className="text-base font-medium">Instagram Profile Data (Instaloader)</h3>
              </div>
              
              {/* Profile Info */}
              {profileData.success && (
                <div className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-4">
                    {profileData.profilePicUrl && (
                      <img 
                        src={profileData.profilePicUrl} 
                        alt="Profile" 
                        className="w-20 h-20 rounded-full object-cover border-2 border-purple-500/50"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      {profileData.fullName && (
                        <h4 className="text-lg font-semibold">{profileData.fullName}</h4>
                      )}
                      <p className="text-sm text-muted-foreground">@{profileData.username || log.data.username}</p>
                      <div className="flex gap-2 mt-1">
                        {profileData.isVerified && (
                          <Badge className="bg-blue-500/20 text-blue-600">Verified</Badge>
                        )}
                        {profileData.isPrivate && (
                          <Badge variant="secondary">Private</Badge>
                        )}
                        {profileData.isBusiness && (
                          <Badge className="bg-amber-500/20 text-amber-600">Business</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {profileData.biography && (
                    <p className="text-sm text-foreground/80 italic">"{profileData.biography}"</p>
                  )}
                  
                  {profileData.externalUrl && (
                    <div className="flex items-center gap-2 text-sm">
                      <Link2 className="h-4 w-4 text-blue-500" />
                      <a href={profileData.externalUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                        {profileData.externalUrl}
                      </a>
                    </div>
                  )}
                </div>
              )}
              
              {/* Statistics */}
              {(statistics.postsDownloaded > 0 || statistics.geotagsFound > 0) && (
                <div className="flex flex-wrap gap-3 text-sm">
                  {statistics.postsDownloaded > 0 && (
                    <Badge variant="outline">
                      <Camera className="h-3 w-3 mr-1" />
                      {statistics.postsDownloaded} posts analyzed
                    </Badge>
                  )}
                  {statistics.geotagsFound > 0 && (
                    <Badge variant="outline" className="text-green-600">
                      <MapPin className="h-3 w-3 mr-1" />
                      {statistics.geotagsFound} locations found
                    </Badge>
                  )}
                </div>
              )}
              
              {/* Geotags */}
              {profileData.geotags && profileData.geotags.length > 0 && (
                <div className="border border-border rounded-lg p-3">
                  <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-green-500" />
                    Tagged Locations
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    {profileData.geotags.map((geo: any, idx: number) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {geo.name} ({geo.postCount} post{geo.postCount > 1 ? 's' : ''})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Recent Posts */}
              {profileData.recentPosts && profileData.recentPosts.length > 0 && (
                <div className="border border-border rounded-lg p-3">
                  <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Recent Activity
                  </h5>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {profileData.recentPosts.slice(0, 5).map((post: any, idx: number) => (
                      <a
                        key={idx}
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-2 rounded border border-border hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                          {post.isVideo ? <Video className="h-3 w-3" /> : <Camera className="h-3 w-3" />}
                          <span>{new Date(post.timestamp).toLocaleDateString()}</span>
                          {post.location && (
                            <>
                              <MapPin className="h-3 w-3 ml-2" />
                              <span>{post.location}</span>
                            </>
                          )}
                        </div>
                        {post.caption && (
                          <p className="text-sm line-clamp-2">{post.caption}</p>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Anonymous Instagram Viewers */}
              {manualLinks.length > 0 && (
                <div className="border border-purple-500/30 bg-purple-500/5 rounded-lg p-3">
                  <h5 className="text-sm font-medium text-purple-600 dark:text-purple-400 mb-2 flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Story & Profile Viewers
                  </h5>
                  <p className="text-xs text-muted-foreground mb-3">View stories and posts anonymously:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {manualLinks.map((link: any, idx: number) => (
                      <a
                        key={idx}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 rounded border border-border hover:bg-accent/50 transition-colors text-sm"
                      >
                        <Globe className="h-4 w-4 text-purple-500 flex-shrink-0" />
                        <span className="truncate">{link.name}</span>
                        <ExternalLink className="h-3 w-3 ml-auto flex-shrink-0 opacity-50" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
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

        // Power Automate Global Findings Results
        if (log.agent_type === 'Power_automate') {
          const powerData = log.data?.data || log.data;
          const persons = powerData?.persons || [];
          const summary = powerData?.summary || {};
          
          if (powerData?.status === 'pending') {
            return (
              <div key={log.id} className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-500 animate-pulse" />
                  <h4 className="font-medium text-amber-600 dark:text-amber-400">Global Findings - Processing</h4>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Your request has been submitted and is being processed. Results will appear once ready.
                </p>
              </div>
            );
          }
          
          if (persons.length === 0) {
            return (
              <div key={log.id} className="border border-border rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  <h4 className="font-medium">Global Findings</h4>
                </div>
                <p className="text-sm text-muted-foreground mt-2">No additional data found from this source.</p>
              </div>
            );
          }
          
          return (
            <div key={log.id} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-5 w-5 text-primary" />
                <h3 className="text-base font-medium">Global Findings</h3>
                <Badge variant="secondary" className="text-xs">
                  {persons.length} person{persons.length > 1 ? 's' : ''}
                </Badge>
                {summary.totalEmails > 0 && (
                  <Badge variant="outline" className="text-xs">
                    <Mail className="h-3 w-3 mr-1" />
                    {summary.totalEmails}
                  </Badge>
                )}
                {summary.totalPhones > 0 && (
                  <Badge variant="outline" className="text-xs">
                    <Phone className="h-3 w-3 mr-1" />
                    {summary.totalPhones}
                  </Badge>
                )}
                {summary.totalAddresses > 0 && (
                  <Badge variant="outline" className="text-xs">
                    <MapPin className="h-3 w-3 mr-1" />
                    {summary.totalAddresses}
                  </Badge>
                )}
              </div>
              
              {persons.map((person: any, idx: number) => (
                <div key={idx} className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-foreground">{person.full_name}</h4>
                      {person.age && (
                        <Badge variant="outline" className="text-xs">Age {person.age}</Badge>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-xs">Global Findings</Badge>
                  </div>

                  {/* Aliases */}
                  {person.aliases && person.aliases.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <User className="h-4 w-4" />
                        Also Known As:
                      </div>
                      <div className="pl-6 text-sm text-foreground flex flex-wrap gap-2">
                        {person.aliases.map((alias: string, aIdx: number) => (
                          <Badge key={aIdx} variant="outline" className="text-xs">{alias}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Emails */}
                  {person.emails && person.emails.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Mail className="h-4 w-4" />
                        Email Addresses ({person.emails.length}):
                      </div>
                      <div className="pl-6 grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {person.emails.slice(0, 10).map((emailObj: any, eIdx: number) => (
                          <div 
                            key={eIdx} 
                            className="text-sm text-foreground flex items-center gap-2 cursor-pointer hover:text-primary transition-colors"
                            onClick={() => onPivot?.('email', emailObj.email)}
                          >
                            <span className="truncate">{emailObj.email}</span>
                            {emailObj.confidence && (
                              <span className="text-xs text-muted-foreground">({emailObj.confidence}%)</span>
                            )}
                          </div>
                        ))}
                        {person.emails.length > 10 && (
                          <div className="text-xs text-muted-foreground">
                            +{person.emails.length - 10} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Phone Numbers */}
                  {person.phones && person.phones.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Phone className="h-4 w-4" />
                        Phone Numbers ({person.phones.length}):
                      </div>
                      <div className="pl-6 grid grid-cols-2 sm:grid-cols-3 gap-1">
                        {person.phones.slice(0, 6).map((phoneObj: any, pIdx: number) => (
                          <div 
                            key={pIdx} 
                            className="text-sm text-foreground flex items-center gap-2 cursor-pointer hover:text-primary transition-colors"
                            onClick={() => onPivot?.('phone', phoneObj.phone)}
                          >
                            {phoneObj.phone}
                          </div>
                        ))}
                        {person.phones.length > 6 && (
                          <div className="text-xs text-muted-foreground">
                            +{person.phones.length - 6} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Addresses */}
                  {person.addresses && person.addresses.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        Addresses ({person.addresses.length}):
                      </div>
                      <div className="pl-6 space-y-1">
                        {person.addresses.slice(0, 4).map((addr: any, aIdx: number) => (
                          <div 
                            key={aIdx} 
                            className="text-sm text-foreground cursor-pointer hover:text-primary transition-colors"
                            onClick={() => onPivot?.('address', addr.full || `${addr.street}, ${addr.city}, ${addr.state} ${addr.zip}`)}
                          >
                            {addr.full || `${addr.street}, ${addr.city}, ${addr.state} ${addr.zip}`}
                          </div>
                        ))}
                        {person.addresses.length > 4 && (
                          <div className="text-xs text-muted-foreground">
                            +{person.addresses.length - 4} more addresses
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Social Profiles */}
                  {person.socialProfiles && person.socialProfiles.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Globe className="h-4 w-4" />
                        Social Profiles ({person.socialProfiles.length}):
                      </div>
                      <div className="pl-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {person.socialProfiles.map((profile: any, sIdx: number) => (
                          <a
                            key={sIdx}
                            href={profile.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-2 rounded border border-border hover:bg-accent/50 transition-colors group"
                          >
                            {profile.pictureUrl ? (
                              <img 
                                src={profile.pictureUrl} 
                                alt="" 
                                className="w-8 h-8 rounded-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                <User className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                {profile.name || profile.username || 'Profile'}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {profile.url}
                              </div>
                            </div>
                            <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
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

        <Tabs defaultValue="summary" className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 pb-2 mb-3 border-b overflow-x-auto scrollbar-thin">
            <TabsList className="inline-flex h-9 w-max gap-0.5 bg-muted/50 p-1 rounded-lg">
                <TabsTrigger 
                  value="summary" 
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
                >
                  <LayoutDashboard className="h-3.5 w-3.5 mr-1.5" />
                  Summary
                </TabsTrigger>
                <TabsTrigger 
                  value="all" 
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
                >
                  All
                  <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">{filteredLogs.length}</Badge>
                </TabsTrigger>
                <TabsTrigger 
                  value="web" 
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
                >
                  <Globe className="h-3.5 w-3.5 mr-1.5" />
                  Web
                  <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">{webLogs.length}</Badge>
                </TabsTrigger>
                <TabsTrigger 
                  value="accounts" 
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
                >
                  <User className="h-3.5 w-3.5 mr-1.5" />
                  Accounts
                  <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">{accountLogs.length}</Badge>
                </TabsTrigger>
                <TabsTrigger 
                  value="address" 
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
                >
                  <MapPin className="h-3.5 w-3.5 mr-1.5" />
                  Address
                  <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">{addressLogs.length}</Badge>
                </TabsTrigger>
                <TabsTrigger 
                  value="people" 
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
                >
                  <Mail className="h-3.5 w-3.5 mr-1.5" />
                  People
                  <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">{peopleLogs.length}</Badge>
                </TabsTrigger>
                <TabsTrigger 
                  value="breaches" 
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
                >
                  <Shield className="h-3.5 w-3.5 mr-1.5" />
                  Breaches
                  <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">{breachLogs.length}</Badge>
                </TabsTrigger>
                <TabsTrigger 
                  value="court" 
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
                >
                  <Scale className="h-3.5 w-3.5 mr-1.5" />
                  Court
                  <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">{courtLogs.length}</Badge>
                </TabsTrigger>
                <TabsTrigger 
                  value="usernames" 
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
                >
                  <User className="h-3.5 w-3.5 mr-1.5" />
                  Usernames
                  <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
                    {usernameLogs.reduce((acc, log) => {
                      const platforms = log.data?.profileLinks || log.data?.foundPlatforms || [];
                      return acc + platforms.length;
                    }, 0)}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger 
                  value="relatives" 
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
                >
                  <User className="h-3.5 w-3.5 mr-1.5" />
                  Relatives
                  <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
                    {relativesLogs.reduce((acc, log) => {
                      const results = log.data?.results || [];
                      return acc + results.reduce((sum: number, r: any) => sum + (r.relatives?.length || 0), 0);
                    }, 0)}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger 
                  value="enrichment" 
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
                >
                  <Zap className="h-3.5 w-3.5 mr-1.5" />
                  Enrichment
                  <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
                    {enrichmentLogs.reduce((acc, log) => {
                      const found = log.data?.summary?.accountsFound || 0;
                      return acc + found;
                    }, 0)}
                  </Badge>
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
                inputKeywords={searchData?.keywords?.split(',').map(k => k.trim()).filter(Boolean) || []}
                aiSuggestedPersons={aiSuggestedPersons}
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
                onPivot={onPivot}
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
                  <div className="space-y-8">
                    {/* Web Results Section */}
                    {webLogs.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 border-b border-border pb-2 sticky top-0 bg-background z-10">
                          <Globe className="h-5 w-5 text-blue-500" />
                          <h3 className="text-lg font-semibold">Web Results</h3>
                          <Badge variant="secondary" className="ml-auto">{webLogs.length} sources</Badge>
                        </div>
                        {renderWebResults(webLogs)}
                      </div>
                    )}
                    
                    {/* Email Account Discovery Section */}
                    {(() => {
                      const emailAccountLogs = filteredLogs.filter(log => 
                        log.agent_type === 'Holehe' || log.agent_type === 'Email_intelligence'
                      );
                      if (emailAccountLogs.length === 0) return null;
                      return (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 border-b border-border pb-2 sticky top-0 bg-background z-10">
                            <Mail className="h-5 w-5 text-cyan-500" />
                            <h3 className="text-lg font-semibold">Email Account Discovery</h3>
                            <Badge variant="secondary" className="ml-auto">
                              {emailAccountLogs.reduce((acc, log) => acc + (log.data?.accountsFound || 0), 0)} accounts
                            </Badge>
                          </div>
                          {renderSocialResults(emailAccountLogs)}
                        </div>
                      );
                    })()}
                    
                    {/* Username Discovery Section */}
                    {(() => {
                      const usernameAccountLogs = filteredLogs.filter(log => 
                        log.agent_type === 'Sherlock' || log.agent_type === 'Sherlock_from_email'
                      );
                      if (usernameAccountLogs.length === 0) return null;
                      return (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 border-b border-border pb-2 sticky top-0 bg-background z-10">
                            <User className="h-5 w-5 text-purple-500" />
                            <h3 className="text-lg font-semibold">Username Discovery</h3>
                            <Badge variant="secondary" className="ml-auto">
                              {usernameAccountLogs.reduce((acc, log) => {
                                const platforms = log.data?.profileLinks || log.data?.foundPlatforms || [];
                                return acc + platforms.length;
                              }, 0)} platforms
                            </Badge>
                          </div>
                          {renderSocialResults(usernameAccountLogs)}
                        </div>
                      );
                    })()}
                    
                    {/* Social Profiles Section */}
                    {(() => {
                      const socialProfileLogs = filteredLogs.filter(log => 
                        log.agent_type === 'Social' || log.agent_type === 'Social_name' || 
                        log.agent_type === 'Idcrawl' || log.agent_type === 'Toutatis' ||
                        log.agent_type === 'Toutatis_from_email' || log.agent_type === 'Instaloader' ||
                        log.agent_type === 'Instaloader_from_email'
                      );
                      if (socialProfileLogs.length === 0) return null;
                      return (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 border-b border-border pb-2 sticky top-0 bg-background z-10">
                            <Instagram className="h-5 w-5 text-pink-500" />
                            <h3 className="text-lg font-semibold">Social Profiles</h3>
                            <Badge variant="secondary" className="ml-auto">{socialProfileLogs.length} sources</Badge>
                          </div>
                          {renderSocialResults(socialProfileLogs)}
                        </div>
                      );
                    })()}
                    
                    {/* Address Results Section */}
                    {addressLogs.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 border-b border-border pb-2 sticky top-0 bg-background z-10">
                          <MapPin className="h-5 w-5 text-green-500" />
                          <h3 className="text-lg font-semibold">Address & Location</h3>
                          <Badge variant="secondary" className="ml-auto">{addressLogs.length} results</Badge>
                        </div>
                        {renderAddressResults(addressLogs)}
                      </div>
                    )}
                    
                    {/* Contact/People Records Section */}
                    {peopleLogs.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 border-b border-border pb-2 sticky top-0 bg-background z-10">
                          <User className="h-5 w-5 text-orange-500" />
                          <h3 className="text-lg font-semibold">People Records</h3>
                          <Badge variant="secondary" className="ml-auto">{peopleLogs.length} sources</Badge>
                        </div>
                        {renderContactResults(peopleLogs)}
                      </div>
                    )}
                  </div>
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
                {breachLogs.length > 0 ? (
                  <>
                    {/* Organize breaches by search type */}
                    {(() => {
                      const emailBreaches = breachLogs.filter(log => 
                        log.agent_type === 'Leakcheck' && log.data?.type === 'email'
                      );
                      const usernameBreaches = breachLogs.filter(log => 
                        log.agent_type === 'Leakcheck_username' || log.data?.type === 'login' || log.data?.type === 'username'
                      );
                      const phoneBreaches = breachLogs.filter(log => 
                        log.agent_type === 'Leakcheck_phone' || log.data?.type === 'phone'
                      );
                      
                      const totalBreaches = breachLogs.reduce((sum, log) => sum + (log.data?.found || 0), 0);
                      
                      return (
                        <>
                          {/* Summary Header */}
                          <div className="bg-card border border-border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="text-lg font-semibold flex items-center gap-2">
                                <Shield className="h-5 w-5 text-primary" />
                                Breach Intelligence Summary
                              </h3>
                              <Badge 
                                variant={totalBreaches > 0 ? "destructive" : "secondary"}
                                className="text-sm px-3 py-1"
                              >
                                {totalBreaches} Total Breaches Found
                              </Badge>
                            </div>
                            
                            {/* Quick Stats */}
                            <div className="grid grid-cols-3 gap-4">
                              <div className="text-center p-3 bg-muted/50 rounded-lg border">
                                <Mail className="h-5 w-5 mx-auto mb-1 text-blue-500" />
                                <p className="text-2xl font-bold">{emailBreaches.reduce((sum, log) => sum + (log.data?.found || 0), 0)}</p>
                                <p className="text-xs text-muted-foreground">Email Breaches</p>
                              </div>
                              <div className="text-center p-3 bg-muted/50 rounded-lg border">
                                <User className="h-5 w-5 mx-auto mb-1 text-purple-500" />
                                <p className="text-2xl font-bold">{usernameBreaches.reduce((sum, log) => sum + (log.data?.found || 0), 0)}</p>
                                <p className="text-xs text-muted-foreground">Username Breaches</p>
                              </div>
                              <div className="text-center p-3 bg-muted/50 rounded-lg border">
                                <Phone className="h-5 w-5 mx-auto mb-1 text-green-500" />
                                <p className="text-2xl font-bold">{phoneBreaches.reduce((sum, log) => sum + (log.data?.found || 0), 0)}</p>
                                <p className="text-xs text-muted-foreground">Phone Breaches</p>
                              </div>
                            </div>
                          </div>
                          
                          {/* Email Breaches Section */}
                          {emailBreaches.length > 0 && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 border-b pb-2">
                                <Mail className="h-4 w-4 text-blue-500" />
                                <h4 className="text-base font-medium">Email Address Breaches</h4>
                                <Badge variant="outline" className="ml-auto">
                                  {emailBreaches.length} search{emailBreaches.length > 1 ? 'es' : ''}
                                </Badge>
                              </div>
                              {emailBreaches.map((log) => (
                                <BreachResults key={log.id} data={log.data} />
                              ))}
                            </div>
                          )}
                          
                          {/* Username Breaches Section */}
                          {usernameBreaches.length > 0 && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 border-b pb-2">
                                <User className="h-4 w-4 text-purple-500" />
                                <h4 className="text-base font-medium">Username Breaches</h4>
                                <Badge variant="outline" className="ml-auto">
                                  {usernameBreaches.length} search{usernameBreaches.length > 1 ? 'es' : ''}
                                </Badge>
                              </div>
                              {usernameBreaches.map((log) => (
                                <BreachResults key={log.id} data={log.data} />
                              ))}
                            </div>
                          )}
                          
                          {/* Phone Breaches Section */}
                          {phoneBreaches.length > 0 && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 border-b pb-2">
                                <Phone className="h-4 w-4 text-green-500" />
                                <h4 className="text-base font-medium">Phone Number Breaches</h4>
                                <Badge variant="outline" className="ml-auto">
                                  {phoneBreaches.length} search{phoneBreaches.length > 1 ? 'es' : ''}
                                </Badge>
                              </div>
                              {phoneBreaches.map((log) => (
                                <BreachResults key={log.id} data={log.data} />
                              ))}
                            </div>
                          )}
                          
                          {/* No categorized breaches - show all */}
                          {emailBreaches.length === 0 && usernameBreaches.length === 0 && phoneBreaches.length === 0 && (
                            breachLogs.map((log) => (
                              <BreachResults key={log.id} data={log.data} />
                            ))
                          )}
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="mb-2">No breach data available.</p>
                    <p className="text-sm">Include an email address, phone number, or username in your search to check for data breaches.</p>
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

          <TabsContent value="usernames" className="flex-1 mt-0 px-6">
            <ScrollArea className="h-[550px]">
              <div className="space-y-6 pb-4 pr-4">
                {usernameLogs.length > 0 ? (
                  usernameLogs.map((log) => {
                    const platforms = log.data?.profileLinks || log.data?.foundPlatforms || [];
                    if (platforms.length === 0) return null;
                    
                    // Categorize platforms
                    const categories: Record<string, any[]> = {
                      'Social Media': [],
                      'Professional': [],
                      'Gaming': [],
                      'Music & Audio': [],
                      'Video & Streaming': [],
                      'Development': [],
                      'Dating': [],
                      'Shopping & Commerce': [],
                      'Other': []
                    };
                    
                    platforms.forEach((p: any) => {
                      const name = (p.name || p.platform || '').toLowerCase();
                      if (['twitter', 'x', 'facebook', 'instagram', 'snapchat', 'tiktok', 'pinterest', 'tumblr', 'reddit', 'mastodon'].some(s => name.includes(s))) {
                        categories['Social Media'].push(p);
                      } else if (['linkedin', 'indeed', 'fiverr', 'freelancer', 'upwork', 'dribbble', 'behance'].some(s => name.includes(s))) {
                        categories['Professional'].push(p);
                      } else if (['steam', 'xbox', 'playstation', 'psn', 'roblox', 'fortnite', 'epic', 'chess', 'twitch'].some(s => name.includes(s))) {
                        categories['Gaming'].push(p);
                      } else if (['spotify', 'soundcloud', 'lastfm', 'bandcamp', 'mixcloud', 'apple music', 'deezer', 'bandlab'].some(s => name.includes(s))) {
                        categories['Music & Audio'].push(p);
                      } else if (['youtube', 'vimeo', 'dailymotion', 'tiktok'].some(s => name.includes(s))) {
                        categories['Video & Streaming'].push(p);
                      } else if (['github', 'gitlab', 'bitbucket', 'stackoverflow', 'hackerrank', 'codepen', 'replit'].some(s => name.includes(s))) {
                        categories['Development'].push(p);
                      } else if (['tinder', 'bumble', 'hinge', 'okcupid', 'match', 'plenty'].some(s => name.includes(s))) {
                        categories['Dating'].push(p);
                      } else if (['ebay', 'amazon', 'etsy', 'poshmark', 'depop', 'mercari'].some(s => name.includes(s))) {
                        categories['Shopping & Commerce'].push(p);
                      } else {
                        categories['Other'].push(p);
                      }
                    });
                    
                    return (
                      <div key={log.id} className="space-y-6">
                        <div className="flex items-center gap-2 mb-4 border-b pb-2">
                          <User className="h-5 w-5 text-primary" />
                          <h3 className="text-lg font-semibold">
                            Username: "{log.data.username}"
                          </h3>
                          <Badge variant="default" className="ml-auto">
                            {platforms.length} platforms
                          </Badge>
                        </div>
                        
                        {Object.entries(categories).map(([category, categoryPlatforms]) => {
                          if (categoryPlatforms.length === 0) return null;
                          return (
                            <div key={category} className="space-y-3">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-medium text-muted-foreground">{category}</h4>
                                <Badge variant="outline" className="text-xs">{categoryPlatforms.length}</Badge>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {categoryPlatforms.map((platform: any, idx: number) => (
                                  <div key={idx} className="group border border-border rounded-lg p-3 hover:border-primary/50 transition-colors bg-card">
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                                        <PlatformLogo platform={platform.name || platform.platform || 'unknown'} size="lg" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium">{platform.name || platform.platform}</div>
                                        <a
                                          href={platform.url}
                                          target="_blank"
                                          rel="noopener noreferrer nofollow"
                                          className="text-xs text-primary hover:underline truncate block"
                                        >
                                          View Profile →
                                        </a>
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => {
                                          navigator.clipboard.writeText(platform.url);
                                          toast({ title: "Link copied to clipboard" });
                                        }}
                                      >
                                        <Copy className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="mb-2">No username search results.</p>
                    <p className="text-sm">Include an email or username in your search to discover accounts.</p>
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

          {/* Enrichment Tab - 80+ Platform Checks */}
          <TabsContent value="enrichment" className="flex-1 mt-0 px-6">
            <ScrollArea className="h-[550px]">
              <div className="space-y-6 pb-4 pr-4">
                {enrichmentLogs.length > 0 ? (
                  enrichmentLogs.map((log) => (
                    <SelectorEnrichmentResults 
                      key={log.id}
                      data={log.data as any}
                    />
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    <Zap className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="font-medium">No enrichment data available</p>
                    <p className="text-sm mt-1">
                      Include an email or phone number in your search to check 80+ platforms for registered accounts.
                    </p>
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
              <DeepDiveResultsCard 
                results={deepDiveResults} 
                platform={deepDiveDialog?.platform || ''} 
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

export default InvestigationPanel;
