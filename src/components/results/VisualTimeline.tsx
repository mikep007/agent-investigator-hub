import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { 
  ChevronDown, ZoomIn, ZoomOut, RefreshCw, 
  Calendar, Minus, Plus 
} from "lucide-react";
import { FindingData } from "./types";
import PlatformLogo from "../PlatformLogo";
import { useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface VisualTimelineProps {
  findings: FindingData[];
}

interface TimelineItem {
  platform: string;
  createdAt?: string;
  lastActivity?: string;
  type: 'account' | 'breach' | 'mention';
  url?: string;
  description?: string;
}

const VisualTimeline = ({ findings }: VisualTimelineProps) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // Extract timeline items from findings
  const timelineItems = useMemo(() => {
    const items: TimelineItem[] = [];

    findings.forEach(finding => {
      const data = finding.data;

      // Sherlock results - handle both foundPlatforms and profileLinks formats
      if ((finding.agent_type === 'Sherlock' || finding.agent_type === 'Sherlock_from_email')) {
        const platforms = data.foundPlatforms || data.profileLinks || [];
        platforms.forEach((p: any) => {
          // Try to extract actual creation date from platform data
          const createdAt = p.createdAt || p.created_at || p.joinDate || p.memberSince || null;
          items.push({
            platform: p.name || p.platform || 'Unknown',
            createdAt: createdAt, // Use actual date if available, null otherwise
            type: 'account',
            url: p.url,
            description: `Account on ${p.name || p.platform || 'platform'}`,
          });
        });
      }

      // Holehe results
      if (finding.agent_type === 'Holehe' && (data.allResults || data.registeredOn)) {
        const results = data.allResults || data.registeredOn || [];
        results
          .filter((r: any) => r.exists !== false)
          .forEach((r: any) => {
            items.push({
              platform: r.name || r.domain,
              createdAt: null, // Holehe doesn't provide creation dates
              type: 'account',
              url: r.url || `https://${r.domain}`,
              description: `Account on ${r.name || r.domain}`,
            });
          });
      }

      // Breach results - use actual breach dates
      if ((finding.agent_type?.toLowerCase().includes('leakcheck') || finding.agent_type === 'Breach')) {
        const sources = data.sources || [];
        sources.forEach((source: any) => {
          const breachDate = source.date || source.breach_date || source.breachDate;
          items.push({
            platform: source.name || source.source,
            createdAt: breachDate || null,
            type: 'breach',
            description: `Data Breach${breachDate ? '' : ' (date unknown)'}`,
          });
        });
      }

      // Social results
      if ((finding.agent_type === 'Social' || finding.agent_type === 'Social_name' || finding.agent_type === 'Idcrawl') && data.profiles) {
        data.profiles
          .filter((p: any) => p.exists)
          .forEach((p: any) => {
            const createdAt = p.createdAt || p.created_at || p.joinDate || null;
            items.push({
              platform: p.platform,
              createdAt: createdAt,
              type: 'account',
              url: p.url,
              description: `Account on ${p.platform}`,
            });
          });
      }

      // Instagram/Toutatis/Instaloader results
      if (finding.agent_type?.includes('Toutatis') || finding.agent_type?.includes('Instaloader')) {
        const profile = data.profileData || data.extractedData || {};
        if (profile.username || data.username) {
          items.push({
            platform: 'Instagram',
            createdAt: null, // Instagram doesn't expose creation dates
            type: 'account',
            url: data.profileUrl || `https://instagram.com/${profile.username || data.username}`,
            description: `Account on Instagram`,
          });
        }
      }
    });

    // Filter out items without dates for the timeline chart, but keep them for the table
    return items;
  }, [findings]);

  // Group items by year for visualization
  const itemsByYear = useMemo(() => {
    const years: { [year: string]: TimelineItem[] } = {};
    
    timelineItems.forEach(item => {
      if (!item.createdAt) return;
      const date = new Date(item.createdAt);
      if (isNaN(date.getTime())) return;
      
      const year = date.getFullYear().toString();
      if (!years[year]) years[year] = [];
      years[year].push(item);
    });

    return years;
  }, [timelineItems]);

  const sortedYears = Object.keys(itemsByYear).sort((a, b) => parseInt(a) - parseInt(b));
  const minYear = sortedYears.length > 0 ? parseInt(sortedYears[0]) : new Date().getFullYear();
  const maxYear = sortedYears.length > 0 ? parseInt(sortedYears[sortedYears.length - 1]) : new Date().getFullYear();

  // Generate all years in range
  const allYears: string[] = [];
  for (let y = minYear; y <= maxYear; y++) {
    allYears.push(y.toString());
  }

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Timeline View</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 w-8 p-0 bg-primary text-primary-foreground rounded"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Double click on a timeline item to expand it. Click on it to see its details on the table.
        </p>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          {/* Zoom Controls */}
          <div className="flex items-center justify-end gap-1 mb-4">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0 bg-primary text-primary-foreground">
              <Plus className="h-3 w-3" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0 bg-destructive text-destructive-foreground">
              <Minus className="h-3 w-3" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0 bg-blue-500 text-white">
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>

          {/* Visual Timeline Chart */}
          <div className="mb-6 border border-border rounded-lg p-4 bg-muted/20">
            <ScrollArea className="w-full">
              <div className="min-w-[600px]">
                {/* Y-axis labels */}
                <div className="flex">
                  <div className="w-24 shrink-0 flex flex-col justify-around h-32 text-xs text-muted-foreground pr-2">
                    <span>Latest Activity</span>
                    <span>Acct. Creation</span>
                  </div>

                  {/* Timeline grid */}
                  <div className="flex-1 relative">
                    {/* Horizontal grid lines */}
                    <div className="absolute inset-0 flex flex-col justify-around pointer-events-none">
                      <div className="border-b border-border/50" />
                      <div className="border-b border-border/50" />
                    </div>

                    {/* Year columns */}
                    <div className="flex h-32">
                      {allYears.map((year, idx) => (
                        <div key={year} className="flex-1 relative border-r border-border/30 last:border-r-0">
                          {/* Items for this year - Account Creation row */}
                          <div className="absolute bottom-0 left-0 right-0 h-1/2 flex items-center justify-center gap-1 flex-wrap p-1">
                            {itemsByYear[year]?.filter(i => i.type === 'account').slice(0, 4).map((item, i) => (
                              <div 
                                key={i}
                                className="h-6 w-6 rounded-sm bg-card border border-border flex items-center justify-center cursor-pointer hover:scale-110 transition-transform hover:z-10"
                                title={`${item.platform} - ${item.description}`}
                              >
                                <PlatformLogo platform={item.platform} size="sm" />
                              </div>
                            ))}
                            {(itemsByYear[year]?.filter(i => i.type === 'account').length || 0) > 4 && (
                              <Badge variant="secondary" className="text-[8px] h-4 px-1">
                                +{(itemsByYear[year]?.filter(i => i.type === 'account').length || 0) - 4}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Year labels */}
                    <div className="flex border-t border-border mt-2 pt-2">
                      {allYears.map(year => (
                        <div key={year} className="flex-1 text-center text-xs text-muted-foreground">
                          {year}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>

          {/* Table View */}
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[200px]">Platform</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[150px]">Data Integrity</TableHead>
                  <TableHead className="w-[180px] text-right">Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timelineItems.slice(0, 10).map((item, idx) => (
                  <TableRow key={idx} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                          <PlatformLogo platform={item.platform} size="sm" />
                        </div>
                        <span className="font-medium">{item.platform}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.description}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-muted-foreground">—</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {item.createdAt ? new Date(item.createdAt).toLocaleString('en-US', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      }).replace(',', '') : 'Unknown'}
                    </TableCell>
                  </TableRow>
                ))}
                {timelineItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No timeline data available
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default VisualTimeline;
