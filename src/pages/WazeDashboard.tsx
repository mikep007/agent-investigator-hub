import { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, MapPin, User, Clock, Navigation, AlertTriangle, RefreshCw, HelpCircle, ChevronDown, Download, FileSpreadsheet, FileJson, Sun, Moon } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  exportTrackedUserToCSV,
  exportTrackedUserToJSON,
  exportAllAlertsToCSV,
  exportAllAlertsToJSON,
} from '@/utils/wazeExport';

// Fix for default marker icons in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface WazeAlert {
  id: string;
  username: string;
  type: string;
  subtype: string;
  time: Date;
  lat: number;
  lon: number;
  country: string;
  street?: string;
}

// Custom blue marker icon (matches publish button)
const alertIcon = L.divIcon({
  className: 'custom-alert-marker',
  html: `<div style="
    background-color: #8B5CF6;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid #fff;
    box-shadow: 0 0 8px rgba(139, 92, 246, 0.6);
  "></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

// Tracked user marker (red)
const trackedIcon = L.divIcon({
  className: 'tracked-user-marker',
  html: `<div style="
    background-color: #ef4444;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid #fff;
    box-shadow: 0 0 10px rgba(239, 68, 68, 0.8);
  "></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// Component to handle map bounds changes
function MapBoundsHandler({ onBoundsChange }: { onBoundsChange: (bounds: L.LatLngBounds) => void }) {
  const map = useMapEvents({
    moveend: () => {
      onBoundsChange(map.getBounds());
    },
    zoomend: () => {
      onBoundsChange(map.getBounds());
    },
  });

  useEffect(() => {
    onBoundsChange(map.getBounds());
  }, [map, onBoundsChange]);

  return null;
}

// Component to fit bounds when tracking user
function FitBoundsHandler({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap();

  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, bounds]);

  return null;
}

export default function WazeDashboard() {
  const [alerts, setAlerts] = useState<WazeAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [server, setServer] = useState('row');
  const [username, setUsername] = useState('');
  const [trackedUser, setTrackedUser] = useState<string | null>(null);
  const [trackedPath, setTrackedPath] = useState<[number, number][]>([]);
  const [fitBounds, setFitBounds] = useState<L.LatLngBounds | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [showHowToUse, setShowHowToUse] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const boundsRef = useRef<L.LatLngBounds | null>(null);
  const alertsRef = useRef<Map<string, WazeAlert>>(new Map());

  const parseWazeXml = useCallback((xmlText: string): WazeAlert[] => {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, 'text/xml');
    const entries = xml.getElementsByTagName('alert');
    const newAlerts: WazeAlert[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const location = entry.getElementsByTagName('location')[0];
      const pubMillis = entry.getElementsByTagName('pubMillis')[0]?.textContent;
      
      const lat = parseFloat(location?.getAttribute('y') || '0');
      const lon = parseFloat(location?.getAttribute('x') || '0');
      
      if (lat === 0 && lon === 0) continue;

      const alert: WazeAlert = {
        id: `${lat}-${lon}-${pubMillis}`,
        username: entry.getElementsByTagName('reportBy')[0]?.textContent || 'Anonymous',
        type: entry.getElementsByTagName('type')[0]?.textContent || 'Unknown',
        subtype: entry.getElementsByTagName('subtype')[0]?.textContent || '',
        time: pubMillis ? new Date(parseInt(pubMillis)) : new Date(),
        lat,
        lon,
        country: entry.getElementsByTagName('country')[0]?.textContent || 'Unknown',
        street: entry.getElementsByTagName('street')[0]?.textContent || undefined,
      };

      newAlerts.push(alert);
    }

    return newAlerts;
  }, []);

  const fetchAlerts = useCallback(async () => {
    if (!boundsRef.current) return;

    setLoading(true);
    const bounds = boundsRef.current;
    
    const params = new URLSearchParams({
      left: bounds.getWest().toString(),
      right: bounds.getEast().toString(),
      bottom: bounds.getSouth().toString(),
      top: bounds.getNorth().toString(),
      ma: '600',
      mj: '600',
      mu: '600',
      types: 'alerts',
    });

    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(
      `https://www.waze.com/${server}-rtserver/web/TGeoRSS?${params.toString()}`
    )}`;

    try {
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error('Failed to fetch alerts');
      
      const text = await response.text();
      const newAlerts = parseWazeXml(text);

      // Deduplicate and merge with existing alerts
      newAlerts.forEach(alert => {
        if (!alertsRef.current.has(alert.id)) {
          alertsRef.current.set(alert.id, alert);
        }
      });

      // Keep only last 500 alerts to prevent memory issues
      const allAlerts = Array.from(alertsRef.current.values())
        .sort((a, b) => b.time.getTime() - a.time.getTime())
        .slice(0, 500);

      alertsRef.current = new Map(allAlerts.map(a => [a.id, a]));
      setAlerts(allAlerts);
      setLastUpdate(new Date());
      
      if (newAlerts.length > 0) {
        toast.success(`Fetched ${newAlerts.length} new alerts`);
      }
    } catch (error) {
      console.error('Error fetching alerts:', error);
      toast.error('Failed to fetch Waze alerts. CORS restrictions may apply.');
    } finally {
      setLoading(false);
    }
  }, [server, parseWazeXml]);

  // Auto-update every 3 minutes
  useEffect(() => {
    const interval = setInterval(fetchAlerts, 180000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const handleBoundsChange = useCallback((bounds: L.LatLngBounds) => {
    boundsRef.current = bounds;
  }, []);

  const handleTrackUser = useCallback(() => {
    if (!username.trim()) {
      toast.error('Please enter a username to track');
      return;
    }

    const userAlerts = alerts
      .filter(a => a.username.toLowerCase() === username.toLowerCase().trim())
      .sort((a, b) => a.time.getTime() - b.time.getTime());

    if (userAlerts.length < 1) {
      toast.error('No alerts found for this user in current data');
      return;
    }

    setTrackedUser(username.trim());
    const path = userAlerts.map(a => [a.lat, a.lon] as [number, number]);
    setTrackedPath(path);

    if (userAlerts.length >= 2) {
      const bounds = L.latLngBounds(path.map(p => L.latLng(p[0], p[1])));
      setFitBounds(bounds);
    } else if (userAlerts.length === 1) {
      setFitBounds(L.latLngBounds([
        [userAlerts[0].lat - 0.01, userAlerts[0].lon - 0.01],
        [userAlerts[0].lat + 0.01, userAlerts[0].lon + 0.01]
      ]));
    }

    toast.success(`Tracking ${username}: ${userAlerts.length} location(s) found`);
  }, [username, alerts]);

  const clearTracking = useCallback(() => {
    setTrackedUser(null);
    setTrackedPath([]);
    setFitBounds(null);
    setUsername('');
  }, []);

  const handleExportTrackedCSV = useCallback(() => {
    if (!trackedUser) {
      toast.error('No user being tracked');
      return;
    }
    try {
      exportTrackedUserToCSV(trackedUser, alerts);
      toast.success(`Exported ${trackedPath.length} movement points to CSV`);
    } catch (error) {
      toast.error('No data to export');
    }
  }, [trackedUser, alerts, trackedPath.length]);

  const handleExportTrackedJSON = useCallback(() => {
    if (!trackedUser) {
      toast.error('No user being tracked');
      return;
    }
    try {
      exportTrackedUserToJSON(trackedUser, alerts);
      toast.success(`Exported ${trackedPath.length} movement points to JSON`);
    } catch (error) {
      toast.error('No data to export');
    }
  }, [trackedUser, alerts, trackedPath.length]);

  const handleExportAllCSV = useCallback(() => {
    try {
      exportAllAlertsToCSV(alerts);
      toast.success(`Exported ${alerts.length} alerts to CSV`);
    } catch (error) {
      toast.error('No data to export');
    }
  }, [alerts]);

  const handleExportAllJSON = useCallback(() => {
    try {
      exportAllAlertsToJSON(alerts);
      toast.success(`Exported ${alerts.length} alerts to JSON`);
    } catch (error) {
      toast.error('No data to export');
    }
  }, [alerts]);

  const formatAlertType = (type: string, subtype: string) => {
    const displayType = subtype || type;
    return displayType
      .replace(/_/g, ' ')
      .replace(/HAZARD/g, '⚠️')
      .replace(/JAM/g, '🚗')
      .replace(/POLICE/g, '👮')
      .replace(/ACCIDENT/g, '💥')
      .replace(/ROAD_CLOSED/g, '🚧');
  };

  // Get unique usernames for autocomplete
  const uniqueUsernames = [...new Set(alerts.filter(a => a.username !== 'Anonymous').map(a => a.username))];

  // Theme configuration
  const theme = {
    bg: isDarkMode ? '#1a1a1a' : '#f8fafc',
    bgSecondary: isDarkMode ? '#242424' : '#ffffff',
    border: isDarkMode ? '#333' : '#e2e8f0',
    text: isDarkMode ? '#ffffff' : '#1e293b',
    textSecondary: isDarkMode ? '#888' : '#64748b',
    textMuted: isDarkMode ? '#666' : '#94a3b8',
    cardBg: isDarkMode ? '#242424' : '#ffffff',
    tableBg: isDarkMode ? '#1a1a1a' : '#f1f5f9',
    hoverBg: isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100',
    inputBg: isDarkMode ? 'bg-transparent' : 'bg-white',
    inputBorder: isDarkMode ? 'border-gray-600' : 'border-gray-300',
    inputText: isDarkMode ? 'text-white placeholder:text-gray-500' : 'text-gray-900 placeholder:text-gray-400',
    selectBg: isDarkMode ? 'bg-gray-900' : 'bg-white',
    selectBorder: isDarkMode ? 'border-gray-700' : 'border-gray-200',
    selectText: isDarkMode ? 'text-white' : 'text-gray-900',
    selectHover: isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100',
    buttonOutline: isDarkMode ? 'border-gray-600 text-white hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100',
    mapTile: isDarkMode 
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    statsOverlay: isDarkMode ? 'rgba(26, 26, 26, 0.9)' : 'rgba(255, 255, 255, 0.95)',
  };

  return (
    <div className="h-screen w-screen flex flex-col transition-colors duration-300" style={{ backgroundColor: theme.bg }}>
      {/* Header */}
      <header className="px-6 py-4 border-b transition-colors duration-300" style={{ borderColor: theme.border }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3 transition-colors duration-300" style={{ color: theme.text }}>
              <Navigation className="h-7 w-7 text-primary" />
              Waze Surveillance Dashboard
            </h1>
            <p className="text-sm mt-1 transition-colors duration-300" style={{ color: theme.textSecondary }}>
              Tracking public Waze reports in real-time. Inspired by Palantir's data visualization style.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`h-9 w-9 ${theme.buttonOutline} transition-colors duration-300`}
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Select value={server} onValueChange={setServer}>
              <SelectTrigger className={`w-32 ${theme.inputBg} ${theme.inputBorder} transition-colors duration-300`} style={{ color: theme.text }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={`${theme.selectBg} ${theme.selectBorder} z-50`}>
                <SelectItem value="row" className={`${theme.selectText} ${theme.selectHover}`}>Global (ROW)</SelectItem>
                <SelectItem value="usa" className={`${theme.selectText} ${theme.selectHover}`}>USA</SelectItem>
                <SelectItem value="il" className={`${theme.selectText} ${theme.selectHover}`}>Israel</SelectItem>
              </SelectContent>
            </Select>
            <Collapsible open={showHowToUse} onOpenChange={setShowHowToUse}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className={theme.buttonOutline}>
                  <HelpCircle className="h-4 w-4 mr-2" />
                  How to Use
                  <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${showHowToUse ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
            <Button
              onClick={fetchAlerts}
              disabled={loading}
              className="bg-primary hover:bg-primary/90 text-white"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Refresh</span>
            </Button>
            {lastUpdate && (
              <span className="text-xs transition-colors duration-300" style={{ color: theme.textMuted }}>
                Last update: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        
        {/* How to Use Dropdown */}
        <Collapsible open={showHowToUse} onOpenChange={setShowHowToUse}>
          <CollapsibleContent className="mt-4">
            <Card className="transition-colors duration-300" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm transition-colors duration-300" style={{ color: isDarkMode ? '#d1d5db' : '#4b5563' }}>
                  <div>
                    <h3 className="font-semibold text-primary mb-2 flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Navigate the Map
                    </h3>
                    <ul className="space-y-1" style={{ color: theme.textSecondary }}>
                      <li>• Pan and zoom to your area of interest</li>
                      <li>• Click "Refresh" to fetch alerts for the visible area</li>
                      <li>• Alerts auto-update every 3 minutes</li>
                      <li>• Click any marker for detailed info</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold text-primary mb-2 flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Track Users
                    </h3>
                    <ul className="space-y-1" style={{ color: theme.textSecondary }}>
                      <li>• Enter a username in the sidebar and click "Track"</li>
                      <li>• Red markers show tracked user's locations</li>
                      <li>• Dashed lines connect their movement path</li>
                      <li>• Click any table row to auto-fill the username</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold text-primary mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Understanding Alerts
                    </h3>
                    <ul className="space-y-1" style={{ color: theme.textSecondary }}>
                      <li>• ⚠️ HAZARD: Road hazards reported by users</li>
                      <li>• 🚗 JAM: Traffic congestion reports</li>
                      <li>• 👮 POLICE: Police presence reports</li>
                      <li>• 💥 ACCIDENT: Accident reports</li>
                      <li>• 🚧 ROAD_CLOSED: Road closures</li>
                    </ul>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t text-xs transition-colors duration-300" style={{ borderColor: theme.border, color: theme.textMuted }}>
                  <strong>Note:</strong> This dashboard fetches publicly available data from Waze's GeoRSS feed. 
                  Select a region (Global, USA, Israel) from the dropdown to change the data source. 
                  All data is anonymous and publicly available through Waze's API.
                </div>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map Section (2/3) */}
        <div className="w-2/3 h-full relative">
          <MapContainer
            key={isDarkMode ? 'dark' : 'light'}
            center={[40.15, -75.22]}
            zoom={12}
            className="h-full w-full"
            style={{ background: theme.bg }}
          >
            <TileLayer
              url={theme.mapTile}
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            />
            <MapBoundsHandler onBoundsChange={handleBoundsChange} />
            <FitBoundsHandler bounds={fitBounds} />

            {/* Alert Markers */}
            {alerts.map((alert) => (
              <Marker
                key={alert.id}
                position={[alert.lat, alert.lon]}
                icon={trackedUser && alert.username.toLowerCase() === trackedUser.toLowerCase() ? trackedIcon : alertIcon}
              >
                <Popup className="waze-popup">
                  <div className="p-2" style={{ color: '#333' }}>
                    <div className="font-bold text-lg mb-2">{formatAlertType(alert.type, alert.subtype)}</div>
                    <div className="flex items-center gap-2 text-sm mb-1">
                      <User className="h-3 w-3" />
                      <span>{alert.username}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm mb-1">
                      <Clock className="h-3 w-3" />
                      <span>{alert.time.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm mb-1">
                      <MapPin className="h-3 w-3" />
                      <span>{alert.lat.toFixed(4)}, {alert.lon.toFixed(4)}</span>
                    </div>
                    {alert.street && (
                      <div className="text-xs mt-2 text-gray-600">{alert.street}</div>
                    )}
                    <Button
                      size="sm"
                      className="mt-2 w-full bg-primary hover:bg-primary/90 text-white"
                      onClick={() => {
                        setUsername(alert.username);
                        handleTrackUser();
                      }}
                    >
                      Track This User
                    </Button>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Tracked User Path */}
            {trackedPath.length >= 2 && (
              <Polyline
                positions={trackedPath}
                pathOptions={{
                  color: '#ef4444',
                  weight: 3,
                  opacity: 0.8,
                  dashArray: '5, 10',
                }}
              />
            )}
          </MapContainer>

          {/* Stats Overlay */}
          <div className="absolute bottom-4 left-4 flex gap-2">
            <div className="px-3 py-2 rounded-lg transition-colors duration-300" style={{ backgroundColor: theme.statsOverlay, border: `1px solid ${theme.border}` }}>
              <span className="text-primary font-bold">{alerts.length}</span>
              <span className="ml-1 text-sm transition-colors duration-300" style={{ color: theme.text }}>alerts</span>
            </div>
            <div className="px-3 py-2 rounded-lg transition-colors duration-300" style={{ backgroundColor: theme.statsOverlay, border: `1px solid ${theme.border}` }}>
              <span className="text-primary font-bold">{uniqueUsernames.length}</span>
              <span className="ml-1 text-sm transition-colors duration-300" style={{ color: theme.text }}>unique users</span>
            </div>
          </div>
        </div>

        {/* Sidebar (1/3) */}
        <div className="w-1/3 h-full overflow-hidden flex flex-col border-l transition-colors duration-300" style={{ borderColor: theme.border, backgroundColor: theme.bg }}>
          {/* User Tracking */}
          <Card className="m-4 mb-2 transition-colors duration-300" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2 transition-colors duration-300" style={{ color: theme.text }}>
                <User className="h-4 w-4 text-primary" />
                Track User Movement
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter username..."
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTrackUser()}
                  className={`${theme.inputBg} ${theme.inputBorder} ${theme.inputText} transition-colors duration-300`}
                  list="usernames"
                />
                <datalist id="usernames">
                  {uniqueUsernames.slice(0, 20).map(u => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
                <Button
                  onClick={handleTrackUser}
                  className="bg-primary hover:bg-primary/90 text-white"
                >
                  Track
                </Button>
              </div>
              {trackedUser && (
                <div className="mt-3 p-2 rounded flex items-center justify-between transition-colors duration-300" style={{ backgroundColor: isDarkMode ? '#333' : '#e2e8f0' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-sm transition-colors duration-300" style={{ color: theme.text }}>Tracking: {trackedUser}</span>
                    <span className="text-xs transition-colors duration-300" style={{ color: theme.textSecondary }}>({trackedPath.length} points)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className={`h-7 px-2 ${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className={`${theme.selectBg} ${theme.selectBorder} z-50`}>
                        <DropdownMenuItem onClick={handleExportTrackedCSV} className={`${theme.selectText} ${theme.selectHover} cursor-pointer`}>
                          <FileSpreadsheet className="h-4 w-4 mr-2" />
                          Export as CSV
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleExportTrackedJSON} className={`${theme.selectText} ${theme.selectHover} cursor-pointer`}>
                          <FileJson className="h-4 w-4 mr-2" />
                          Export as JSON
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button variant="ghost" size="sm" onClick={clearTracking} className={`h-7 px-2 ${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                      Clear
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Alerts Table */}
          <Card className="mx-4 flex-1 overflow-hidden flex flex-col transition-colors duration-300" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2 transition-colors duration-300" style={{ color: theme.text }}>
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  Recent Alerts (Last 50)
                </CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className={`h-7 ${theme.buttonOutline}`}>
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Export All
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className={`${theme.selectBg} ${theme.selectBorder} z-50`}>
                    <DropdownMenuItem onClick={handleExportAllCSV} className={`${theme.selectText} ${theme.selectHover} cursor-pointer`}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Export as CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportAllJSON} className={`${theme.selectText} ${theme.selectHover} cursor-pointer`}>
                      <FileJson className="h-4 w-4 mr-2" />
                      Export as JSON
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              <div className="overflow-auto h-full">
                <Table>
                  <TableHeader className="sticky top-0 transition-colors duration-300" style={{ backgroundColor: theme.tableBg }}>
                    <TableRow style={{ borderColor: theme.border }}>
                      <TableHead className="text-xs transition-colors duration-300" style={{ color: theme.textSecondary }}>Username</TableHead>
                      <TableHead className="text-xs transition-colors duration-300" style={{ color: theme.textSecondary }}>Type</TableHead>
                      <TableHead className="text-xs transition-colors duration-300" style={{ color: theme.textSecondary }}>Time</TableHead>
                      <TableHead className="text-xs transition-colors duration-300" style={{ color: theme.textSecondary }}>Location</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.slice(0, 50).map((alert) => (
                      <TableRow
                        key={alert.id}
                        className={`cursor-pointer ${theme.hoverBg} transition-colors duration-300`}
                        style={{ borderColor: theme.border }}
                        onClick={() => {
                          setUsername(alert.username);
                        }}
                      >
                        <TableCell className="text-xs font-medium py-2 transition-colors duration-300" style={{ color: theme.text }}>
                          {alert.username}
                        </TableCell>
                        <TableCell className="text-xs py-2 text-primary">
                          {formatAlertType(alert.type, alert.subtype)}
                        </TableCell>
                        <TableCell className="text-xs py-2 transition-colors duration-300" style={{ color: theme.textSecondary }}>
                          {alert.time.toLocaleTimeString()}
                        </TableCell>
                        <TableCell className="text-xs py-2 font-mono transition-colors duration-300" style={{ color: theme.textSecondary }}>
                          {alert.lat.toFixed(3)}, {alert.lon.toFixed(3)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {alerts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 transition-colors duration-300" style={{ color: theme.textMuted }}>
                          {loading ? (
                            <div className="flex items-center justify-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading alerts...
                            </div>
                          ) : (
                            'No alerts yet. Pan the map and click Refresh.'
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Footer Info */}
          <div className="p-4 text-xs transition-colors duration-300" style={{ color: theme.textMuted }}>
            <p>Auto-updates every 3 minutes. Data from Waze public GeoRSS feed.</p>
            <p className="mt-1">Pan/zoom the map to change coverage area.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
