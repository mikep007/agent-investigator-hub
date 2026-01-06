import jsPDF from "jspdf";

interface AnalysisResult {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  keyFindings: string[];
  patterns: string[];
  relatedPersons: string[];
  recommendations: string[];
  anomalies: string[];
}

export const generateAnalysisPDF = (analysis: AnalysisResult, target?: string) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  const checkAddPage = (requiredSpace: number) => {
    if (y + requiredSpace > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      y = 20;
      return true;
    }
    return false;
  };

  const addWrappedText = (text: string, x: number, maxWidth: number, fontSize: number = 10) => {
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, maxWidth);
    lines.forEach((line: string) => {
      checkAddPage(8);
      doc.text(line, x, y);
      y += fontSize * 0.5;
    });
    return lines.length;
  };

  // Title
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("AI Investigation Analysis Report", margin, y);
  y += 12;

  // Metadata
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  if (target) {
    doc.text(`Target: ${target}`, margin, y);
    y += 6;
  }
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y);
  y += 12;

  // Divider
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // Risk Assessment Section
  doc.setTextColor(0);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Risk Assessment", margin, y);
  y += 8;

  // Risk Level Badge
  const riskColors: Record<string, [number, number, number]> = {
    critical: [220, 38, 38],
    high: [234, 88, 12],
    medium: [202, 138, 4],
    low: [22, 163, 74],
  };
  const riskColor = riskColors[analysis.riskLevel] || [100, 100, 100];
  doc.setFillColor(...riskColor);
  doc.roundedRect(margin, y, 60, 8, 2, 2, 'F');
  doc.setTextColor(255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`${analysis.riskLevel.toUpperCase()} RISK`, margin + 5, y + 5.5);
  y += 14;

  // Summary
  doc.setTextColor(60);
  doc.setFont("helvetica", "normal");
  addWrappedText(analysis.summary, margin, contentWidth, 10);
  y += 8;

  // Key Findings
  if (analysis.keyFindings?.length > 0) {
    checkAddPage(30);
    doc.setTextColor(0);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Key Findings", margin, y);
    y += 8;

    doc.setTextColor(60);
    doc.setFont("helvetica", "normal");
    analysis.keyFindings.forEach((finding, index) => {
      checkAddPage(15);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(`${index + 1}.`, margin, y);
      doc.setFont("helvetica", "normal");
      addWrappedText(finding, margin + 8, contentWidth - 8, 10);
      y += 4;
    });
    y += 4;
  }

  // Patterns Detected
  if (analysis.patterns?.length > 0) {
    checkAddPage(30);
    doc.setTextColor(0);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Patterns Detected", margin, y);
    y += 8;

    doc.setTextColor(60);
    doc.setFont("helvetica", "normal");
    analysis.patterns.forEach((pattern) => {
      checkAddPage(15);
      doc.setFontSize(10);
      doc.text("•", margin, y);
      addWrappedText(pattern, margin + 6, contentWidth - 6, 10);
      y += 2;
    });
    y += 4;
  }

  // Related Persons
  if (analysis.relatedPersons?.length > 0) {
    checkAddPage(30);
    doc.setTextColor(0);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Related Persons", margin, y);
    y += 8;

    doc.setTextColor(60);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const personsText = analysis.relatedPersons.join(", ");
    addWrappedText(personsText, margin, contentWidth, 10);
    y += 4;
  }

  // Anomalies
  if (analysis.anomalies?.length > 0) {
    checkAddPage(30);
    doc.setTextColor(220, 38, 38);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Anomalies & Red Flags", margin, y);
    y += 8;

    doc.setTextColor(60);
    doc.setFont("helvetica", "normal");
    analysis.anomalies.forEach((anomaly) => {
      checkAddPage(15);
      doc.setFontSize(10);
      doc.text("⚠", margin, y);
      addWrappedText(anomaly, margin + 8, contentWidth - 8, 10);
      y += 2;
    });
    y += 4;
  }

  // Recommendations
  if (analysis.recommendations?.length > 0) {
    checkAddPage(30);
    doc.setTextColor(0);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Recommended Next Steps", margin, y);
    y += 8;

    doc.setTextColor(60);
    doc.setFont("helvetica", "normal");
    analysis.recommendations.forEach((rec, index) => {
      checkAddPage(15);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(`${index + 1}.`, margin, y);
      doc.setFont("helvetica", "normal");
      addWrappedText(rec, margin + 8, contentWidth - 8, 10);
      y += 4;
    });
  }

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Page ${i} of ${totalPages} | AI Investigation Analysis Report`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
  }

  // Save
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = target 
    ? `analysis-${target.replace(/[^a-zA-Z0-9]/g, '_')}-${timestamp}.pdf`
    : `analysis-report-${timestamp}.pdf`;
  doc.save(filename);
};
