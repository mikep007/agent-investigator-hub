import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, AlertCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

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
}

const InvestigationPanel = ({ active, investigationId }: InvestigationPanelProps) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);

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

          // Format message based on agent type and data
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

          return {
            id: finding.id,
            timestamp: new Date(finding.created_at).toLocaleTimeString(),
            agent: finding.agent_type.charAt(0).toUpperCase() + finding.agent_type.slice(1),
            message,
            status,
            data: finding.data,
          };
        });

        setLogs(formattedLogs);
      }
    };

    fetchFindings();

    // Set up realtime subscription for new findings
    const channel = supabase
      .channel(`findings:${investigationId}`)
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
              ? `Found ${found.length} social media profile(s)`
              : 'No social media profiles found';
          } else if (finding.agent_type === 'web') {
            const items = data.items || [];
            message = items.length > 0
              ? `Found ${items.length} web results`
              : data.error || 'No web results found';
          } else if (finding.agent_type === 'email') {
            message = data.isValid 
              ? `Email validated: ${data.domain}`
              : 'Invalid email format';
          } else if (finding.agent_type === 'phone') {
            message = data.validity?.isValid
              ? `Phone validated: ${data.formatted || data.number} (${data.carrier?.country || 'Unknown'})`
              : 'Invalid phone number';
          } else if (finding.agent_type === 'username') {
            message = data.foundOn > 0
              ? `Username found on ${data.foundOn} platforms: ${data.profileLinks?.slice(0, 3).map((p: any) => p.platform).join(', ')}`
              : `Username not found on ${data.totalPlatforms} platforms`;
          } else if (finding.agent_type === 'address') {
            message = data.found
              ? `Found ${data.count} location(s): ${data.locations?.[0]?.displayName || 'Location found'}`
              : 'No locations found';
          } else if (finding.agent_type === 'holehe') {
            message = data.accountsFound > 0
              ? `Holehe found ${data.accountsFound} accounts on ${data.totalPlatforms} platforms checked`
              : `No accounts found (${data.totalPlatforms} platforms checked)`;
          } else if (finding.agent_type === 'sherlock') {
            message = data.profilesFound > 0
              ? `Sherlock found ${data.profilesFound} profiles on ${data.totalSitesChecked} sites checked`
              : `No profiles found (${data.totalSitesChecked} sites checked)`;
          }

          const newLog: LogEntry = {
            id: finding.id,
            timestamp: new Date(finding.created_at).toLocaleTimeString(),
            agent: finding.agent_type.charAt(0).toUpperCase() + finding.agent_type.slice(1),
            message,
            status: "success",
            data: finding.data,
          };

          setLogs((prev) => [...prev, newLog]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [active, investigationId]);

  const getStatusIcon = (status: LogEntry["status"]) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case "processing":
        return <Clock className="w-4 h-4 text-warning animate-pulse" />;
      case "pending":
        return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <ScrollArea className="h-[400px] pr-4">
      {logs.length === 0 && !active && (
        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
          <Clock className="w-12 h-12 mb-3 opacity-50" />
          <p className="text-sm">No active investigation</p>
        </div>
      )}

      {logs.length === 0 && active && (
        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
          <Clock className="w-12 h-12 mb-3 opacity-50 animate-pulse" />
          <p className="text-sm">Initializing agents...</p>
        </div>
      )}

      <div className="space-y-3">
        {logs.map((log, index) => (
          <div
            key={log.id}
            className={cn(
              "p-3 rounded-lg border border-border/50 bg-card/50 animate-in slide-in-from-right",
              "transition-all duration-300"
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="flex items-start gap-2">
              {getStatusIcon(log.status)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs">
                    {log.agent}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{log.timestamp}</span>
                </div>
                <p className="text-sm mb-2">{log.message}</p>
                
                {/* Display web search results */}
                {log.agent === 'Web' && log.data?.items && log.data.items.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {log.data.items.map((item: any, idx: number) => (
                      <Button
                        key={idx}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        asChild
                      >
                        <a href={item.link} target="_blank" rel="noopener noreferrer">
                          Match {idx + 1}
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      </Button>
                    ))}
                  </div>
                )}
                
                {/* Display profile links for social, username, holehe, and sherlock agents */}
                {(log.agent === 'Social' || log.agent === 'Username' || log.agent === 'Holehe' || log.agent === 'Sherlock') && log.data && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {log.agent === 'Social' && log.data.profiles?.filter((p: any) => p.exists).map((profile: any, idx: number) => (
                      <Button
                        key={profile.platform}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        asChild
                      >
                        <a href={profile.url} target="_blank" rel="noopener noreferrer">
                          Match {idx + 1}
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      </Button>
                    ))}
                    {log.agent === 'Username' && log.data.profileLinks?.map((link: any, idx: number) => (
                      <Button
                        key={link.platform}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        asChild
                      >
                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                          Match {idx + 1}
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      </Button>
                    ))}
                    {log.agent === 'Holehe' && log.data.allResults?.filter((r: any) => r.exists).map((account: any, idx: number) => (
                      <Button
                        key={account.name}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        asChild
                      >
                        <a href={account.url} target="_blank" rel="noopener noreferrer">
                          Match {idx + 1}
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      </Button>
                    ))}
                    {log.agent === 'Sherlock' && log.data.profileLinks?.map((link: any) => (
                      <Button
                        key={link.platform}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        asChild
                      >
                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                          {link.platform} {link.category && `(${link.category})`}
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};

export default InvestigationPanel;
