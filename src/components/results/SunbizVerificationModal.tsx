import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ExternalLink, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Building2,
  FileText,
  Loader2
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SunbizResult {
  entityName?: string;
  entityNumber?: string;
  documentNumber?: string;
  status?: string;
  detailUrl?: string;
  matchType?: string;
  confidence?: number;
}

interface SunbizVerificationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  results: SunbizResult[];
  targetName?: string;
  onVerify?: (entityNumber: string, verified: boolean) => void;
}

const SunbizVerificationModal = ({
  open,
  onOpenChange,
  results,
  targetName,
  onVerify,
}: SunbizVerificationModalProps) => {
  const [verificationStatus, setVerificationStatus] = useState<Record<string, 'verified' | 'rejected' | 'pending'>>({});
  const [loadingUrls, setLoadingUrls] = useState<Set<string>>(new Set());

  const sunbizResults = results.filter(r => r.detailUrl?.includes('sunbiz.org'));

  const handleOpenLink = (url: string, entityNumber: string) => {
    setLoadingUrls(prev => new Set(prev).add(entityNumber));
    window.open(url, '_blank', 'noopener,noreferrer');
    
    // Remove loading state after a short delay
    setTimeout(() => {
      setLoadingUrls(prev => {
        const next = new Set(prev);
        next.delete(entityNumber);
        return next;
      });
    }, 1000);
  };

  const handleVerify = (entityNumber: string, verified: boolean) => {
    setVerificationStatus(prev => ({
      ...prev,
      [entityNumber]: verified ? 'verified' : 'rejected'
    }));
    onVerify?.(entityNumber, verified);
  };

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'bg-muted text-muted-foreground';
    const pct = confidence * 100;
    if (pct >= 80) return 'bg-green-500/10 text-green-600 border-green-500/20';
    if (pct >= 60) return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
    return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
  };

  const getStatusIcon = (entityNumber: string) => {
    const status = verificationStatus[entityNumber];
    if (status === 'verified') {
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    }
    if (status === 'rejected') {
      return <XCircle className="h-5 w-5 text-red-500" />;
    }
    return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Verify Sunbiz Results
          </DialogTitle>
          <DialogDescription>
            Review and verify Florida business registry matches for{' '}
            <span className="font-medium text-foreground">{targetName || 'target'}</span>.
            Click each link to open the official Sunbiz page and confirm the match.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh] pr-4">
          <div className="space-y-3">
            {sunbizResults.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No Sunbiz results to verify</p>
              </div>
            ) : (
              sunbizResults.map((result, idx) => {
                const entityId = result.entityNumber || result.documentNumber || `result-${idx}`;
                const isLoading = loadingUrls.has(entityId);
                const status = verificationStatus[entityId];

                return (
                  <div
                    key={entityId}
                    className={`p-4 rounded-lg border transition-colors ${
                      status === 'verified' 
                        ? 'border-green-500/30 bg-green-500/5' 
                        : status === 'rejected'
                        ? 'border-red-500/30 bg-red-500/5'
                        : 'border-border bg-muted/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(entityId)}
                          <h4 className="font-semibold text-sm truncate">
                            {result.entityName || 'Unknown Entity'}
                          </h4>
                        </div>
                        
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {result.entityNumber && (
                            <Badge variant="outline" className="text-xs">
                              <FileText className="h-3 w-3 mr-1" />
                              {result.entityNumber}
                            </Badge>
                          )}
                          {result.status && (
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${
                                result.status.toLowerCase().includes('active')
                                  ? 'bg-green-500/10 text-green-600'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {result.status}
                            </Badge>
                          )}
                          {result.confidence && (
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${getConfidenceColor(result.confidence)}`}
                            >
                              {Math.round(result.confidence * 100)}% match
                            </Badge>
                          )}
                          {result.matchType && (
                            <Badge variant="secondary" className="text-xs">
                              via {result.matchType}
                            </Badge>
                          )}
                        </div>

                        {result.detailUrl && (
                          <p className="text-xs text-muted-foreground mt-2 truncate">
                            {result.detailUrl}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => result.detailUrl && handleOpenLink(result.detailUrl, entityId)}
                        disabled={!result.detailUrl}
                        className="flex-1"
                      >
                        {isLoading ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Open Sunbiz Page
                      </Button>
                      
                      <Button
                        variant={status === 'verified' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleVerify(entityId, true)}
                        className={status === 'verified' ? 'bg-green-600 hover:bg-green-700' : ''}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        Confirm
                      </Button>
                      
                      <Button
                        variant={status === 'rejected' ? 'destructive' : 'outline'}
                        size="sm"
                        onClick={() => handleVerify(entityId, false)}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {Object.values(verificationStatus).filter(s => s === 'verified').length} verified,{' '}
            {Object.values(verificationStatus).filter(s => s === 'rejected').length} rejected
          </div>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SunbizVerificationModal;
