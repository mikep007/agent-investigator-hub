import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Shield, AlertTriangle, Calendar, Database, Copy, ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

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

// Sensitive field categories for visual grouping
const SENSITIVE_FIELDS = ['password', 'hash', 'salt', 'password_hash', 'hashed_password'];
const IDENTITY_FIELDS = ['first_name', 'last_name', 'name', 'full_name', 'dob', 'date_of_birth', 'ssn', 'social_security'];
const CONTACT_FIELDS = ['email', 'phone', 'address', 'city', 'state', 'zip', 'country', 'ip_address'];

const getFieldCategory = (field: string): 'sensitive' | 'identity' | 'contact' | 'other' => {
  const lowerField = field.toLowerCase();
  if (SENSITIVE_FIELDS.some(f => lowerField.includes(f))) return 'sensitive';
  if (IDENTITY_FIELDS.some(f => lowerField.includes(f))) return 'identity';
  if (CONTACT_FIELDS.some(f => lowerField.includes(f))) return 'contact';
  return 'other';
};

const getCategoryColor = (category: string) => {
  switch (category) {
    case 'sensitive': return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30';
    case 'identity': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
    case 'contact': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

const formatFieldLabel = (field: string) => {
  return field
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const BreachSourceCard = ({ source, index }: { source: BreachSource; index: number }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSensitive, setShowSensitive] = useState<{ [key: string]: boolean }>({});
  const { toast } = useToast();

  const toggleSensitive = (field: string) => {
    setShowSensitive(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const copyValue = (value: string, field: string) => {
    navigator.clipboard.writeText(value);
    toast({ title: "Copied", description: `${formatFieldLabel(field)} copied to clipboard` });
  };

  const hasDetailedData = source.record && source.record.fields && source.record.fields.length > 0;

  // Group fields by category
  const groupedFields = hasDetailedData 
    ? source.record!.fields.reduce((acc, field) => {
        const category = getFieldCategory(field);
        if (!acc[category]) acc[category] = [];
        acc[category].push(field);
        return acc;
      }, {} as { [key: string]: string[] })
    : {};

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="rounded-lg border border-destructive/30 bg-card overflow-hidden">
        {/* Header Row */}
        <CollapsibleTrigger asChild>
          <button className="w-full p-4 flex items-center justify-between hover:bg-accent/50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center text-sm font-bold text-destructive">
                {index + 1}
              </div>
              <div className="text-left">
                <p className="font-semibold text-base">{source.name}</p>
                {source.date && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Breach Date: {source.date}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasDetailedData && (
                <Badge variant="secondary" className="text-xs">
                  {source.record!.fields.length} fields
                </Badge>
              )}
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </button>
        </CollapsibleTrigger>

        {/* Detailed Data */}
        <CollapsibleContent>
          <div className="border-t border-destructive/20 p-4 space-y-4">
            {hasDetailedData ? (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[140px] font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                      Field Type
                    </TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                      Leaked Value
                    </TableHead>
                    <TableHead className="w-[100px] text-right font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {source.record!.fields.map((field, idx) => {
                    const value = source.record![field];
                    if (!value) return null;
                    
                    const category = getFieldCategory(field);
                    const isSensitive = category === 'sensitive';
                    const isHidden = isSensitive && !showSensitive[field];
                    const displayValue = isHidden ? '••••••••' : String(value);

                    return (
                      <TableRow key={idx} className="hover:bg-accent/30">
                        <TableCell className="py-3">
                          <Badge variant="outline" className={`text-xs ${getCategoryColor(category)}`}>
                            {formatFieldLabel(field)}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="font-mono text-sm break-all max-w-[400px]">
                            {displayValue.length > 100 ? (
                              <span title={displayValue}>
                                {displayValue.substring(0, 100)}...
                              </span>
                            ) : displayValue}
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isSensitive && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => toggleSensitive(field)}
                              >
                                {showSensitive[field] ? (
                                  <EyeOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => copyValue(String(value), field)}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : source.line ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Raw Data</p>
                <div className="p-3 rounded-md bg-muted/50 border">
                  <p className="text-sm font-mono break-all whitespace-pre-wrap">
                    {source.line}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No detailed data available</p>
            )}

            {/* Field Category Legend */}
            {hasDetailedData && Object.keys(groupedFields).length > 1 && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <span className="text-xs text-muted-foreground mr-2">Categories:</span>
                {groupedFields.sensitive && (
                  <Badge variant="outline" className={`text-xs ${getCategoryColor('sensitive')}`}>
                    {groupedFields.sensitive.length} Sensitive
                  </Badge>
                )}
                {groupedFields.identity && (
                  <Badge variant="outline" className={`text-xs ${getCategoryColor('identity')}`}>
                    {groupedFields.identity.length} Identity
                  </Badge>
                )}
                {groupedFields.contact && (
                  <Badge variant="outline" className={`text-xs ${getCategoryColor('contact')}`}>
                    {groupedFields.contact.length} Contact
                  </Badge>
                )}
                {groupedFields.other && (
                  <Badge variant="outline" className={`text-xs ${getCategoryColor('other')}`}>
                    {groupedFields.other.length} Other
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

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
    <div className="space-y-4">
      {/* Summary Card - OSINT Industries Style */}
      <Card className={hasBreaches ? "border-destructive/50" : "border-primary/50"}>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {hasBreaches ? (
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                ) : (
                  <Shield className="w-5 h-5 text-primary" />
                )}
                Data Breach Intelligence
              </CardTitle>
              <CardDescription className="mt-1">
                {typeLabel}: <span className="font-mono text-foreground">{data.target}</span>
              </CardDescription>
            </div>
            
            {/* Stats Pills - OSINT Industries Style */}
            <div className="flex gap-2">
              <div className={`rounded-lg px-4 py-2 text-center ${hasBreaches ? 'bg-destructive/10 border border-destructive/30' : 'bg-primary/10 border border-primary/30'}`}>
                <p className={`text-2xl font-bold ${hasBreaches ? 'text-destructive' : 'text-primary'}`}>{data.found}</p>
                <p className="text-xs text-muted-foreground">Breaches</p>
              </div>
              {data.fields && data.fields.length > 0 && (
                <div className="rounded-lg px-4 py-2 text-center bg-amber-500/10 border border-amber-500/30">
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{data.fields.length}</p>
                  <p className="text-xs text-muted-foreground">Data Types</p>
                </div>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Compromised Fields Summary */}
        {data.fields && data.fields.length > 0 && (
          <CardContent className="pt-0 pb-4">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                Compromised Data Types
              </h4>
              <div className="flex flex-wrap gap-2">
                {data.fields.map((field, index) => {
                  const category = getFieldCategory(field);
                  return (
                    <Badge 
                      key={index} 
                      variant="outline" 
                      className={getCategoryColor(category)}
                    >
                      {formatFieldLabel(field)}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Breach Sources - Expandable Cards */}
      {hasBreaches && data.sources && data.sources.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Database className="h-4 w-4" />
              Breach Sources ({data.sources.length})
            </h4>
            <p className="text-xs text-muted-foreground">Click to expand details</p>
          </div>
          
          <div className="space-y-2">
            {data.sources.map((source, index) => (
              <BreachSourceCard key={index} source={source} index={index} />
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
    </div>
  );
};

export default BreachResults;
