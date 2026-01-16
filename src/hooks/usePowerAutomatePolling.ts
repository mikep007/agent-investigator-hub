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

  useEffect(() => {
    if (!investigationId || !findings.length) {
      stopPolling();
      return;
    }

    // Find the Power Automate finding that's still pending
    const powerAutomateFinding = findings.find(f => 
      f.agent_type === 'Power_automate'
    );

    if (!powerAutomateFinding) {
      stopPolling();
      return;
    }

    const findingData = powerAutomateFinding.data;
    
    // Check if data is complete (not pending)
    const hasCompleteData = findingData?.persons && Array.isArray(findingData.persons);
    const isPending = (findingData?.pending === true || findingData?.status === 'pending') && !hasCompleteData;
    const workorderid = findingData?.workorderid;

    // If already complete, stop polling
    if (hasCompleteData || (!isPending && !workorderid)) {
      if (isPollingRef.current) {
        console.log('[PowerAutomate] Results complete, stopping polling');
        stopPolling();
      }
      return;
    }

    if (!workorderid) {
      stopPolling();
      return;
    }

    // If workorder changed, reset polling
    if (lastWorkorderIdRef.current !== workorderid) {
      stopPolling();
      lastWorkorderIdRef.current = workorderid;
      pollCountRef.current = 0;
      setPollCount(0);
    }

    // Already polling for this workorder
    if (isPollingRef.current) {
      return;
    }

    console.log('[PowerAutomate] Starting polling for workorderid:', workorderid);
    isPollingRef.current = true;
    setIsPolling(true);

    // Poll immediately, then every 30 seconds
    const poll = async () => {
      if (!isPollingRef.current) return; // Guard against running after stop
      const result = await pollForResults(workorderid, powerAutomateFinding.id);
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
