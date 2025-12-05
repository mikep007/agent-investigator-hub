import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Shield, AlertTriangle, Calendar, Database, Copy, ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface BreachSource {
  name: string;
  date?: string;
  line?: string;
  record?: {
    source?: {
      name?: string;
      breach_date?: string;
    };
    fields?: string[];
    [key: string]: any;
  };
}

interface BreachData {
  target: string;
  type?: string;
  found: number;
  fields?: string[];
  sources?: BreachSource[];
  success?: boolean;
  error?: string;
}

interface BreachResultsProps {
  data: BreachData;
}

// Sensitive field categories for visual grouping
const SENSITIVE_FIELDS = ['password', 'hash', 'salt', 'password_hash', 'hashed_password'];
const IDENTITY_FIELDS = ['first_name', 'last_name', 'name', 'full_name', 'dob', 'date_of_birth', 'ssn', 'social_security', 'profile_name'];
const CONTACT_FIELDS = ['email', 'phone', 'address', 'city', 'state', 'zip', 'country', 'ip_address', 'ip'];

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

const getTypeLabel = (type?: string): string => {
  if (!type) return 'Target';
  switch (type.toLowerCase()) {
    case 'email': return 'Email';
    case 'phone': return 'Phone';
    case 'username':
    case 'login': return 'Username';
    default: return 'Target';
  }
};

const BreachSourceCard = ({ source, index }: { source: BreachSource; index: number }) => {
  const [isExpanded, setIsExpanded] = useState(index < 3); // Auto-expand first 3
  const [showSensitive, setShowSensitive] = useState<{ [key: string]: boolean }>({});
  const { toast } = useToast();

  const toggleSensitive = (field: string) => {
    setShowSensitive(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const copyValue = (value: string, field: string) => {
    navigator.clipboard.writeText(value);
    toast({ title: "Copied", description: `${formatFieldLabel(field)} copied to clipboard` });
  };

  // Get fields from record, filtering out metadata fields
  const getLeakedFields = () => {
    if (!source.record) return [];
    const excludeFields = ['source', 'fields'];
    return Object.keys(source.record).filter(key => 
      !excludeFields.includes(key) && 
      source.record![key] !== null && 
      source.record![key] !== undefined &&
      source.record![key] !== ''
    );
  };

  const leakedFields = getLeakedFields();
  const hasDetailedData = leakedFields.length > 0;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="rounded-lg border border-destructive/30 bg-card overflow-hidden">
        <CollapsibleTrigger asChild>
          <button className="w-full p-3 flex items-center justify-between hover:bg-accent/50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-destructive/10 flex items-center justify-center text-xs font-bold text-destructive shrink-0">
                {index + 1}
              </div>
              <div className="text-left">
                <p className="font-semibold text-sm">{source.name || 'Unknown Source'}</p>
                {source.date && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {source.date}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasDetailedData && (
                <Badge variant="secondary" className="text-xs">
                  {leakedFields.length} fields
                </Badge>
              )}
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-destructive/20 p-3">
            {hasDetailedData ? (
              <div className="grid gap-2">
                {leakedFields.map((field, idx) => {
                  const value = source.record![field];
                  if (typeof value === 'object') return null; // Skip nested objects like 'source'
                  
                  const category = getFieldCategory(field);
                  const isSensitive = category === 'sensitive';
                  const isHidden = isSensitive && !showSensitive[field];
                  const displayValue = isHidden ? '••••••••' : String(value);

                  return (
                    <div key={idx} className="flex items-start gap-2 p-2 rounded-md bg-muted/30 hover:bg-muted/50">
                      <Badge variant="outline" className={`text-xs shrink-0 ${getCategoryColor(category)}`}>
                        {formatFieldLabel(field)}
                      </Badge>
                      <span className="flex-1 font-mono text-sm break-all min-w-0">
                        {displayValue.length > 80 ? `${displayValue.substring(0, 80)}...` : displayValue}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {isSensitive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => { e.stopPropagation(); toggleSensitive(field); }}
                          >
                            {showSensitive[field] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={(e) => { e.stopPropagation(); copyValue(String(value), field); }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : source.line ? (
              <div className="p-2 rounded-md bg-muted/50 border">
                <p className="text-xs font-mono break-all whitespace-pre-wrap">{source.line}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No detailed data available</p>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

const BreachResults = ({ data }: BreachResultsProps) => {
  if (!data) {
    return null;
  }

  if (data.error) {
    return (
      <Card className="border-destructive/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-destructive text-base">
            <AlertTriangle className="w-4 h-4" />
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

  const hasBreaches = (data.found || 0) > 0;
  const typeLabel = getTypeLabel(data.type);
  const sources = data.sources || [];
  const fields = data.fields || [];

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <Card className={hasBreaches ? "border-destructive/50" : "border-primary/50"}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <CardTitle className="flex items-center gap-2 text-base">
                {hasBreaches ? (
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                ) : (
                  <Shield className="w-4 h-4 text-primary shrink-0" />
                )}
                Data Breach Intelligence
              </CardTitle>
              <CardDescription className="mt-1 truncate">
                {typeLabel}: <span className="font-mono text-foreground">{data.target}</span>
              </CardDescription>
            </div>
            
            {/* Stats */}
            <div className="flex gap-2 shrink-0">
              <div className={`rounded-lg px-3 py-1.5 text-center ${hasBreaches ? 'bg-destructive/10 border border-destructive/30' : 'bg-primary/10 border border-primary/30'}`}>
                <p className={`text-xl font-bold ${hasBreaches ? 'text-destructive' : 'text-primary'}`}>{data.found || 0}</p>
                <p className="text-[10px] text-muted-foreground">Breaches</p>
              </div>
              {fields.length > 0 && (
                <div className="rounded-lg px-3 py-1.5 text-center bg-amber-500/10 border border-amber-500/30">
                  <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{fields.length}</p>
                  <p className="text-[10px] text-muted-foreground">Data Types</p>
                </div>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Compromised Fields */}
        {fields.length > 0 && (
          <CardContent className="pt-0 pb-3">
            <div className="space-y-2">
              <h4 className="text-xs font-semibold flex items-center gap-1 text-muted-foreground uppercase tracking-wide">
                <AlertTriangle className="w-3 h-3 text-destructive" />
                Compromised Data Types
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {fields.slice(0, 12).map((field, index) => (
                  <Badge 
                    key={index} 
                    variant="outline" 
                    className={`text-xs ${getCategoryColor(getFieldCategory(field))}`}
                  >
                    {formatFieldLabel(field)}
                  </Badge>
                ))}
                {fields.length > 12 && (
                  <Badge variant="outline" className="text-xs">
                    +{fields.length - 12} more
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Breach Sources */}
      {hasBreaches && sources.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Database className="h-4 w-4" />
              Breach Sources ({sources.length})
            </h4>
            <p className="text-xs text-muted-foreground">Click to expand</p>
          </div>
          
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {sources.map((source, index) => (
              <BreachSourceCard key={index} source={source} index={index} />
            ))}
          </div>
        </div>
      )}

      {/* Security Alert */}
      {hasBreaches && (
        <Alert variant="destructive" className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Found in {data.found} breach{(data.found || 0) > 1 ? "es" : ""}. 
            Consider changing passwords and enabling 2FA.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default BreachResults;