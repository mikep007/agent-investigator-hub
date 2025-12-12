import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Search, User, MapPin, Calendar, ChevronDown, 
  AtSign, Hash, Globe 
} from "lucide-react";
import { FindingData } from "./types";

interface ResultsSummaryBarProps {
  findings: FindingData[];
  targetName?: string;
}

const ResultsSummaryBar = ({ findings, targetName }: ResultsSummaryBarProps) => {
  // Extract summary stats from findings
  const extractStats = () => {
    const stats = {
      sourcesScanned: 0,
      sourcesFound: 0,
      usernames: new Set<string>(),
      names: new Set<string>(),
      locations: new Set<string>(),
      firstSeen: null as string | null,
      lastSeen: null as string | null,
    };

    if (targetName) {
      stats.names.add(targetName);
    }

    findings.forEach(finding => {
      const data = finding.data;

      // Count sources
      if (finding.agent_type === 'Sherlock') {
        stats.sourcesScanned += data.totalChecked || 0;
        stats.sourcesFound += data.foundCount || 0;
        if (data.username) stats.usernames.add(data.username);
      }

      if (finding.agent_type === 'Holehe' && data.allResults) {
        stats.sourcesScanned += data.allResults.length;
        stats.sourcesFound += data.allResults.filter((r: any) => r.exists).length;
      }

      // Extract usernames
      if (data.username) stats.usernames.add(data.username);
      if (data.foundPlatforms) {
        data.foundPlatforms.forEach((p: any) => {
          if (p.username) stats.usernames.add(p.username);
        });
      }

      // Extract locations - handle both string and object formats
      if (data.locations) {
        data.locations.forEach((loc: any) => {
          if (typeof loc === 'string') {
            stats.locations.add(loc);
          } else if (loc && typeof loc === 'object') {
            // Handle location objects with displayName or address
            const locationStr = loc.displayName || loc.address || loc.city || 
                               (loc.city && loc.state ? `${loc.city}, ${loc.state}` : null);
            if (locationStr && typeof locationStr === 'string') {
              stats.locations.add(locationStr);
            }
          }
        });
      }
      // Handle individual location fields
      if (data.location && typeof data.location === 'string') stats.locations.add(data.location);
      if (data.location && typeof data.location === 'object' && data.location.displayName) {
        stats.locations.add(data.location.displayName);
      }
      if (data.city && typeof data.city === 'string') stats.locations.add(data.city);
      if (data.state && typeof data.state === 'string') stats.locations.add(data.state);

      // Track dates
      const createdAt = finding.created_at;
      if (createdAt) {
        if (!stats.firstSeen || createdAt < stats.firstSeen) {
          stats.firstSeen = createdAt;
        }
        if (!stats.lastSeen || createdAt > stats.lastSeen) {
          stats.lastSeen = createdAt;
        }
      }
    });

    return stats;
  };

  const stats = extractStats();

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  };

  const StatItem = ({ 
    icon: Icon, 
    label, 
    count, 
    values, 
    expandable = false 
  }: { 
    icon: React.ElementType; 
    label: string; 
    count: number; 
    values: string[]; 
    expandable?: boolean;
  }) => (
    <div className="flex flex-col items-start gap-1 px-4 py-3 min-w-[140px] border-r border-border last:border-r-0">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-sm font-medium">{label} ({count})</span>
        {expandable && count > 0 && (
          <Button variant="link" size="sm" className="h-auto p-0 text-xs text-primary">
            Expand
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-1 mt-1">
        {values.slice(0, 3).map((val, idx) => (
          <Badge key={idx} variant="secondary" className="text-xs font-normal">
            {val}
          </Badge>
        ))}
        {values.length > 3 && (
          <Badge variant="outline" className="text-xs">+{values.length - 3}</Badge>
        )}
        {values.length === 0 && (
          <span className="text-xs text-muted-foreground">None found</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="flex items-stretch overflow-x-auto">
        {/* Sources Scanned */}
        <div className="flex flex-col items-start gap-1 px-4 py-3 min-w-[160px] border-r border-border">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Search className="h-4 w-4" />
            <span className="text-sm font-medium">Sources Scanned ({stats.sourcesScanned})</span>
          </div>
          <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
            <span className="text-green-500">Found: {stats.sourcesFound}</span>
            <span>Not found: {stats.sourcesScanned - stats.sourcesFound}</span>
          </div>
        </div>

        {/* Usernames */}
        <StatItem 
          icon={AtSign}
          label="Usernames"
          count={stats.usernames.size}
          values={Array.from(stats.usernames)}
          expandable
        />

        {/* Names */}
        <StatItem 
          icon={User}
          label="Names"
          count={stats.names.size}
          values={Array.from(stats.names)}
          expandable
        />

        {/* Locations */}
        <StatItem 
          icon={MapPin}
          label="Locations"
          count={stats.locations.size}
          values={Array.from(stats.locations)}
          expandable
        />

        {/* First Seen */}
        <div className="flex flex-col items-start gap-1 px-4 py-3 min-w-[160px] border-r border-border">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span className="text-sm font-medium">First Seen (1)</span>
          </div>
          <span className="text-xs mt-1">{formatDate(stats.firstSeen)}</span>
        </div>

        {/* Last Seen */}
        <div className="flex flex-col items-start gap-1 px-4 py-3 min-w-[160px]">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span className="text-sm font-medium">Last Seen (1)</span>
          </div>
          <span className="text-xs mt-1">{formatDate(stats.lastSeen)}</span>
        </div>
      </div>
    </div>
  );
};

export default ResultsSummaryBar;
