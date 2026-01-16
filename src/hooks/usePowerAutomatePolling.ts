import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PowerAutomatePollingOptions {
  investigationId: string | null;
  findings: any[];
  onResultsReceived?: () => void;
}

export function usePowerAutomatePolling({ 
  investigationId, 
  findings,
  onResultsReceived 
}: PowerAutomatePollingOptions) {
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);
  const [isPolling, setIsPolling] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const pollCountRef = useRef(0);
  const lastWorkorderIdRef = useRef<string | null>(null);
  const onResultsReceivedRef = useRef(onResultsReceived);

  // Keep ref updated
  useEffect(() => {
    onResultsReceivedRef.current = onResultsReceived;
  }, [onResultsReceived]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    isPollingRef.current = false;
    setIsPolling(false);
    console.log('[PowerAutomate] Polling stopped');
  }, []);

  // Use ref-based poll function to avoid recreating on every render
  const pollForResults = useCallback(async (workorderid: string, findingId: string): Promise<{ stillPending: boolean }> => {
    pollCountRef.current += 1;
    setPollCount(pollCountRef.current);
    console.log('[PowerAutomate] Polling for results, workorderid:', workorderid, 'poll #', pollCountRef.current);
    
    try {
      const { data, error } = await supabase.functions.invoke('osint-power-automate-poll', {
        body: { workorderid }
      });

      if (error) {
        console.error('[PowerAutomate] Poll error:', error);
        return { stillPending: true };
      }

      if (data?.pending) {
        console.log('[PowerAutomate] Results still pending, poll count:', pollCountRef.current);
        return { stillPending: true };
      }

      if (data?.success && data?.data) {
        console.log('[PowerAutomate] ✅ Results received!', data.data);
        
        // Update the finding with the new results - this will trigger realtime update
        const { error: updateError } = await supabase
          .from('findings')
          .update({
            data: data.data,
            confidence_score: 75,
            verification_status: 'verified'
          })
          .eq('id', findingId);

        if (updateError) {
          console.error('[PowerAutomate] Failed to update finding:', updateError);
          toast.error('Failed to save Global Findings results');
        } else {
          // Show success toast with summary
          const summary = data.data.summary || {};
          const totalResults = (summary.totalEmails || 0) + (summary.totalPhones || 0) + 
                               (summary.totalAddresses || 0) + (summary.totalSocialProfiles || 0);
          const personCount = data.data.personCount || 0;
          
          toast.success('Global Findings Ready!', {
            description: `Found ${personCount} person(s) with ${totalResults} total data points`,
            duration: 5000,
          });
        }
        
        onResultsReceivedRef.current?.();
        return { stillPending: false };
      }

      return { stillPending: true };
    } catch (err) {
      console.error('[PowerAutomate] Poll exception:', err);
      return { stillPending: true };
    }
  }, []); // No dependencies - uses refs

  // Store workorderid in a ref to ensure we always poll with the same ID
  const workorderIdRef = useRef<string | null>(null);
  const findingIdRef = useRef<string | null>(null);
  const activeInvestigationIdRef = useRef<string | null>(null);

  // Reset any persisted workorder/finding refs when the investigation changes.
  // Without this, a new investigation can accidentally keep polling with a previous workorderid.
  useEffect(() => {
    if (investigationId === activeInvestigationIdRef.current) return;

    console.log('[PowerAutomate] Investigation changed; resetting polling refs', {
      from: activeInvestigationIdRef.current,
      to: investigationId,
    });

    stopPolling();
    activeInvestigationIdRef.current = investigationId;

    workorderIdRef.current = null;
    findingIdRef.current = null;
    lastWorkorderIdRef.current = null;

    pollCountRef.current = 0;
    setPollCount(0);
  }, [investigationId, stopPolling]);

  useEffect(() => {
    if (!investigationId || !findings.length) {
      stopPolling();
      return;
    }

    // Find the most recent Power Automate finding (there can be multiple from retries/reruns)
    const powerAutomateFindings = findings
      .filter((f) => f.agent_type === 'Power_automate')
      .sort((a, b) => {
        const aTime = new Date(a.created_at ?? 0).getTime();
        const bTime = new Date(b.created_at ?? 0).getTime();
        return bTime - aTime;
      });

    const powerAutomateFinding = powerAutomateFindings[0];

    if (!powerAutomateFinding) {
      stopPolling();
      return;
    }

    const findingData = powerAutomateFinding.data;
    
    // Check if data is complete (not pending)
    const hasCompleteData = findingData?.persons && Array.isArray(findingData.persons);
    const isPending = (findingData?.pending === true || findingData?.status === 'pending') && !hasCompleteData;
    
    // IMPORTANT: Only extract workorderid from a pending finding
    // Once we start polling, we keep using the same workorderid stored in ref
    const newWorkorderid = isPending ? findingData?.workorderid : null;

    // If already complete, stop polling
    if (hasCompleteData || (!isPending && !newWorkorderid)) {
      if (isPollingRef.current) {
        console.log('[PowerAutomate] Results complete, stopping polling');
        stopPolling();
      }
      return;
    }

    // If this is a new workorder or first time seeing one, store it
    if (newWorkorderid && newWorkorderid !== lastWorkorderIdRef.current) {
      console.log('[PowerAutomate] New workorderid detected:', newWorkorderid, '(was:', lastWorkorderIdRef.current, ')');
      stopPolling();
      lastWorkorderIdRef.current = newWorkorderid;
      workorderIdRef.current = newWorkorderid;
      findingIdRef.current = powerAutomateFinding.id;
      pollCountRef.current = 0;
      setPollCount(0);
    }

    // Need a valid workorderid to poll
    const activeWorkorderId = workorderIdRef.current;
    const activeFindingId = findingIdRef.current;
    
    if (!activeWorkorderId || !activeFindingId) {
      console.log('[PowerAutomate] No active workorderid to poll');
      stopPolling();
      return;
    }

    // Already polling for this workorder
    if (isPollingRef.current) {
      return;
    }

    console.log('[PowerAutomate] Starting polling for workorderid:', activeWorkorderId, 'findingId:', activeFindingId);
    isPollingRef.current = true;
    setIsPolling(true);

    // Poll immediately, then every 30 seconds
    const poll = async () => {
      if (!isPollingRef.current) return; // Guard against running after stop
      
      // Always use the stored refs to ensure we poll with the original IDs
      const wid = workorderIdRef.current;
      const fid = findingIdRef.current;
      
      if (!wid || !fid) {
        console.log('[PowerAutomate] Lost workorderid/findingId reference, stopping poll');
        stopPolling();
        return;
      }
      
      console.log('[PowerAutomate] Polling with workorderid:', wid);
      const result = await pollForResults(wid, fid);
      if (!result.stillPending) {
        stopPolling();
      }
    };

    poll(); // Initial poll

    pollingIntervalRef.current = setInterval(poll, 30000); // 30 seconds

    return () => {
      // Don't stop polling on cleanup - let it continue across re-renders
      // Only stop when explicitly needed (workorder change, complete, etc.)
    };
  }, [investigationId, findings, stopPolling, pollForResults]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  return {
    isPolling,
    pollCount,
    stopPolling
  };
}
