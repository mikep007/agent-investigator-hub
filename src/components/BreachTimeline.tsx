import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Database } from "lucide-react";

interface BreachSource {
  name: string;
  date: string;
  line?: string;
}

interface BreachTimelineProps {
  sources: BreachSource[];
}

export const BreachTimeline = ({ sources }: BreachTimelineProps) => {
  const sortedBreaches = useMemo(() => {
    return [...sources].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateA - dateB;
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

  const years = Object.keys(breachesByYear).sort();

  if (sortedBreaches.length === 0) {
    return null;
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <Calendar className="h-5 w-5" />
          Breach Timeline
        </CardTitle>
        <CardDescription>
          Chronological view of all detected data breaches
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-8">
          {years.map((year) => (
            <div key={year} className="space-y-4">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="text-lg font-bold px-3 py-1">
                  {year}
                </Badge>
                <div className="flex-1 h-px bg-border" />
              </div>
              
              <div className="space-y-3 pl-4">
                {breachesByYear[year].map((breach, index) => (
                  <div 
                    key={`${breach.name}-${index}`}
                    className="relative pl-6 pb-4 border-l-2 border-muted-foreground/30 last:border-transparent"
                  >
                    <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-destructive border-2 border-background" />
                    
                    <div className="space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                          <span className="font-semibold text-foreground">
                            {breach.name}
                          </span>
                        </div>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {formatDate(breach.date)}
                        </Badge>
                      </div>
                      
                      {breach.line && (
                        <p className="text-sm text-muted-foreground pl-6 font-mono break-all">
                          {breach.line.length > 100 
                            ? `${breach.line.substring(0, 100)}...` 
                            : breach.line}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-6 pt-4 border-t border-border">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Total breaches: <span className="font-semibold text-foreground">{sortedBreaches.length}</span>
            </span>
            <span className="text-muted-foreground">
              Time span: <span className="font-semibold text-foreground">
                {years[0]} - {years[years.length - 1]}
              </span>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
