import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, Clock, AlertCircle, Shield, Instagram, Facebook, Twitter, Github, Linkedin, Check, X, Sparkles, Mail, User, Globe, MapPin, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ConfidenceScoreBadge from "./ConfidenceScoreBadge";
import PlatformLogo from "./PlatformLogo";
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

  // Categorize logs
  const webLogs = logs.filter(log => log.agent_type === 'Web' || (log.source && (log.source.includes('web_search') || log.source.includes('address_owner') || log.source.includes('address_residents'))));
  const socialLogs = logs.filter(log => log.agent_type === 'Social' || log.agent_type === 'Sherlock' || log.agent_type === 'Holehe');
  const addressLogs = logs.filter(log => log.agent_type === 'Address');
  const contactLogs = logs.filter(log => log.agent_type === 'Email' || log.agent_type === 'Phone');

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
                <div key={idx} className="group">
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 mt-1">
                      {getPlatformIcon(platform.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-muted-foreground mb-1">{platform.name}</div>
                      <a
                        href={platform.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block group-hover:underline"
                      >
                        <h3 className="text-xl text-primary line-clamp-1 mb-1">
                          Profile on {platform.name}
                        </h3>
                      </a>
                      <p className="text-sm text-muted-foreground truncate">
                        {platform.url}
                      </p>
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
                  <div key={idx} className="group">
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
                <div key={idx} className="group">
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 mt-1">
                      <PlatformLogo platform={profile.platform} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-muted-foreground mb-1">{profile.platform}</div>
                      <a
                        href={profile.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block group-hover:underline"
                      >
                        <h3 className="text-xl text-primary line-clamp-1">
                          Profile on {profile.platform}
                        </h3>
                      </a>
                      <p className="text-sm text-muted-foreground truncate mt-1">
                        {profile.url}
                      </p>
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
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-5 mb-4">
          <TabsTrigger value="all" className="text-xs">
            All ({logs.length})
          </TabsTrigger>
          <TabsTrigger value="web" className="text-xs">
            <Globe className="h-3 w-3 mr-1" />
            Web ({webLogs.length})
          </TabsTrigger>
          <TabsTrigger value="social" className="text-xs">
            <User className="h-3 w-3 mr-1" />
            Social ({socialLogs.length})
          </TabsTrigger>
          <TabsTrigger value="address" className="text-xs">
            <MapPin className="h-3 w-3 mr-1" />
            Address ({addressLogs.length})
          </TabsTrigger>
          <TabsTrigger value="contact" className="text-xs">
            <Mail className="h-3 w-3 mr-1" />
            Contact ({contactLogs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <ScrollArea className="h-[600px]">
            <div className="space-y-6 pr-4 pb-4">
              {renderWebResults(logs)}
              {renderSocialResults(logs)}
              {renderAddressResults(logs)}
              {renderContactResults(logs)}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="web">
          <ScrollArea className="h-[600px]">
            <div className="space-y-6 pr-4 pb-4">
              {webLogs.length > 0 ? renderWebResults(webLogs) : (
                <div className="text-center text-muted-foreground py-8">
                  No web results found
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="social">
          <ScrollArea className="h-[600px]">
            <div className="space-y-6 pr-4 pb-4">
              {socialLogs.length > 0 ? renderSocialResults(socialLogs) : (
                <div className="text-center text-muted-foreground py-8">
                  No social media results found
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="address">
          <ScrollArea className="h-[600px]">
            <div className="space-y-6 pr-4 pb-4">
              {addressLogs.length > 0 ? renderAddressResults(addressLogs) : (
                <div className="text-center text-muted-foreground py-8">
                  No address results found
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="contact">
          <ScrollArea className="h-[600px]">
            <div className="space-y-6 pr-4 pb-4">
              {contactLogs.length > 0 ? renderContactResults(contactLogs) : (
                <div className="text-center text-muted-foreground py-8">
                  No contact information found
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

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
