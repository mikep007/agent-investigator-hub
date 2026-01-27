// Waze tracked user movement data export utilities

export interface WazeAlertExport {
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

export interface TrackedUserExportData {
  username: string;
  exportedAt: string;
  totalPoints: number;
  path: Array<{
    lat: number;
    lon: number;
    time: string;
    type: string;
    subtype: string;
    street?: string;
  }>;
}

const escapeCSV = (value: string): string => {
  if (!value) return '';
  const escaped = value.replace(/"/g, '""');
  if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')) {
    return `"${escaped}"`;
  }
  return escaped;
};

const sanitizeFilename = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);
};

export const exportTrackedUserToCSV = (
  username: string,
  alerts: WazeAlertExport[]
): void => {
  const userAlerts = alerts
    .filter(a => a.username.toLowerCase() === username.toLowerCase())
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  if (userAlerts.length === 0) {
    throw new Error('No data to export');
  }

  const rows: string[][] = [];
  
  // CSV Header
  rows.push(['Sequence', 'Username', 'Timestamp', 'Latitude', 'Longitude', 'Type', 'Subtype', 'Street', 'Country']);
  
  // Add user alerts
  userAlerts.forEach((alert, idx) => {
    rows.push([
      (idx + 1).toString(),
      escapeCSV(alert.username),
      alert.time.toISOString(),
      alert.lat.toFixed(6),
      alert.lon.toFixed(6),
      escapeCSV(alert.type),
      escapeCSV(alert.subtype || ''),
      escapeCSV(alert.street || ''),
      escapeCSV(alert.country)
    ]);
  });
  
  // Convert to CSV string
  const csvContent = rows.map(row => row.join(',')).join('\n');
  
  // Create and trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `waze-track-${sanitizeFilename(username)}-${timestamp}.csv`;
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportTrackedUserToJSON = (
  username: string,
  alerts: WazeAlertExport[]
): void => {
  const userAlerts = alerts
    .filter(a => a.username.toLowerCase() === username.toLowerCase())
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  if (userAlerts.length === 0) {
    throw new Error('No data to export');
  }

  const exportData: TrackedUserExportData = {
    username,
    exportedAt: new Date().toISOString(),
    totalPoints: userAlerts.length,
    path: userAlerts.map(alert => ({
      lat: alert.lat,
      lon: alert.lon,
      time: alert.time.toISOString(),
      type: alert.type,
      subtype: alert.subtype || '',
      street: alert.street,
    }))
  };

  const jsonContent = JSON.stringify(exportData, null, 2);
  
  // Create and trigger download
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `waze-track-${sanitizeFilename(username)}-${timestamp}.json`;
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportAllAlertsToCSV = (alerts: WazeAlertExport[]): void => {
  if (alerts.length === 0) {
    throw new Error('No data to export');
  }

  const sortedAlerts = [...alerts].sort((a, b) => b.time.getTime() - a.time.getTime());

  const rows: string[][] = [];
  
  // CSV Header
  rows.push(['ID', 'Username', 'Timestamp', 'Latitude', 'Longitude', 'Type', 'Subtype', 'Street', 'Country']);
  
  sortedAlerts.forEach(alert => {
    rows.push([
      escapeCSV(alert.id),
      escapeCSV(alert.username),
      alert.time.toISOString(),
      alert.lat.toFixed(6),
      alert.lon.toFixed(6),
      escapeCSV(alert.type),
      escapeCSV(alert.subtype || ''),
      escapeCSV(alert.street || ''),
      escapeCSV(alert.country)
    ]);
  });
  
  const csvContent = rows.map(row => row.join(',')).join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `waze-alerts-${timestamp}.csv`;
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportAllAlertsToJSON = (alerts: WazeAlertExport[]): void => {
  if (alerts.length === 0) {
    throw new Error('No data to export');
  }

  const sortedAlerts = [...alerts].sort((a, b) => b.time.getTime() - a.time.getTime());

  const exportData = {
    exportedAt: new Date().toISOString(),
    totalAlerts: alerts.length,
    alerts: sortedAlerts.map(alert => ({
      id: alert.id,
      username: alert.username,
      time: alert.time.toISOString(),
      lat: alert.lat,
      lon: alert.lon,
      type: alert.type,
      subtype: alert.subtype || '',
      street: alert.street,
      country: alert.country
    }))
  };

  const jsonContent = JSON.stringify(exportData, null, 2);
  
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `waze-alerts-${timestamp}.json`;
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
