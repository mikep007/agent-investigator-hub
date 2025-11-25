import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, AlertTriangle, Calendar, Database } from "lucide-react";
import { format } from "date-fns";
import { BreachTimeline } from "./BreachTimeline";

interface BreachSource {
  name: string;
  date: string;
  line?: string;
  record?: {
    source: {
      name: string;
      breach_date: string;
    };
    fields: string[];
    [key: string]: any;
  };
}

interface BreachData {
  target: string;
  type: 'email' | 'phone' | 'username';
  found: number;
  fields: string[];
  sources: BreachSource[];
  success: boolean;
  error?: string;
}

interface BreachResultsProps {
  data: BreachData;
}

const BreachResults = ({ data }: BreachResultsProps) => {
  if (data.error) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Breach Check Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{data.error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const hasBreaches = data.found > 0;
  const typeLabel = data.type === 'email' ? 'Email' : data.type === 'phone' ? 'Phone' : 'Username';

  return (
    <Card className={hasBreaches ? "border-destructive/50" : "border-primary/50"}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {hasBreaches ? (
            <AlertTriangle className="w-5 h-5 text-destructive" />
          ) : (
            <Shield className="w-5 h-5 text-primary" />
          )}
          Data Breach Intelligence
        </CardTitle>
        <CardDescription>
          {typeLabel}: <span className="font-mono text-foreground">{data.target}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Breaches Found</p>
              <p className="text-xs text-muted-foreground">
                {hasBreaches ? `${typeLabel} found in data breaches` : "No breaches detected"}
              </p>
            </div>
          </div>
          <Badge variant={hasBreaches ? "destructive" : "default"} className="text-lg px-4 py-1">
            {data.found}
          </Badge>
        </div>

        {/* Compromised Fields */}
        {data.fields && data.fields.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              Compromised Data Fields
            </h4>
            <div className="flex flex-wrap gap-2">
              {data.fields.map((field, index) => (
                <Badge key={index} variant="outline" className="border-destructive/50">
                  {field}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      {/* Breach Timeline */}
      {hasBreaches && data.sources && data.sources.length > 0 && (
        <div className="px-6 pb-6">
          <BreachTimeline sources={data.sources} />
        </div>
      )}

      <CardContent className="space-y-4">
        {/* Breach Sources - Detailed Records */}
        {data.sources && data.sources.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">All Breach Sources ({data.sources.length})</h4>
            <div className="space-y-4">
              {data.sources.map((source, index) => (
                <div
                  key={index}
                  className="p-5 rounded-lg border border-destructive/30 bg-destructive/5 space-y-4"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="font-semibold text-base">{source.name}</p>
                    {source.date && (
                      <Badge variant="secondary" className="text-xs">
                        <Calendar className="w-3 h-3 mr-1" />
                        {source.date}
                      </Badge>
                    )}
                  </div>
                  
                  {/* Display detailed breach data fields */}
                  {source.record && source.record.fields && source.record.fields.length > 0 && (
                    <div className="space-y-3 pt-3 border-t border-destructive/20">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Leaked Data:</p>
                      <div className="space-y-2.5">
                        {source.record.fields.map((field, idx) => {
                          const value = source.record![field];
                          if (!value) return null;
                          
                          return (
                            <div key={idx} className="flex flex-col gap-1 p-3 rounded-md bg-background/50 border border-destructive/10">
                              <span className="text-xs font-semibold text-destructive uppercase tracking-wide">
                                {field.replace(/_/g, ' ')}
                              </span>
                              <span className="font-mono text-sm text-foreground break-all">
                                {String(value)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  {/* Fallback to line display if no record */}
                  {!source.record && source.line && (
                    <div className="pt-3 border-t border-destructive/20">
                      <p className="text-sm text-muted-foreground font-mono break-all p-3 rounded-md bg-background/50">
                        {source.line}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Security Recommendation */}
        {hasBreaches && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Security Recommendation:</strong> This {typeLabel.toLowerCase()} has been found in {data.found} data breach
              {data.found > 1 ? "es" : ""}. Consider changing passwords on affected accounts and enabling
              two-factor authentication.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

export default BreachResults;
