import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Database, ChevronDown, ChevronUp } from "lucide-react";

interface BreachSource {
  name: string;
  date: string;
  line?: string;
}

interface BreachTimelineProps {
  sources: BreachSource[];
}

export const BreachTimeline = ({ sources }: BreachTimelineProps) => {
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());

  const sortedBreaches = useMemo(() => {
    return [...sources].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA; // Most recent first
    });
  }, [sources]);

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const getYearFromDate = (dateString: string) => {
    try {
      return new Date(dateString).getFullYear();
    } catch {
      return null;
    }
  };

  // Group breaches by year
  const breachesByYear = useMemo(() => {
    const grouped: { [year: string]: BreachSource[] } = {};
    sortedBreaches.forEach(breach => {
      const year = getYearFromDate(breach.date);
      if (year) {
        const yearKey = year.toString();
        if (!grouped[yearKey]) {
          grouped[yearKey] = [];
        }
        grouped[yearKey].push(breach);
      }
    });
    return grouped;
  }, [sortedBreaches]);

  const years = Object.keys(breachesByYear).sort((a, b) => Number(b) - Number(a)); // Descending

  const toggleYear = (year: string) => {
    setExpandedYears(prev => {
      const newSet = new Set(prev);
      if (newSet.has(year)) {
        newSet.delete(year);
      } else {
        newSet.add(year);
      }
      return newSet;
    });
  };

  if (sortedBreaches.length === 0) {
    return null;
  }

  return (
    <Card className="border-muted">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="h-4 w-4 text-destructive" />
          Breach Timeline
        </CardTitle>
        <CardDescription className="text-xs">
          {sortedBreaches.length} breaches spanning {years[years.length - 1]} - {years[0]}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {years.map((year) => {
            const breaches = breachesByYear[year];
            const isExpanded = expandedYears.has(year);
            
            return (
              <div key={year} className="rounded-lg border bg-card">
                <button
                  onClick={() => toggleYear(year)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Badge 
                      variant="outline" 
                      className="text-sm font-bold px-3 py-1 bg-destructive/5 border-destructive/30 text-destructive"
                    >
                      {year}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {breaches.length} breach{breaches.length !== 1 ? 'es' : ''}
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                
                {isExpanded && (
                  <div className="border-t px-4 py-3 space-y-3">
                    {breaches.map((breach, index) => (
                      <div 
                        key={`${breach.name}-${index}`}
                        className="flex items-start gap-3 p-3 rounded-md bg-muted/30"
                      >
                        <div className="w-2 h-2 rounded-full bg-destructive mt-2 flex-shrink-0" />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-medium text-sm">{breach.name}</span>
                            <Badge variant="secondary" className="text-xs flex-shrink-0">
                              {formatDate(breach.date)}
                            </Badge>
                          </div>
                          
                          {breach.line && (
                            <p className="text-xs text-muted-foreground font-mono break-all line-clamp-2">
                              {breach.line}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
