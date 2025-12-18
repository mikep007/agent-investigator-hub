import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  User, 
  Eye, 
  Link2, 
  Lightbulb, 
  AlertCircle,
  CheckCircle,
  HelpCircle,
  Copy,
  ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface DeepDiveResults {
  usernames?: string[];
  activity_status?: string;
  visibility?: string;
  visibility_details?: string;
  connections?: string[];
  recommendations?: string[];
  error?: string;
  raw_analysis?: string;
}

interface DeepDiveResultsCardProps {
  results: DeepDiveResults;
  platform: string;
}

const DeepDiveResultsCard = ({ results, platform }: DeepDiveResultsCardProps) => {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Text copied to clipboard",
    });
  };

  const getVisibilityColor = (visibility?: string) => {
    switch (visibility?.toLowerCase()) {
      case 'high':
        return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'medium':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'low':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getActivityIcon = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case 'inactive':
        return <AlertCircle className="h-4 w-4 text-amber-500" />;
      default:
        return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Handle error or raw analysis fallback
  if (results.error || results.raw_analysis) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            Analysis Note
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {results.error || results.raw_analysis}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ScrollArea className="h-[500px] pr-4">
      <div className="space-y-4">
        {/* Activity & Visibility Status */}
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              Platform Visibility
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {getActivityIcon(results.activity_status)}
                <span className="text-sm">
                  Activity: <span className="font-medium capitalize">{results.activity_status || 'Unknown'}</span>
                </span>
              </div>
              {results.visibility && (
                <Badge variant="outline" className={getVisibilityColor(results.visibility)}>
                  {results.visibility} visibility
                </Badge>
              )}
            </div>
            {results.visibility_details && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {results.visibility_details}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Potential Usernames */}
        {results.usernames && results.usernames.length > 0 && (
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                Potential Usernames ({results.usernames.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {results.usernames.map((username, idx) => (
                  <Badge 
                    key={idx} 
                    variant="secondary" 
                    className="cursor-pointer hover:bg-secondary/80 transition-colors"
                    onClick={() => copyToClipboard(username)}
                  >
                    {username}
                    <Copy className="h-3 w-3 ml-1.5 opacity-50" />
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Click a username to copy it for further investigation
              </p>
            </CardContent>
          </Card>
        )}

        {/* Connections & Related Leads */}
        {results.connections && results.connections.length > 0 && (
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" />
                Investigation Leads ({results.connections.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {results.connections.map((connection, idx) => (
                  <li 
                    key={idx} 
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mt-0.5 text-primary/60 shrink-0" />
                    <span>{connection}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Recommendations */}
        {results.recommendations && results.recommendations.length > 0 && (
          <Card className="bg-card/50 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                AI Recommendations ({results.recommendations.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {results.recommendations.map((rec, idx) => (
                  <li 
                    key={idx} 
                    className="flex items-start gap-3 text-sm"
                  >
                    <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-muted-foreground">{rec}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!results.usernames?.length && 
         !results.connections?.length && 
         !results.recommendations?.length && 
         !results.visibility_details && (
          <Card className="bg-muted/30">
            <CardContent className="py-8 text-center">
              <HelpCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No detailed intelligence available for this platform
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
};

export default DeepDiveResultsCard;
