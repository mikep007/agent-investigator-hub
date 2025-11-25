import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Globe, Calendar, MapPin, Users, Mail, Phone } from "lucide-react";
import PlatformLogo from "@/components/PlatformLogo";
import { Badge } from "@/components/ui/badge";

interface RelationshipGraphProps {
  active: boolean;
  investigationId: string | null;
  targetName?: string;
}

interface PlatformActivity {
  platform: string;
  timestamp: string;
  type: 'account_creation' | 'latest_activity' | 'breach' | 'mention';
  description: string;
  url?: string;
  source: string;
}

interface InvestigationStats {
  sourcesScanned: number;
  emailsFound: number;
  usernamesFound: number;
  phonesFound: number;
  addressesFound: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

const RelationshipGraph = ({ active, investigationId, targetName = "Target" }: RelationshipGraphProps) => {
  const [activities, setActivities] = useState<PlatformActivity[]>([]);
  const [stats, setStats] = useState<InvestigationStats>({
    sourcesScanned: 0,
    emailsFound: 0,
    usernamesFound: 0,
    phonesFound: 0,
    addressesFound: 0,
    firstSeen: null,
    lastSeen: null,
  });

  useEffect(() => {
    if (!active || !investigationId) {
      setActivities([]);
      setStats({
        sourcesScanned: 0,
        emailsFound: 0,
        usernamesFound: 0,
        phonesFound: 0,
        addressesFound: 0,
        firstSeen: null,
        lastSeen: null,
      });
      return;
    }

    const fetchFindings = async () => {
      const { data } = await supabase
        .from("findings")
        .select("*")
        .eq("investigation_id", investigationId)
        .order("created_at", { ascending: true });

      if (data && data.length > 0) {
        const newActivities: PlatformActivity[] = [];
        let emailCount = 0;
        let usernameCount = 0;
        let phoneCount = 0;
        let addressCount = 0;
        let earliestDate: string | null = null;
        let latestDate: string | null = null;

        data.forEach((finding) => {
          const findingData = finding.data as any;
          const timestamp = finding.created_at;

          // Update earliest/latest dates
          if (!earliestDate || timestamp < earliestDate) earliestDate = timestamp;
          if (!latestDate || timestamp > latestDate) latestDate = timestamp;

          // Process Holehe (email accounts)
          if (finding.agent_type === "Holehe" && findingData.results) {
            findingData.results.forEach((result: any) => {
              if (result.exists && result.platform) {
                emailCount++;
                newActivities.push({
                  platform: result.platform,
                  timestamp: finding.created_at,
                  type: 'account_creation',
                  description: `Account found on ${result.platform}`,
                  source: 'Email Enumeration',
                });
              }
            });
          }

          // Process Sherlock (usernames)
          if (finding.agent_type === "Sherlock" && findingData.profileLinks) {
            findingData.profileLinks.forEach((profile: any) => {
              usernameCount++;
              newActivities.push({
                platform: profile.platform,
                timestamp: finding.created_at,
                type: 'account_creation',
                description: `Username found on ${profile.platform}`,
                url: profile.url,
                source: 'Username Search',
              });
            });
          }

          // Process Social profiles
          if (finding.agent_type === "Social" && findingData.profiles) {
            findingData.profiles.forEach((profile: any) => {
              if (profile.exists) {
                newActivities.push({
                  platform: profile.platform,
                  timestamp: finding.created_at,
                  type: 'account_creation',
                  description: `Social profile found on ${profile.platform}`,
                  url: profile.url,
                  source: 'Social Search',
                });
              }
            });
          }

          // Process LeakCheck breaches
          if (finding.agent_type === "LeakCheck" && findingData.sources) {
            findingData.sources.forEach((breach: any) => {
              newActivities.push({
                platform: breach.name || 'Unknown',
                timestamp: finding.created_at,
                type: 'breach',
                description: `Data breach: ${breach.name}`,
                source: 'Breach Database',
              });
            });
          }

          // Process Web mentions
          if (finding.agent_type === "Web" && findingData.items) {
            findingData.items.slice(0, 3).forEach((item: any) => {
              newActivities.push({
                platform: new URL(item.link).hostname.replace('www.', ''),
                timestamp: finding.created_at,
                type: 'mention',
                description: item.title || 'Web mention',
                url: item.link,
                source: 'Web Search',
              });
            });
          }

          // Count phones and addresses
          if (finding.agent_type === "Phone") phoneCount++;
          if (finding.agent_type === "Address") addressCount++;
        });

        setActivities(newActivities);
        setStats({
          sourcesScanned: data.length,
          emailsFound: emailCount,
          usernamesFound: usernameCount,
          phonesFound: phoneCount,
          addressesFound: addressCount,
          firstSeen: earliestDate,
          lastSeen: latestDate,
        });
      }
    };

    fetchFindings();

    const channel = supabase
      .channel(`findings:${investigationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "findings",
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
  }, [active, investigationId, targetName]);

  if (!active || activities.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center space-y-2">
          <Globe className="w-12 h-12 mx-auto opacity-50" />
          <p>Start an investigation to see the digital footprint timeline</p>
        </div>
      </div>
    );
  }

  // Sort activities by timestamp for timeline
  const sortedActivities = [...activities].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Get unique years for timeline
  const years = Array.from(new Set(sortedActivities.map(a => 
    new Date(a.timestamp).getFullYear()
  ))).sort();

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="relative w-full h-full bg-background rounded-lg border border-border overflow-auto">
      {/* Stats Summary Bar */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-border bg-muted/30">
        <Badge variant="outline" className="flex items-center gap-2 px-3 py-1.5">
          <Globe className="w-4 h-4" />
          <span className="font-semibold">{stats.sourcesScanned}</span>
          <span className="text-muted-foreground">Sources Scanned</span>
        </Badge>
        <Badge variant="outline" className="flex items-center gap-2 px-3 py-1.5">
          <Mail className="w-4 h-4" />
          <span className="font-semibold">{stats.emailsFound}</span>
          <span className="text-muted-foreground">Emails</span>
        </Badge>
        <Badge variant="outline" className="flex items-center gap-2 px-3 py-1.5">
          <Users className="w-4 h-4" />
          <span className="font-semibold">{stats.usernamesFound}</span>
          <span className="text-muted-foreground">Usernames</span>
        </Badge>
        <Badge variant="outline" className="flex items-center gap-2 px-3 py-1.5">
          <Phone className="w-4 h-4" />
          <span className="font-semibold">{stats.phonesFound}</span>
          <span className="text-muted-foreground">Phones</span>
        </Badge>
        <Badge variant="outline" className="flex items-center gap-2 px-3 py-1.5">
          <MapPin className="w-4 h-4" />
          <span className="font-semibold">{stats.addressesFound}</span>
          <span className="text-muted-foreground">Locations</span>
        </Badge>
        {stats.firstSeen && (
          <Badge variant="outline" className="flex items-center gap-2 px-3 py-1.5">
            <Calendar className="w-4 h-4" />
            <span className="text-muted-foreground">First Seen:</span>
            <span className="font-semibold">{formatDate(stats.firstSeen)}</span>
          </Badge>
        )}
      </div>

      {/* Timeline View */}
      <div className="p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Digital Footprint Timeline
        </h3>

        {/* Activity Timeline - scrollable horizontal */}
        <div className="relative overflow-x-auto pb-4">
          <div className="min-w-[800px]">
            {/* Timeline axis */}
            <div className="relative h-32 mb-8">
              {/* Timeline line */}
              <div className="absolute top-16 left-0 right-0 h-0.5 bg-border" />
              
              {/* Platform icons on timeline */}
              {sortedActivities.map((activity, index) => {
                const leftPosition = (index / Math.max(sortedActivities.length - 1, 1)) * 100;
                const isCreation = activity.type === 'account_creation';
                const isBreach = activity.type === 'breach';
                
                return (
                  <div
                    key={`${activity.platform}-${index}`}
                    className="absolute"
                    style={{ left: `${leftPosition}%`, top: isCreation ? '10px' : '60px' }}
                  >
                    {/* Platform icon */}
                    <div
                      className="relative group cursor-pointer"
                      onClick={() => activity.url && window.open(activity.url, '_blank')}
                    >
                      <div className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center bg-background shadow-lg ${
                        isBreach ? 'border-red-500' : 'border-primary'
                      }`}>
                        <PlatformLogo platform={activity.platform} className="w-6 h-6" />
                      </div>
                      
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                        <div className="bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[200px] text-sm">
                          <div className="font-semibold text-foreground mb-1">{activity.platform}</div>
                          <div className="text-muted-foreground text-xs mb-2">{activity.description}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(activity.timestamp)}
                          </div>
                          <div className="text-xs text-primary mt-1">{activity.source}</div>
                          {activity.url && (
                            <div className="text-xs text-muted-foreground mt-1 italic">Click to open</div>
                          )}
                        </div>
                      </div>
                      
                      {/* Connector line */}
                      <div className={`absolute left-1/2 -translate-x-1/2 w-0.5 ${
                        isCreation ? 'top-full h-6 bg-primary' : 'bottom-full h-6 bg-primary'
                      }`} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Labels */}
            <div className="flex justify-between text-xs text-muted-foreground mb-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-primary border-2 border-primary" />
                <span>Account Creation</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-background border-2 border-red-500" />
                <span>Breach / Activity</span>
              </div>
            </div>
          </div>
        </div>

        {/* Activity Table */}
        <div className="mt-8">
          <h4 className="text-sm font-semibold mb-3">Platform Details</h4>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 font-medium">Platform</th>
                  <th className="text-left p-3 font-medium">Description</th>
                  <th className="text-left p-3 font-medium">Source</th>
                  <th className="text-left p-3 font-medium">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedActivities.map((activity, index) => (
                  <tr 
                    key={`row-${activity.platform}-${index}`}
                    className={`hover:bg-muted/50 transition-colors ${activity.url ? 'cursor-pointer' : ''}`}
                    onClick={() => activity.url && window.open(activity.url, '_blank')}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <PlatformLogo platform={activity.platform} className="w-5 h-5" />
                        <span className="font-medium">{activity.platform}</span>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{activity.description}</td>
                    <td className="p-3">
                      <Badge variant="secondary" className="text-xs">{activity.source}</Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{formatDate(activity.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RelationshipGraph;
