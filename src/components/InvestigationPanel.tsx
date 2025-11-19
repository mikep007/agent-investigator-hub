import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, AlertCircle, ExternalLink, Shield, Instagram, Facebook, Twitter, Github, Linkedin, Check, X, Sparkles, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ConfidenceScoreBadge from "./ConfidenceScoreBadge";
import PlatformLogo from "./PlatformLogo";
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
  verification_status?: 'verified' | 'needs_review' | 'inaccurate';
  confidence_score?: number;
}

const InvestigationPanel = ({ active, investigationId }: InvestigationPanelProps) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [deepDiveDialog, setDeepDiveDialog] = useState<{ open: boolean; platform: string; findingId: string } | null>(null);
  const [deepDiveLoading, setDeepDiveLoading] = useState(false);
  const [deepDiveResults, setDeepDiveResults] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!active || !investigationId) {
      setLogs([]);
      return;
    }

    const fetchFindings = async () => {
      const { data: findings, error } = await supabase
        .from('findings')
        .select('*')
        .eq('investigation_id', investigationId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching findings:', error);
        return;
      }

      if (findings) {
        const formattedLogs: LogEntry[] = findings.map((finding) => {
          const data = finding.data as any;
          let message = '';
          let status: "success" | "processing" | "pending" = "success";

          if (finding.agent_type === 'social') {
            const profiles = data.profiles || [];
            const found = profiles.filter((p: any) => p.exists);
            message = found.length > 0 
              ? `Found ${found.length} profile match${found.length > 1 ? 'es' : ''}`
              : 'No profiles found';
          } else if (finding.agent_type === 'web') {
            const items = data.items || [];
            message = items.length > 0
              ? `Found ${items.length} web match${items.length > 1 ? 'es' : ''}`
              : data.error || 'No web results found';
          } else if (finding.agent_type === 'email') {
            message = data.isValid 
              ? `Email verified`
              : 'Email not verified';
          } else if (finding.agent_type === 'phone') {
            message = data.validity?.isValid
              ? `Phone number verified`
              : 'Phone number not verified';
          } else if (finding.agent_type === 'username') {
            message = data.foundOn > 0
              ? `Found ${data.foundOn} username match${data.foundOn > 1 ? 'es' : ''}`
              : 'No username matches found';
          } else if (finding.agent_type === 'address') {
            message = data.found
              ? `Found ${data.count} location match${data.count > 1 ? 'es' : ''}`
              : 'No locations found';
          } else if (finding.agent_type === 'holehe') {
            message = data.accountsFound > 0
              ? `Found ${data.accountsFound} account match${data.accountsFound > 1 ? 'es' : ''}`
              : 'No account matches found';
          } else if (finding.agent_type === 'sherlock') {
            message = data.profilesFound > 0
              ? `Found ${data.profilesFound} profile match${data.profilesFound > 1 ? 'es' : ''}`
              : 'No profile matches found';
          }

          const displayAgent = finding.agent_type === 'sherlock' ? 'Email Match' : finding.agent_type.charAt(0).toUpperCase() + finding.agent_type.slice(1);
          
          return {
            id: finding.id,
            timestamp: new Date(finding.created_at).toLocaleTimeString(),
            agent: displayAgent,
            message,
            status,
            data: finding.data,
            agent_type: finding.agent_type,
            verification_status: finding.verification_status as 'verified' | 'needs_review' | 'inaccurate' | undefined,
            confidence_score: finding.confidence_score || 0,
          };
        });

        setLogs(formattedLogs);
      }
    };

    fetchFindings();

    const channel = supabase
      .channel('findings-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'findings',
          filter: `investigation_id=eq.${investigationId}`,
        },
        (payload) => {
          const finding = payload.new;
          const data = finding.data as any;
          let message = '';

          if (finding.agent_type === 'social') {
            const profiles = data.profiles || [];
            const found = profiles.filter((p: any) => p.exists);
            message = found.length > 0 
              ? `Found ${found.length} profile match${found.length > 1 ? 'es' : ''}`
              : 'No profiles found';
          } else if (finding.agent_type === 'web') {
            const items = data.items || [];
            message = items.length > 0
              ? `Found ${items.length} web match${items.length > 1 ? 'es' : ''}`
              : data.error || 'No web results found';
          } else if (finding.agent_type === 'email') {
            message = data.isValid 
              ? `Email verified`
              : 'Email not verified';
          } else if (finding.agent_type === 'phone') {
            message = data.validity?.isValid
              ? `Phone number verified`
              : 'Phone number not verified';
          } else if (finding.agent_type === 'username') {
            message = data.foundOn > 0
              ? `Found ${data.foundOn} username match${data.foundOn > 1 ? 'es' : ''}`
              : 'No username matches found';
          } else if (finding.agent_type === 'address') {
            message = data.found
              ? `Found ${data.count} location match${data.count > 1 ? 'es' : ''}`
              : 'No locations found';
          } else if (finding.agent_type === 'holehe') {
            message = data.accountsFound > 0
              ? `Found ${data.accountsFound} account match${data.accountsFound > 1 ? 'es' : ''}`
              : 'No account matches found';
          } else if (finding.agent_type === 'sherlock') {
            message = data.profilesFound > 0
              ? `Found ${data.profilesFound} profile match${data.profilesFound > 1 ? 'es' : ''}`
              : 'No profile matches found';
          }

          const displayAgent = finding.agent_type === 'sherlock' ? 'Email Match' : finding.agent_type.charAt(0).toUpperCase() + finding.agent_type.slice(1);
          
          setLogs((prev) => [
            ...prev,
            {
              id: finding.id,
              timestamp: new Date(finding.created_at).toLocaleTimeString(),
              agent: displayAgent,
              message,
              status: "success" as const,
              data: finding.data,
              agent_type: finding.agent_type,
              verification_status: finding.verification_status as 'verified' | 'needs_review' | 'inaccurate' | undefined,
            },
          ]);
        }
      )
      .subscribe();

    return () => {
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

  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center space-y-2">
          <Clock className="h-8 w-8 mx-auto animate-pulse" />
          <p>Initializing agents...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <ScrollArea className="h-full pr-4">
        <div className="space-y-3">
          {logs.map((log) => (
            <div
              key={log.id}
              className="p-4 rounded-lg border border-border/50 bg-card/50 hover:bg-card transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {log.status === "success" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    {log.status === "processing" && <Clock className="h-4 w-4 text-blue-500 animate-spin" />}
                    {log.status === "pending" && <AlertCircle className="h-4 w-4 text-yellow-500" />}
                    <span className="font-medium text-sm">{log.agent}</span>
                    <span className="text-xs text-muted-foreground">{log.timestamp}</span>
                    {log.confidence_score !== undefined && <ConfidenceScoreBadge score={log.confidence_score} size="sm" />}
                    {getVerificationBadge(log.verification_status)}
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{log.message}</p>
                  
                  {/* Keyword Matches Display */}
                  {log.data?.searchContext?.keywords?.length > 0 && (() => {
                    const keywords = log.data.searchContext.keywords;
                    const dataStr = JSON.stringify(log.data).toLowerCase();
                    const matchedKeywords = keywords.filter((kw: string) => dataStr.includes(kw.toLowerCase()));
                    
                    if (matchedKeywords.length > 0) {
                      return (
                        <div className="mb-3 p-2 rounded-md bg-success/10 border border-success/20">
                          <div className="flex items-center gap-2 mb-1">
                            <Tag className="h-3 w-3 text-success" />
                            <span className="text-xs font-semibold text-success">Keyword Match</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {matchedKeywords.map((keyword: string, idx: number) => (
                              <Badge key={idx} variant="outline" className="text-xs border-success/30 text-success">
                                {keyword}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  
                  <div className="space-y-2">
                    {log.agent_type === 'web' && log.data?.items?.length > 0 && (
                      <div className="space-y-2">
                        {log.data.items.map((item: any, idx: number) => (
                          <a
                            key={idx}
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors text-sm group"
                          >
                            <ExternalLink className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-foreground group-hover:text-primary truncate">
                                {item.title}
                              </div>
                              {item.snippet && (
                                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                                  {item.snippet}
                                </p>
                              )}
                            </div>
                          </a>
                        ))}
                      </div>
                    )}

                    {log.agent_type === 'social' && log.data?.profiles && (
                      <div className="space-y-1">
                        {log.data.profiles
                          .filter((p: any) => p.exists)
                          .map((profile: any, idx: number) => (
                            <a
                              key={idx}
                              href={profile.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
                            >
                              {getPlatformIcon(profile.platform)}
                              <span className="text-muted-foreground">{profile.platform}</span>
                              <ExternalLink className="h-3 w-3 ml-auto" />
                            </a>
                          ))}
                      </div>
                    )}

                    {log.agent_type === 'holehe' && log.data?.results && (
                      <div className="space-y-2">
                        {log.data.results
                          .filter((r: any) => r.exists)
                          .map((result: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50">
                              <div className="flex items-center gap-2 text-sm">
                                <PlatformLogo platform={result.platform} size="sm" />
                                <span className="text-muted-foreground">{result.platform}</span>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeepDive(result.platform, log.id)}
                                className="gap-1"
                              >
                                <Sparkles className="h-3 w-3" />
                                Deep Dive
                              </Button>
                            </div>
                          ))}
                      </div>
                    )}

                    {log.agent_type === 'sherlock' && log.data?.platforms && (
                      <div className="space-y-1">
                        {log.data.platforms.map((platform: any, idx: number) => (
                          <a
                            key={idx}
                            href={platform.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
                          >
                            <PlatformLogo platform={platform.name} size="sm" />
                            <span className="text-muted-foreground">{platform.name}</span>
                            <ExternalLink className="h-3 w-3 ml-auto" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant={log.verification_status === 'verified' ? 'default' : 'ghost'}
                    onClick={() => updateVerificationStatus(log.id, 'verified')}
                    className="h-8 w-8 p-0"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={log.verification_status === 'needs_review' ? 'default' : 'ghost'}
                    onClick={() => updateVerificationStatus(log.id, 'needs_review')}
                    className="h-8 w-8 p-0"
                  >
                    <AlertCircle className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={log.verification_status === 'inaccurate' ? 'destructive' : 'ghost'}
                    onClick={() => updateVerificationStatus(log.id, 'inaccurate')}
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <Dialog open={deepDiveDialog?.open || false} onOpenChange={(open) => setDeepDiveDialog(open ? deepDiveDialog : null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Deep Platform Investigation: {deepDiveDialog?.platform}
            </DialogTitle>
            <DialogDescription>
              AI-powered analysis of account activity, visibility, and connections
            </DialogDescription>
          </DialogHeader>

          {deepDiveLoading ? (
            <div className="flex items-center justify-center py-8">
              <Clock className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Analyzing platform data...</span>
            </div>
          ) : deepDiveResults ? (
            <div className="space-y-4">
              {deepDiveResults.usernames && deepDiveResults.usernames.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Likely Usernames
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {deepDiveResults.usernames.map((username: string, idx: number) => (
                      <Badge key={idx} variant="secondary">{username}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {deepDiveResults.activity_status && (
                <div>
                  <h4 className="font-semibold mb-2">Activity Status</h4>
                  <Badge variant={deepDiveResults.activity_status === 'active' ? 'default' : 'secondary'}>
                    {deepDiveResults.activity_status}
                  </Badge>
                </div>
              )}

              {deepDiveResults.visibility && (
                <div>
                  <h4 className="font-semibold mb-2">Public Visibility</h4>
                  <Badge variant="outline">{deepDiveResults.visibility}</Badge>
                  {deepDiveResults.visibility_details && (
                    <p className="text-sm text-muted-foreground mt-2">{deepDiveResults.visibility_details}</p>
                  )}
                </div>
              )}

              {deepDiveResults.connections && deepDiveResults.connections.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Potential Connections</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    {deepDiveResults.connections.map((connection: string, idx: number) => (
                      <li key={idx}>{connection}</li>
                    ))}
                  </ul>
                </div>
              )}

              {deepDiveResults.recommendations && deepDiveResults.recommendations.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Investigation Recommendations</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    {deepDiveResults.recommendations.map((rec: string, idx: number) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}

              {deepDiveResults.raw_analysis && (
                <div>
                  <h4 className="font-semibold mb-2">Analysis</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{deepDiveResults.raw_analysis}</p>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InvestigationPanel;
