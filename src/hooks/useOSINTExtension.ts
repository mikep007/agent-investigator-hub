import { useState, useEffect, useCallback } from 'react';

// Extension ID will be dynamic based on installation
// The extension uses externally_connectable to allow our domains

interface ExtensionStatus {
  connected: boolean;
  version: string | null;
  name: string | null;
}

interface SupportedSite {
  domain: string;
  name: string;
  types: string[];
}

interface ScrapeResult {
  success: boolean;
  data?: any;
  error?: string;
}

// Chrome extension runtime type
declare global {
  interface Window {
    chrome?: {
      runtime?: {
        sendMessage: (
          extensionId: string,
          message: any,
          callback: (response: any) => void
        ) => void;
      };
    };
  }
}

// We'll try to detect the extension by sending a message
// The extension must be configured to accept messages from our domain
const EXTENSION_ID_STORAGE_KEY = 'osint_extension_id';

export function useOSINTExtension() {
  const [status, setStatus] = useState<ExtensionStatus>({
    connected: false,
    version: null,
    name: null,
  });
  const [supportedSites, setSupportedSites] = useState<SupportedSite[]>([]);
  const [extensionId, setExtensionId] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  // Try to detect the extension
  const detectExtension = useCallback(async () => {
    setIsChecking(true);
    
    // Check if we're in a browser that supports extensions
    if (typeof window === 'undefined' || !window.chrome?.runtime?.sendMessage) {
      setStatus({ connected: false, version: null, name: null });
      setIsChecking(false);
      return false;
    }

    // Try stored extension ID first
    const storedId = localStorage.getItem(EXTENSION_ID_STORAGE_KEY);
    
    // List of possible extension IDs to try (user might have different installations)
    const idsToTry = storedId ? [storedId] : [];
    
    // Also check for the extension by trying common patterns
    // The extension will respond to PING messages
    for (const id of idsToTry) {
      try {
        const result = await pingExtension(id);
        if (result) {
          setExtensionId(id);
          localStorage.setItem(EXTENSION_ID_STORAGE_KEY, id);
          setStatus({
            connected: true,
            version: result.version,
            name: result.name,
          });
          
          // Get supported sites
          const sites = await getSupportedSites(id);
          setSupportedSites(sites);
          
          setIsChecking(false);
          return true;
        }
      } catch (e) {
        console.log('Extension not found at ID:', id);
      }
    }

    setStatus({ connected: false, version: null, name: null });
    setIsChecking(false);
    return false;
  }, []);

  // Ping the extension to check if it's available
  const pingExtension = (id: string): Promise<{ version: string; name: string } | null> => {
    return new Promise((resolve) => {
      if (!window.chrome?.runtime?.sendMessage) {
        resolve(null);
        return;
      }

      const timeout = setTimeout(() => resolve(null), 2000);

      try {
        window.chrome.runtime.sendMessage(id, { type: 'PING' }, (response) => {
          clearTimeout(timeout);
          if (response?.success) {
            resolve({ version: response.version, name: response.name });
          } else {
            resolve(null);
          }
        });
      } catch (e) {
        clearTimeout(timeout);
        resolve(null);
      }
    });
  };

  // Get supported sites from extension
  const getSupportedSites = (id: string): Promise<SupportedSite[]> => {
    return new Promise((resolve) => {
      if (!window.chrome?.runtime?.sendMessage) {
        resolve([]);
        return;
      }

      try {
        window.chrome.runtime.sendMessage(id, { type: 'GET_SUPPORTED_SITES' }, (response) => {
          if (response?.success) {
            resolve(response.sites);
          } else {
            resolve([]);
          }
        });
      } catch (e) {
        resolve([]);
      }
    });
  };

  // Request a scrape from the extension
  const scrapeUrl = useCallback(async (url: string, searchType?: string): Promise<ScrapeResult> => {
    if (!extensionId || !window.chrome?.runtime?.sendMessage) {
      return { success: false, error: 'Extension not connected' };
    }

    return new Promise((resolve) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Request timeout' });
      }, 35000);

      try {
        window.chrome.runtime.sendMessage(
          extensionId,
          {
            type: 'SCRAPE_REQUEST',
            url,
            requestId,
            searchType,
          },
          (response) => {
            clearTimeout(timeout);
            if (response?.success) {
              resolve({ success: true, data: response.data });
            } else {
              resolve({ success: false, error: response?.error || 'Scrape failed' });
            }
          }
        );
      } catch (e) {
        clearTimeout(timeout);
        resolve({ success: false, error: 'Failed to communicate with extension' });
      }
    });
  }, [extensionId]);

  // Connect with a specific extension ID
  const connectWithId = useCallback(async (id: string): Promise<boolean> => {
    const result = await pingExtension(id);
    if (result) {
      setExtensionId(id);
      localStorage.setItem(EXTENSION_ID_STORAGE_KEY, id);
      setStatus({
        connected: true,
        version: result.version,
        name: result.name,
      });
      
      const sites = await getSupportedSites(id);
      setSupportedSites(sites);
      
      return true;
    }
    return false;
  }, []);

  // Check if a URL is supported for scraping
  const isUrlSupported = useCallback((url: string): boolean => {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');
      return supportedSites.some(site => domain.includes(site.domain));
    } catch {
      return false;
    }
  }, [supportedSites]);

  // Get site info for a URL
  const getSiteInfo = useCallback((url: string): SupportedSite | null => {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');
      return supportedSites.find(site => domain.includes(site.domain)) || null;
    } catch {
      return null;
    }
  }, [supportedSites]);

  // Auto-detect on mount
  useEffect(() => {
    detectExtension();
  }, [detectExtension]);

  return {
    status,
    supportedSites,
    isChecking,
    scrapeUrl,
    detectExtension,
    connectWithId,
    isUrlSupported,
    getSiteInfo,
  };
}

export type { ExtensionStatus, SupportedSite, ScrapeResult };
