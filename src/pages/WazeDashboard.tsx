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
import { Loader2, MapPin, User, Clock, Navigation, AlertTriangle, RefreshCw, HelpCircle, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

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

  return (
    <div className="h-screen w-screen flex flex-col" style={{ backgroundColor: '#1a1a1a' }}>
      {/* Header */}
      <header className="px-6 py-4 border-b" style={{ borderColor: '#333' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Navigation className="h-7 w-7 text-primary" />
              Waze Surveillance Dashboard
            </h1>
            <p className="text-sm mt-1" style={{ color: '#888' }}>
              Tracking public Waze reports in real-time. Inspired by Palantir's data visualization style.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Select value={server} onValueChange={setServer}>
              <SelectTrigger className="w-32 bg-transparent border-gray-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-700">
                <SelectItem value="row" className="text-white hover:bg-gray-800">Global (ROW)</SelectItem>
                <SelectItem value="usa" className="text-white hover:bg-gray-800">USA</SelectItem>
                <SelectItem value="il" className="text-white hover:bg-gray-800">Israel</SelectItem>
              </SelectContent>
            </Select>
            <Collapsible open={showHowToUse} onOpenChange={setShowHowToUse}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="border-gray-600 text-white hover:bg-gray-800">
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
              <span className="text-xs" style={{ color: '#666' }}>
                Last update: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        
        {/* How to Use Dropdown */}
        <Collapsible open={showHowToUse} onOpenChange={setShowHowToUse}>
          <CollapsibleContent className="mt-4">
            <Card className="bg-gray-900 border-gray-700">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-gray-300">
                  <div>
                    <h3 className="font-semibold text-primary mb-2 flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Navigate the Map
                    </h3>
                    <ul className="space-y-1 text-gray-400">
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
                    <ul className="space-y-1 text-gray-400">
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
                    <ul className="space-y-1 text-gray-400">
                      <li>• ⚠️ HAZARD: Road hazards reported by users</li>
                      <li>• 🚗 JAM: Traffic congestion reports</li>
                      <li>• 👮 POLICE: Police presence reports</li>
                      <li>• 💥 ACCIDENT: Accident reports</li>
                      <li>• 🚧 ROAD_CLOSED: Road closures</li>
                    </ul>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-700 text-xs text-gray-500">
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
            center={[40.15, -75.22]}
            zoom={12}
            className="h-full w-full"
            style={{ background: '#1a1a1a' }}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
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
            <div className="px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(26, 26, 26, 0.9)', border: '1px solid #333' }}>
              <span className="text-primary font-bold">{alerts.length}</span>
              <span className="text-white ml-1 text-sm">alerts</span>
            </div>
            <div className="px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(26, 26, 26, 0.9)', border: '1px solid #333' }}>
              <span className="text-primary font-bold">{uniqueUsernames.length}</span>
              <span className="text-white ml-1 text-sm">unique users</span>
            </div>
          </div>
        </div>

        {/* Sidebar (1/3) */}
        <div className="w-1/3 h-full overflow-hidden flex flex-col border-l" style={{ borderColor: '#333', backgroundColor: '#1a1a1a' }}>
          {/* User Tracking */}
          <Card className="m-4 mb-2" style={{ backgroundColor: '#242424', borderColor: '#333' }}>
            <CardHeader className="py-3">
              <CardTitle className="text-white text-sm flex items-center gap-2">
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
                  className="bg-transparent border-gray-600 text-white placeholder:text-gray-500"
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
                <div className="mt-3 p-2 rounded flex items-center justify-between" style={{ backgroundColor: '#333' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-white text-sm">Tracking: {trackedUser}</span>
                    <span className="text-gray-400 text-xs">({trackedPath.length} points)</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={clearTracking} className="text-gray-400 hover:text-white">
                    Clear
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Alerts Table */}
          <Card className="mx-4 flex-1 overflow-hidden flex flex-col" style={{ backgroundColor: '#242424', borderColor: '#333' }}>
            <CardHeader className="py-3">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-primary" />
                Recent Alerts (Last 50)
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              <div className="overflow-auto h-full">
                <Table>
                  <TableHeader className="sticky top-0" style={{ backgroundColor: '#1a1a1a' }}>
                    <TableRow style={{ borderColor: '#333' }}>
                      <TableHead className="text-gray-400 text-xs">Username</TableHead>
                      <TableHead className="text-gray-400 text-xs">Type</TableHead>
                      <TableHead className="text-gray-400 text-xs">Time</TableHead>
                      <TableHead className="text-gray-400 text-xs">Location</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.slice(0, 50).map((alert) => (
                      <TableRow
                        key={alert.id}
                        className="cursor-pointer hover:bg-gray-800"
                        style={{ borderColor: '#333' }}
                        onClick={() => {
                          setUsername(alert.username);
                        }}
                      >
                        <TableCell className="text-white text-xs font-medium py-2">
                          {alert.username}
                        </TableCell>
                        <TableCell className="text-xs py-2 text-primary">
                          {formatAlertType(alert.type, alert.subtype)}
                        </TableCell>
                        <TableCell className="text-gray-400 text-xs py-2">
                          {alert.time.toLocaleTimeString()}
                        </TableCell>
                        <TableCell className="text-gray-400 text-xs py-2 font-mono">
                          {alert.lat.toFixed(3)}, {alert.lon.toFixed(3)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {alerts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-gray-500 py-8">
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
          <div className="p-4 text-xs" style={{ color: '#555' }}>
            <p>Auto-updates every 3 minutes. Data from Waze public GeoRSS feed.</p>
            <p className="mt-1">Pan/zoom the map to change coverage area.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
