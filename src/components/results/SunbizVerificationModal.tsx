import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { 
  ExternalLink, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Building2,
  FileText,
  Loader2,
  MessageSquare
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SunbizResult {
  entityName?: string;
  entityNumber?: string;
  documentNumber?: string;
  status?: string;
  detailUrl?: string;
  matchType?: string;
  confidence?: number;
}

interface SunbizVerification {
  id: string;
  entity_number: string;
  entity_name: string;
  status: string;
  notes: string | null;
  verified_at: string;
}

interface SunbizVerificationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  results: SunbizResult[];
  targetName?: string;
  investigationId?: string;
  onVerify?: (entityNumber: string, verified: boolean) => void;
}

const SunbizVerificationModal = ({
  open,
  onOpenChange,
  results,
  targetName,
  investigationId,
  onVerify,
}: SunbizVerificationModalProps) => {
  const [verificationStatus, setVerificationStatus] = useState<Record<string, 'verified' | 'rejected' | 'pending'>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loadingUrls, setLoadingUrls] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [existingVerifications, setExistingVerifications] = useState<SunbizVerification[]>([]);
  const [loading, setLoading] = useState(false);

  const sunbizResults = results.filter(r => r.detailUrl?.includes('sunbiz.org'));

  // Load existing verifications when modal opens
  useEffect(() => {
    if (open && investigationId) {
      loadExistingVerifications();
    }
  }, [open, investigationId]);

  const loadExistingVerifications = async () => {
    if (!investigationId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sunbiz_verifications')
        .select('*')
        .eq('investigation_id', investigationId);

      if (error) throw error;

      if (data) {
        setExistingVerifications(data as SunbizVerification[]);
        
        // Populate verification status and notes from existing data
        const statusMap: Record<string, 'verified' | 'rejected' | 'pending'> = {} as Record<string, 'verified' | 'rejected' | 'pending'>;
        const notesMap: Record<string, string> = {};
        
        data.forEach((v: SunbizVerification) => {
          statusMap[v.entity_number] = v.status === 'confirmed' ? 'verified' : 'rejected';
          if (v.notes) notesMap[v.entity_number] = v.notes;
        });
        
        setVerificationStatus(statusMap);
        setNotes(notesMap);
      }
    } catch (error) {
      console.error('Error loading verifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenLink = (url: string, entityNumber: string) => {
    setLoadingUrls(prev => new Set(prev).add(entityNumber));
    window.open(url, '_blank', 'noopener,noreferrer');
    
    setTimeout(() => {
      setLoadingUrls(prev => {
        const next = new Set(prev);
        next.delete(entityNumber);
        return next;
      });
    }, 1000);
  };

  const handleVerify = async (entityNumber: string, entityName: string, verified: boolean) => {
    // Update local state immediately
    setVerificationStatus(prev => ({
      ...prev,
      [entityNumber]: verified ? 'verified' : 'rejected'
    }));

    // Save to database if we have an investigation ID
    if (investigationId) {
      setSaving(prev => new Set(prev).add(entityNumber));
      
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('You must be logged in to save verifications');
          return;
        }

        const existingVerification = existingVerifications.find(v => v.entity_number === entityNumber);
        
        if (existingVerification) {
          // Update existing verification
          const { error } = await supabase
            .from('sunbiz_verifications')
            .update({
              status: verified ? 'confirmed' : 'rejected',
              notes: notes[entityNumber] || null,
              verified_at: new Date().toISOString()
            })
            .eq('id', existingVerification.id);

          if (error) throw error;
        } else {
          // Insert new verification
          const { error } = await supabase
            .from('sunbiz_verifications')
            .insert({
              investigation_id: investigationId,
              user_id: user.id,
              entity_number: entityNumber,
              entity_name: entityName,
              status: verified ? 'confirmed' : 'rejected',
              notes: notes[entityNumber] || null
            });

          if (error) throw error;
        }

        toast.success(verified ? `Confirmed: ${entityName}` : `Rejected: ${entityName}`);
        
        // Reload verifications to get updated data
        await loadExistingVerifications();
      } catch (error) {
        console.error('Error saving verification:', error);
        toast.error('Failed to save verification');
      } finally {
        setSaving(prev => {
          const next = new Set(prev);
          next.delete(entityNumber);
          return next;
        });
      }
    }

    onVerify?.(entityNumber, verified);
  };

  const handleNotesChange = (entityNumber: string, value: string) => {
    setNotes(prev => ({
      ...prev,
      [entityNumber]: value
    }));
  };

  const handleSaveNotes = async (entityNumber: string) => {
    const existingVerification = existingVerifications.find(v => v.entity_number === entityNumber);
    
    if (existingVerification && investigationId) {
      setSaving(prev => new Set(prev).add(entityNumber));
      
      try {
        const { error } = await supabase
          .from('sunbiz_verifications')
          .update({ notes: notes[entityNumber] || null })
          .eq('id', existingVerification.id);

        if (error) throw error;
        
        toast.success('Notes saved');
        await loadExistingVerifications();
      } catch (error) {
        console.error('Error saving notes:', error);
        toast.error('Failed to save notes');
      } finally {
        setSaving(prev => {
          const next = new Set(prev);
          next.delete(entityNumber);
          return next;
        });
      }
    }
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

  const verifiedCount = Object.values(verificationStatus).filter(s => s === 'verified').length;
  const rejectedCount = Object.values(verificationStatus).filter(s => s === 'rejected').length;

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
            {investigationId && (
              <span className="block text-xs mt-1 text-muted-foreground">
                Verifications are saved automatically and persist across sessions.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
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
                  const entityName = result.entityName || 'Unknown Entity';
                  const isLoading = loadingUrls.has(entityId);
                  const isSaving = saving.has(entityId);
                  const status = verificationStatus[entityId];
                  const existingVerification = existingVerifications.find(v => v.entity_number === entityId);

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
                              {entityName}
                            </h4>
                            {existingVerification && (
                              <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600">
                                Saved
                              </Badge>
                            )}
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

                      {/* Notes section */}
                      {investigationId && (
                        <div className="mt-3">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                            <MessageSquare className="h-3 w-3" />
                            <span>Investigator Notes</span>
                          </div>
                          <div className="flex gap-2">
                            <Textarea
                              value={notes[entityId] || ''}
                              onChange={(e) => handleNotesChange(entityId, e.target.value)}
                              placeholder="Add notes about this entity..."
                              className="text-xs min-h-[60px] resize-none"
                            />
                            {existingVerification && notes[entityId] !== existingVerification.notes && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSaveNotes(entityId)}
                                disabled={isSaving}
                                className="shrink-0"
                              >
                                {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

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
                          onClick={() => handleVerify(entityId, entityName, true)}
                          disabled={isSaving}
                          className={status === 'verified' ? 'bg-green-600 hover:bg-green-700' : ''}
                        >
                          {isSaving ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          )}
                          Confirm
                        </Button>
                        
                        <Button
                          variant={status === 'rejected' ? 'destructive' : 'outline'}
                          size="sm"
                          onClick={() => handleVerify(entityId, entityName, false)}
                          disabled={isSaving}
                        >
                          {isSaving ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 mr-1" />
                          )}
                          Reject
                        </Button>
                      </div>

                      {/* Show verification timestamp */}
                      {existingVerification && (
                        <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/30">
                          Last verified: {new Date(existingVerification.verified_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        )}

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {verifiedCount} verified, {rejectedCount} rejected
            {existingVerifications.length > 0 && (
              <span className="ml-2 text-xs">
                ({existingVerifications.length} saved)
              </span>
            )}
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