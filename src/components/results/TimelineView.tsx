import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ExternalLink, Shield, Globe, User, AlertTriangle, 
  Calendar, Clock, Activity 
} from "lucide-react";
import { FindingData, TimelineEvent } from "./types";
import PlatformLogo from "../PlatformLogo";

interface TimelineViewProps {
  findings: FindingData[];
}

const TimelineView = ({ findings }: TimelineViewProps) => {
  // Extract timeline events from findings
  const extractTimelineEvents = (): TimelineEvent[] => {
    const events: TimelineEvent[] = [];

    findings.forEach(finding => {
      const data = finding.data;
      const createdAt = finding.created_at;

      // Breach events with dates
      if (finding.agent_type === 'Breach' || finding.source?.includes('LeakCheck')) {
        if (data.sources) {
          data.sources.forEach((source: any) => {
            events.push({
              date: source.date || source.breach_date || createdAt,
              type: 'breach',
              platform: source.name || source.source,
              title: `Data Breach: ${source.name || source.source}`,
              description: source.fields?.join(', ') || 'Compromised data detected',
            });
          });
        }
      }

      // Platform discoveries
      if (finding.agent_type === 'Sherlock' && data.foundPlatforms) {
        data.foundPlatforms.forEach((p: any) => {
          events.push({
            date: createdAt,
            type: 'account_created',
            platform: p.name,
            title: `Account Found: ${p.name}`,
            description: `Username: ${data.username}`,
            url: p.url,
          });
        });
      }

      // Holehe findings
      if (finding.agent_type === 'Holehe' && data.allResults) {
        data.allResults
          .filter((r: any) => r.exists)
          .forEach((r: any) => {
            events.push({
              date: createdAt,
              type: 'account_created',
              platform: r.name || r.domain,
              title: `Email Registered: ${r.name || r.domain}`,
              description: `Email found on platform`,
              url: `https://${r.domain}`,
            });
          });
      }

      // Web mentions
      if (finding.agent_type === 'Web' && data.items) {
        data.items.forEach((item: any) => {
          events.push({
            date: item.pagemap?.metatags?.[0]?.['article:published_time'] || createdAt,
            type: 'mention',
            title: item.title,
            description: item.snippet,
            url: item.link,
          });
        });
      }
    });

    // Sort by date (most recent first)
    return events.sort((a, b) => {
      const dateA = new Date(a.date).getTime() || 0;
      const dateB = new Date(b.date).getTime() || 0;
      return dateB - dateA;
    });
  };

  const events = extractTimelineEvents();

  // Group events by date
  const groupEventsByDate = (events: TimelineEvent[]) => {
    const groups: { [key: string]: TimelineEvent[] } = {};
    
    events.forEach(event => {
      const date = new Date(event.date);
      const key = isNaN(date.getTime()) 
        ? 'Unknown Date' 
        : date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    });

    return groups;
  };

  const groupedEvents = groupEventsByDate(events);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'breach':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'account_created':
        return <User className="h-4 w-4 text-primary" />;
      case 'activity':
        return <Activity className="h-4 w-4 text-green-500" />;
      case 'mention':
        return <Globe className="h-4 w-4 text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'breach':
        return 'border-destructive/50 bg-destructive/5';
      case 'account_created':
        return 'border-primary/50 bg-primary/5';
      case 'activity':
        return 'border-green-500/50 bg-green-500/5';
      case 'mention':
        return 'border-blue-500/50 bg-blue-500/5';
      default:
        return 'border-border bg-muted/30';
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-1">
        {/* Summary */}
        <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">{events.length}</div>
            <div className="text-xs text-muted-foreground">Total Events</div>
          </div>
          <div className="h-10 w-px bg-border" />
          <div className="text-center">
            <div className="text-3xl font-bold text-destructive">
              {events.filter(e => e.type === 'breach').length}
            </div>
            <div className="text-xs text-muted-foreground">Breaches</div>
          </div>
          <div className="h-10 w-px bg-border" />
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-500">
              {events.filter(e => e.type === 'account_created').length}
            </div>
            <div className="text-xs text-muted-foreground">Accounts</div>
          </div>
          <div className="h-10 w-px bg-border" />
          <div className="text-center">
            <div className="text-3xl font-bold text-green-500">
              {events.filter(e => e.type === 'mention').length}
            </div>
            <div className="text-xs text-muted-foreground">Mentions</div>
          </div>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-6 top-0 bottom-0 w-px bg-border" />

          {Object.entries(groupedEvents).map(([date, dateEvents]) => (
            <div key={date} className="mb-8">
              {/* Date header */}
              <div className="flex items-center gap-3 mb-4 sticky top-0 bg-background/95 backdrop-blur py-2 z-10">
                <div className="h-3 w-3 rounded-full bg-primary border-2 border-background shadow" />
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold">{date}</span>
                  <Badge variant="secondary" className="text-xs">
                    {dateEvents.length} event{dateEvents.length > 1 ? 's' : ''}
                  </Badge>
                </div>
              </div>

              {/* Events for this date */}
              <div className="space-y-3 ml-12">
                {dateEvents.map((event, idx) => (
                  <Card 
                    key={idx} 
                    className={`border-l-4 ${getEventColor(event.type)} transition-all hover:shadow-md`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          {event.platform ? (
                            <PlatformLogo platform={event.platform} size="sm" />
                          ) : (
                            getEventIcon(event.type)
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{event.title}</span>
                            <Badge variant="outline" className="text-xs capitalize">
                              {event.type.replace('_', ' ')}
                            </Badge>
                          </div>
                          
                          {event.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {event.description}
                            </p>
                          )}

                          {event.url && (
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0 mt-2 text-xs"
                              onClick={() => window.open(event.url, '_blank')}
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              View Source
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}

          {events.length === 0 && (
            <div className="text-center py-12 text-muted-foreground ml-12">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No timeline events to display</p>
              <p className="text-sm mt-1">Events will appear as findings are discovered</p>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
};

export default TimelineView;
