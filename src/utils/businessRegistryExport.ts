// Business Registry Export utilities for CSV and PDF

import { jsPDF } from 'jspdf';

export interface BusinessResult {
  entityNumber?: string;
  documentNumber?: string;
  entityName: string;
  status: string;
  entityType?: string;
  filingType?: string;
  jurisdiction?: string;
  formationDate?: string;
  dateField?: string;
  address?: string;
  principalAddress?: string;
  mailingAddress?: string;
  agent?: string;
  registeredAgent?: string;
  officers?: Array<{ title: string; name: string }>;
  detailUrl: string;
  matchType?: string;
  confidence?: number;
  state?: string;
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

export const exportBusinessRegistryToCSV = (
  results: BusinessResult[],
  targetName?: string
): void => {
  const rows: string[][] = [];
  
  // CSV Header
  rows.push([
    'Entity Name',
    'Status',
    'Entity Type',
    'Jurisdiction',
    'Entity Number',
    'Formation Date',
    'Principal Address',
    'Registered Agent',
    'Officers',
    'Match Type',
    'Confidence',
    'Registry URL'
  ]);
  
  // Add data rows
  results.forEach(business => {
    const officers = business.officers?.map(o => 
      o.title ? `${o.name} (${o.title})` : o.name
    ).join('; ') || '';
    
    rows.push([
      escapeCSV(business.entityName || ''),
      escapeCSV(business.status || ''),
      escapeCSV(business.entityType || business.filingType || ''),
      escapeCSV(business.jurisdiction || ''),
      escapeCSV(business.entityNumber || business.documentNumber || ''),
      escapeCSV(business.formationDate || business.dateField || ''),
      escapeCSV(business.principalAddress || business.address || ''),
      escapeCSV(business.registeredAgent || business.agent || ''),
      escapeCSV(officers),
      escapeCSV(business.matchType || ''),
      business.confidence ? `${Math.round(business.confidence * 100)}%` : '',
      escapeCSV(business.detailUrl || '')
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
    ? `business-registry-${sanitizeFilename(targetName)}-${timestamp}.csv`
    : `business-registry-${timestamp}.csv`;
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportBusinessRegistryToPDF = (
  results: BusinessResult[],
  targetName?: string
): void => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  let y = margin;
  
  const checkAddPage = (height: number) => {
    if (y + height > pageHeight - margin) {
      doc.addPage();
      y = margin;
      return true;
    }
    return false;
  };
  
  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Business Registry Report', margin, y);
  y += 10;
  
  // Subtitle with target and date
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  if (targetName) {
    doc.text(`Target: ${targetName}`, margin, y);
    y += 5;
  }
  doc.text(`Generated: ${reportDate}`, margin, y);
  y += 5;
  doc.text(`Total Records: ${results.length}`, margin, y);
  y += 10;
  
  doc.setTextColor(0);
  
  // Divider line
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;
  
  // Business entries
  results.forEach((business, index) => {
    // Check if we need a new page (estimate ~60px per business entry)
    checkAddPage(70);
    
    // Entity name header
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    const entityTitle = `${index + 1}. ${business.entityName}`;
    doc.text(entityTitle, margin, y);
    y += 7;
    
    // Status and type badges
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const statusText = `Status: ${business.status || 'Unknown'}`;
    const typeText = business.entityType || business.filingType ? ` | Type: ${business.entityType || business.filingType}` : '';
    const jurisdictionText = business.jurisdiction ? ` | Jurisdiction: ${business.jurisdiction}` : '';
    doc.text(statusText + typeText + jurisdictionText, margin, y);
    y += 6;
    
    // Entity number and formation date
    if (business.entityNumber || business.formationDate) {
      const entityNumText = business.entityNumber ? `Entity #: ${business.entityNumber}` : '';
      const dateText = business.formationDate || business.dateField ? 
        `${entityNumText ? ' | ' : ''}Filed: ${business.formationDate || business.dateField}` : '';
      doc.text(entityNumText + dateText, margin, y);
      y += 6;
    }
    
    // Address
    if (business.principalAddress || business.address) {
      checkAddPage(10);
      doc.setFont('helvetica', 'italic');
      const addressLines = doc.splitTextToSize(
        `Address: ${business.principalAddress || business.address}`,
        pageWidth - 2 * margin
      );
      doc.text(addressLines, margin, y);
      y += addressLines.length * 4 + 2;
    }
    
    // Registered Agent
    if (business.registeredAgent || business.agent) {
      checkAddPage(6);
      doc.setFont('helvetica', 'normal');
      doc.text(`Registered Agent: ${business.registeredAgent || business.agent}`, margin, y);
      y += 6;
    }
    
    // Officers
    if (business.officers && business.officers.length > 0) {
      checkAddPage(10);
      doc.text('Officers & Directors:', margin, y);
      y += 5;
      business.officers.forEach(officer => {
        checkAddPage(5);
        const officerText = officer.title ? `  • ${officer.name} (${officer.title})` : `  • ${officer.name}`;
        doc.text(officerText, margin, y);
        y += 4;
      });
      y += 2;
    }
    
    // Confidence
    if (business.confidence) {
      doc.setTextColor(100);
      doc.text(`Confidence: ${Math.round(business.confidence * 100)}%`, margin, y);
      doc.setTextColor(0);
      y += 6;
    }
    
    // Registry URL
    doc.setTextColor(50, 100, 150);
    doc.setFontSize(8);
    const urlLines = doc.splitTextToSize(business.detailUrl, pageWidth - 2 * margin);
    doc.text(urlLines, margin, y);
    doc.setTextColor(0);
    y += urlLines.length * 3 + 8;
    
    // Separator between entries
    if (index < results.length - 1) {
      doc.setDrawColor(230);
      doc.line(margin, y - 4, pageWidth - margin, y - 4);
    }
  });
  
  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Business Registry Report - Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }
  
  // Save
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = targetName 
    ? `business-registry-${sanitizeFilename(targetName)}-${timestamp}.pdf`
    : `business-registry-${timestamp}.pdf`;
  
  doc.save(filename);
};
