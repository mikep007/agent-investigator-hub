import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, AlertCircle, ExternalLink, Shield, Instagram, Facebook, Twitter, Github, Linkedin, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
}

const InvestigationPanel = ({ active, investigationId }: InvestigationPanelProps) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
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
          console.log('New finding received:', payload);
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
                  {getVerificationBadge(log.verification_status)}
                </div>
                <p className="text-sm text-foreground/80 mb-2">{log.message}</p>

                {log.agent_type === 'web' && log.data?.items && log.data.items.length > 0 && (
                  <div className="space-y-2 mt-3">
                    {log.data.items.slice(0, 3).map((item: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-2 text-xs bg-muted/30 p-2 rounded">
                        <ExternalLink className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <a 
                            href={item.link} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="font-medium hover:underline text-primary line-clamp-1"
                          >
                            {item.title}
                          </a>
                          <p className="text-muted-foreground line-clamp-2 mt-0.5">{item.snippet}</p>
                        </div>
                      </div>
                    ))}
                    {log.data.items.length > 3 && (
                      <p className="text-xs text-muted-foreground">
                        + {log.data.items.length - 3} more results
                      </p>
                    )}
                  </div>
                )}

                {log.agent_type === 'social' && log.data?.profiles && (
                  <div className="space-y-1 mt-3">
                    {log.data.profiles
                      .filter((profile: any) => profile.exists)
                      .map((profile: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          <Badge variant="outline" className="gap-1">
                            {profile.platform}
                          </Badge>
                          <a
                            href={profile.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline flex items-center gap-1"
                          >
                            View Profile
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      ))}
                  </div>
                )}

                {(log.agent_type === 'holehe' || log.agent_type === 'sherlock') && log.data?.matches && log.data.matches.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {log.data.matches.slice(0, 10).map((match: any, idx: number) => (
                      <Badge key={idx} variant="secondary" className="gap-1.5 text-xs">
                        {getPlatformIcon(match.platform || match.site || match.name)}
                        {match.platform || match.site || match.name}
                      </Badge>
                    ))}
                    {log.data.matches.length > 10 && (
                      <Badge variant="outline" className="text-xs">
                        +{log.data.matches.length - 10} more
                      </Badge>
                    )}
                  </div>
                )}

                <div className="flex gap-2 mt-3 pt-3 border-t border-border/30">
                  <Button
                    size="sm"
                    variant={log.verification_status === 'verified' ? 'default' : 'outline'}
                    onClick={() => updateVerificationStatus(log.id, 'verified')}
                    className="flex-1"
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Verified
                  </Button>
                  <Button
                    size="sm"
                    variant={log.verification_status === 'needs_review' ? 'default' : 'outline'}
                    onClick={() => updateVerificationStatus(log.id, 'needs_review')}
                    className="flex-1"
                  >
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Review
                  </Button>
                  <Button
                    size="sm"
                    variant={log.verification_status === 'inaccurate' ? 'destructive' : 'outline'}
                    onClick={() => updateVerificationStatus(log.id, 'inaccurate')}
                    className="flex-1"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Inaccurate
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};

export default InvestigationPanel;
