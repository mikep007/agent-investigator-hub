import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

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

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    isPollingRef.current = false;
  }, []);

  const pollForResults = useCallback(async (workorderid: string, findingId: string) => {
    console.log('[PowerAutomate] Polling for results, workorderid:', workorderid);
    
    try {
      const { data, error } = await supabase.functions.invoke('osint-power-automate-poll', {
        body: { workorderid }
      });

      if (error) {
        console.error('[PowerAutomate] Poll error:', error);
        return { stillPending: true };
      }

      if (data?.pending) {
        console.log('[PowerAutomate] Results still pending');
        return { stillPending: true };
      }

      if (data?.success && data?.data) {
        console.log('[PowerAutomate] Results received!', data.data);
        
        // Update the finding with the new results
        const { error: updateError } = await supabase
          .from('findings')
          .update({
            data: data.data,
            confidence_score: 75,
            verification_status: 'complete'
          })
          .eq('id', findingId);

        if (updateError) {
          console.error('[PowerAutomate] Failed to update finding:', updateError);
        }
        
        onResultsReceived?.();
        return { stillPending: false };
      }

      return { stillPending: true };
    } catch (err) {
      console.error('[PowerAutomate] Poll exception:', err);
      return { stillPending: true };
    }
  }, [onResultsReceived]);

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
    const isPending = findingData?.pending === true || findingData?.status === 'pending';
    const workorderid = findingData?.workorderid;

    if (!isPending || !workorderid) {
      stopPolling();
      return;
    }

    // Already polling
    if (isPollingRef.current) {
      return;
    }

    console.log('[PowerAutomate] Starting polling for workorderid:', workorderid);
    isPollingRef.current = true;

    // Poll immediately, then every 30 seconds
    const poll = async () => {
      const result = await pollForResults(workorderid, powerAutomateFinding.id);
      if (!result.stillPending) {
        stopPolling();
      }
    };

    poll(); // Initial poll

    pollingIntervalRef.current = setInterval(poll, 30000); // 30 seconds

    return () => {
      stopPolling();
    };
  }, [investigationId, findings, pollForResults, stopPolling]);

  return {
    isPolling: isPollingRef.current,
    stopPolling
  };
}
