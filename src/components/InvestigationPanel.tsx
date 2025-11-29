import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Clock, AlertCircle, Shield, Instagram, Facebook, Twitter, Github, Linkedin, Check, X, Sparkles, Mail, User, Globe, MapPin, Phone, Search, Copy, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ConfidenceScoreBadge from "./ConfidenceScoreBadge";
import PlatformLogo from "./PlatformLogo";
import InvestigativeAssistant from "./InvestigativeAssistant";
import AddressResults from "./AddressResults";
import BreachResults from "./BreachResults";
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

      if (findings) {
        setLoading(findings.length === 0);
        const formattedLogs: LogEntry[] = findings.map((finding) => {
          const data = finding.data as any;
          let message = '';
          let status: "success" | "processing" | "pending" = "success";

          if (finding.agent_type === 'Social') {
            const profiles = data.profiles || [];
            const found = profiles.filter((p: any) => p.exists);
            message = found.length > 0 
              ? `Found ${found.length} profile match${found.length > 1 ? 'es' : ''}`
              : 'No profiles found';
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

  // Categorize logs
  const filteredLogs = filterLogsBySearch(logs);
  const webLogs = filteredLogs.filter(log => 
    log.agent_type === 'Web' || 
    log.agent_type === 'Web_email_exact' ||
    (log.source && (
      log.source.includes('OSINT-web') || 
      log.source.includes('web_search') || 
      log.source.includes('address_owner') || 
      log.source.includes('address_residents')
    ))
  );
  const socialLogs = filteredLogs.filter(log => log.agent_type === 'Social' || log.agent_type === 'Sherlock' || log.agent_type === 'Holehe');
  const addressLogs = filteredLogs.filter(log => log.agent_type === 'Address');
  const contactLogs = filteredLogs.filter(log => log.agent_type === 'Email' || log.agent_type === 'Phone');
  const breachLogs = filteredLogs.filter(log => log.agent_type?.toLowerCase().startsWith('leakcheck'));

  const renderWebResults = (filteredLogs: LogEntry[]) => (
    <>
      {filteredLogs.map((log) => {
        if (log.agent_type === 'Web' && log.data?.items?.length > 0) {
          return (
            <div key={log.id} className="space-y-4">
              {log.data.items.slice(0, 10).map((item: any, idx: number) => (
                <div key={idx} className="group">
                  <div className="flex items-start gap-1">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm mb-1">
                        <span className="text-muted-foreground truncate">{item.displayLink}</span>
                        {log.confidence_score !== undefined && (
                          <ConfidenceScoreBadge score={log.confidence_score} />
                        )}
                      </div>
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block group-hover:underline"
                      >
                        <h3 className="text-xl text-primary mb-1 line-clamp-1">
                          {item.title}
                        </h3>
                      </a>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                        {item.snippet}
                      </p>
                      <div className="flex gap-2 items-center">
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
              ))}
            </div>
          );
        }
        return null;
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
                              Profile on {profile.platform}
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
              
              {/* Street View Photo */}
              {log.data.streetViewUrl && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium mb-2">Street View</h4>
                  <img
                    src={log.data.streetViewUrl}
                    alt="Street View"
                    className="w-full rounded-lg border border-border shadow-md"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}

              {/* Location Details */}
              {log.data.locations?.map((location: any, idx: number) => (
                <div key={idx} className="border border-border rounded-lg p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium text-foreground mb-1">
                        {location.displayName}
                      </h4>
                      {log.confidence_score !== undefined && (
                        <ConfidenceScoreBadge score={log.confidence_score} />
                      )}
                    </div>
                  </div>

                  {location.address && (
                    <div className="text-sm space-y-1 text-muted-foreground">
                      {location.address.houseNumber && location.address.road && (
                        <div>{location.address.houseNumber} {location.address.road}</div>
                      )}
                      {!location.address.houseNumber && location.address.road && (
                        <div>{location.address.road}</div>
                      )}
                      <div>
                        {location.address.city && `${location.address.city}, `}
                        {location.address.state && `${location.address.state} `}
                        {location.address.postcode}
                      </div>
                      {location.address.country && (
                        <div>{location.address.country}</div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 text-xs text-muted-foreground pt-2 border-t border-border/50">
                    <span>Lat: {location.latitude.toFixed(6)}</span>
                    <span>•</span>
                    <span>Lon: {location.longitude.toFixed(6)}</span>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <a
                      href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      View on Google Maps
                    </a>
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
        return null;
      })}
    </>
  );


  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
        {/* Search Bar */}
        <div className="px-6 pt-4 pb-3 border-b space-y-3">
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

        <Tabs defaultValue="all" className="flex-1 flex flex-col">
          <div className="px-6 pt-3 pb-2 border-b bg-muted/30">
            <TabsList className="inline-flex h-auto w-full justify-start gap-2 bg-transparent p-0">
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
                 value="social" 
                 className="data-[state=active]:bg-background rounded-sm px-4 py-2.5 text-sm font-medium"
               >
                 <User className="h-4 w-4 mr-2" />
                 Social
                 <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                   {socialLogs.length}
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
                 value="contact" 
                 className="data-[state=active]:bg-background rounded-sm px-4 py-2.5 text-sm font-medium"
               >
                 <Mail className="h-4 w-4 mr-2" />
                 Contact
                 <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                   {contactLogs.length}
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
             </TabsList>
           </div>

          <TabsContent value="all" className="flex-1">
            <ScrollArea className="h-[550px]">
              <div className="space-y-6 px-6 pb-4">
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


          <TabsContent value="web" className="flex-1">
            <ScrollArea className="h-[550px]">
              <div className="space-y-6 px-6 pb-4">
                {webLogs.length > 0 ? renderWebResults(webLogs) : (
                  <div className="text-center text-muted-foreground py-8">
                    {searchQuery ? "No web results match your search" : "No web results found"}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="social" className="flex-1">
            <ScrollArea className="h-[550px]">
              <div className="space-y-6 px-6 pb-4">
                {socialLogs.length > 0 ? renderSocialResults(socialLogs) : (
                  <div className="text-center text-muted-foreground py-8">
                    {searchQuery ? "No social media results match your search" : "No social media results found"}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="address" className="flex-1">
            <ScrollArea className="h-[550px]">
              <div className="space-y-6 px-6 pb-4">
                {addressLogs.length > 0 ? renderAddressResults(addressLogs) : (
                  <div className="text-center text-muted-foreground py-8">
                    {searchQuery ? "No address results match your search" : "No address results found"}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="contact" className="flex-1">
            <ScrollArea className="h-[550px]">
              <div className="space-y-6 px-6 pb-4">
                {contactLogs.length > 0 ? renderContactResults(contactLogs) : (
                  <div className="text-center text-muted-foreground py-8">
                    {searchQuery ? "No contact information matches your search" : "No contact information found"}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="breaches" className="flex-1">
            <ScrollArea className="h-[550px]">
              <div className="space-y-6 px-6 pb-4">
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
