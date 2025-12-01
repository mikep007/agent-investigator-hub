import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { InvestigationStats } from '@/types/investigation';

export const generateComparisonPDF = async (
  data: InvestigationStats[],
  includeCharts: boolean = true
) => {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let yPosition = 20;

  // Helper function to add new page if needed
  const checkAddPage = (neededSpace: number) => {
    if (yPosition + neededSpace > pageHeight - 20) {
      pdf.addPage();
      yPosition = 20;
      return true;
    }
    return false;
  };

  // Title
  pdf.setFontSize(24);
  pdf.setTextColor(139, 92, 246); // Primary purple color
  pdf.text('Investigation Comparison Report', pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 15;

  // Report metadata
  pdf.setFontSize(10);
  pdf.setTextColor(100, 100, 100);
  pdf.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, yPosition, { align: 'center' });
  pdf.text(`Investigations Compared: ${data.length}`, pageWidth / 2, yPosition + 5, { align: 'center' });
  yPosition += 20;

  // Executive Summary
  pdf.setFontSize(16);
  pdf.setTextColor(0, 0, 0);
  pdf.text('Executive Summary', 15, yPosition);
  yPosition += 8;

  pdf.setFontSize(10);
  const totalFindings = data.reduce((sum, inv) => sum + inv.totalFindings, 0);
  const avgConfidence = data.reduce((sum, inv) => sum + inv.avgConfidence, 0) / data.length;
  const totalBreaches = data.reduce((sum, inv) => sum + inv.breaches, 0);
  const totalPlatforms = new Set(data.flatMap(inv => inv.platforms)).size;

  pdf.text(`• Total Findings Across All Investigations: ${totalFindings}`, 20, yPosition);
  yPosition += 6;
  pdf.text(`• Average Confidence Score: ${avgConfidence.toFixed(1)}%`, 20, yPosition);
  yPosition += 6;
  pdf.text(`• Total Breaches Detected: ${totalBreaches}`, 20, yPosition);
  yPosition += 6;
  pdf.text(`• Unique Platforms Discovered: ${totalPlatforms}`, 20, yPosition);
  yPosition += 15;

  // Investigation Details
  for (let i = 0; i < data.length; i++) {
    const inv = data[i];
    
    checkAddPage(80);

    // Investigation header
    pdf.setFontSize(14);
    pdf.setTextColor(59, 130, 246); // Blue color
    pdf.text(`Investigation ${i + 1}: ${inv.target}`, 15, yPosition);
    yPosition += 8;

    // Status badge simulation
    pdf.setFontSize(9);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`Status: ${inv.status.toUpperCase()}`, 20, yPosition);
    pdf.text(`Created: ${new Date(inv.created_at).toLocaleDateString()}`, 80, yPosition);
    yPosition += 10;

    // Key metrics
    pdf.setFontSize(10);
    pdf.setTextColor(0, 0, 0);
    pdf.text(`Total Findings: ${inv.totalFindings}`, 20, yPosition);
    yPosition += 6;
    pdf.text(`Average Confidence: ${inv.avgConfidence > 0 ? inv.avgConfidence.toFixed(1) + '%' : 'N/A'}`, 20, yPosition);
    yPosition += 6;
    pdf.text(`Platforms Found: ${inv.platforms.length}`, 20, yPosition);
    yPosition += 6;
    pdf.text(`Breaches Detected: ${inv.breaches}`, 20, yPosition);
    yPosition += 10;

    // Findings by type
    if (Object.keys(inv.findingsByType).length > 0) {
      pdf.setFontSize(11);
      pdf.setTextColor(0, 0, 0);
      pdf.text('Findings by Type:', 20, yPosition);
      yPosition += 6;

      pdf.setFontSize(9);
      Object.entries(inv.findingsByType).forEach(([type, count]) => {
        checkAddPage(6);
        pdf.text(`  • ${type}: ${count}`, 25, yPosition);
        yPosition += 5;
      });
      yPosition += 5;
    }

    // Verification status
    pdf.setFontSize(11);
    pdf.setTextColor(0, 0, 0);
    pdf.text('Verification Status:', 20, yPosition);
    yPosition += 6;

    pdf.setFontSize(9);
    pdf.setTextColor(16, 185, 129); // Green
    pdf.text(`Verified: ${inv.verificationStatus.verified}`, 25, yPosition);
    yPosition += 5;
    
    pdf.setTextColor(245, 158, 14); // Yellow
    pdf.text(`Needs Review: ${inv.verificationStatus.needs_review}`, 25, yPosition);
    yPosition += 5;
    
    pdf.setTextColor(239, 68, 68); // Red
    pdf.text(`Inaccurate: ${inv.verificationStatus.inaccurate}`, 25, yPosition);
    yPosition += 5;

    // Top platforms
    if (inv.platforms.length > 0) {
      checkAddPage(25);
      yPosition += 5;
      pdf.setFontSize(11);
      pdf.setTextColor(0, 0, 0);
      pdf.text('Top Platforms:', 20, yPosition);
      yPosition += 6;

      pdf.setFontSize(9);
      const topPlatforms = inv.platforms.slice(0, 10);
      topPlatforms.forEach(platform => {
        checkAddPage(5);
        pdf.text(`  • ${platform}`, 25, yPosition);
        yPosition += 5;
      });
      if (inv.platforms.length > 10) {
        pdf.text(`  ... and ${inv.platforms.length - 10} more`, 25, yPosition);
        yPosition += 5;
      }
    }

    // Add separator between investigations
    yPosition += 5;
    if (i < data.length - 1) {
      checkAddPage(5);
      pdf.setDrawColor(200, 200, 200);
      pdf.line(15, yPosition, pageWidth - 15, yPosition);
      yPosition += 10;
    }
  }

  // Comparison Analysis
  checkAddPage(40);
  yPosition += 10;
  pdf.setFontSize(16);
  pdf.setTextColor(0, 0, 0);
  pdf.text('Comparison Analysis', 15, yPosition);
  yPosition += 10;

  // Highest findings
  const highestFindings = data.reduce((max, inv) => inv.totalFindings > max.totalFindings ? inv : max);
  pdf.setFontSize(11);
  pdf.text('Highest Findings Count:', 20, yPosition);
  yPosition += 6;
  pdf.setFontSize(9);
  pdf.text(`${highestFindings.target}: ${highestFindings.totalFindings} findings`, 25, yPosition);
  yPosition += 10;

  // Highest confidence
  const highestConfidence = data.reduce((max, inv) => inv.avgConfidence > max.avgConfidence ? inv : max);
  pdf.setFontSize(11);
  pdf.text('Highest Confidence Score:', 20, yPosition);
  yPosition += 6;
  pdf.setFontSize(9);
  pdf.text(`${highestConfidence.target}: ${highestConfidence.avgConfidence.toFixed(1)}%`, 25, yPosition);
  yPosition += 10;

  // Most platforms
  const mostPlatforms = data.reduce((max, inv) => inv.platforms.length > max.platforms.length ? inv : max);
  pdf.setFontSize(11);
  pdf.text('Most Platforms Discovered:', 20, yPosition);
  yPosition += 6;
  pdf.setFontSize(9);
  pdf.text(`${mostPlatforms.target}: ${mostPlatforms.platforms.length} platforms`, 25, yPosition);
  yPosition += 10;

  // Capture and add charts if requested
  if (includeCharts) {
    const chartsElement = document.getElementById('comparison-charts');
    if (chartsElement) {
      try {
        pdf.addPage();
        yPosition = 20;
        
        pdf.setFontSize(16);
        pdf.setTextColor(0, 0, 0);
        pdf.text('Visual Analytics', pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 10;

        // Capture charts as canvas
        const canvas = await html2canvas(chartsElement, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff'
        });

        const imgData = canvas.toDataURL('image/png');
        const imgWidth = pageWidth - 30;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        // Split image across pages if too tall
        let heightLeft = imgHeight;
        let position = yPosition;

        pdf.addImage(imgData, 'PNG', 15, position, imgWidth, imgHeight);
        heightLeft -= (pageHeight - position - 20);

        while (heightLeft > 0) {
          pdf.addPage();
          position = heightLeft - imgHeight + 20;
          pdf.addImage(imgData, 'PNG', 15, position, imgWidth, imgHeight);
          heightLeft -= (pageHeight - 20);
        }
      } catch (error) {
        console.error('Error capturing charts:', error);
      }
    }
  }

  // Footer on last page
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text(
      `OSINT Agent Orchestra - Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }

  // Save the PDF
  const fileName = `investigation-comparison-${new Date().toISOString().split('T')[0]}.pdf`;
  pdf.save(fileName);
};
