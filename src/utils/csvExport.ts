// CSV Export utility for OSINT investigation results

export interface WebResultItem {
  title?: string;
  link?: string;
  snippet?: string;
  displayLink?: string;
  confidence?: number;
}

export const exportWebResultsToCSV = (
  confirmedItems: WebResultItem[],
  possibleItems: WebResultItem[],
  targetName?: string
): void => {
  const rows: string[][] = [];
  
  // CSV Header
  rows.push(['Category', 'Title', 'URL', 'Domain', 'Snippet', 'Confidence Score']);
  
  // Add confirmed items
  confirmedItems.forEach(item => {
    rows.push([
      'Confirmed Match',
      escapeCSV(item.title || ''),
      escapeCSV(item.link || ''),
      escapeCSV(item.displayLink || ''),
      escapeCSV(item.snippet || ''),
      item.confidence ? `${Math.round(item.confidence * 100)}%` : 'N/A'
    ]);
  });
  
  // Add possible items
  possibleItems.forEach(item => {
    rows.push([
      'Possible Match',
      escapeCSV(item.title || ''),
      escapeCSV(item.link || ''),
      escapeCSV(item.displayLink || ''),
      escapeCSV(item.snippet || ''),
      item.confidence ? `${Math.round(item.confidence * 100)}%` : 'N/A'
    ]);
  });
  
  // Convert to CSV string
  const csvContent = rows.map(row => row.join(',')).join('\n');
  
  // Create and trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = targetName 
    ? `web-results-${sanitizeFilename(targetName)}-${timestamp}.csv`
    : `web-results-${timestamp}.csv`;
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const escapeCSV = (value: string): string => {
  if (!value) return '';
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
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
