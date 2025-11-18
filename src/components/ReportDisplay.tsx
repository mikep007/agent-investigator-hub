import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { FileText, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import jsPDF from "jspdf";
import { useToast } from "@/hooks/use-toast";

interface ReportDisplayProps {
  report: string;
  target: string;
  generatedAt: string;
  findingsCount: number;
}

const ReportDisplay = ({ report, target, generatedAt, findingsCount }: ReportDisplayProps) => {
  const { toast } = useToast();

  const exportToPDF = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const maxWidth = pageWidth - 2 * margin;
      let yPosition = margin;

      // Helper to add new page if needed
      const checkPageBreak = (requiredSpace: number) => {
        if (yPosition + requiredSpace > pageHeight - margin) {
          doc.addPage();
          yPosition = margin;
          return true;
        }
        return false;
      };

      // Title
      doc.setFontSize(20);
      doc.setFont(undefined, 'bold');
      doc.text('OSINT Investigation Report', margin, yPosition);
      yPosition += 10;

      // Metadata
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(`Target: ${target}`, margin, yPosition);
      yPosition += 6;
      doc.text(`Generated: ${new Date(generatedAt).toLocaleString()}`, margin, yPosition);
      yPosition += 6;
      doc.text(`Total Findings: ${findingsCount}`, margin, yPosition);
      yPosition += 12;

      // Process markdown content
      const lines = report.split('\n');
      
      for (const line of lines) {
        if (!line.trim()) {
          yPosition += 4;
          continue;
        }

        checkPageBreak(20);

        // Headers
        if (line.startsWith('# ')) {
          doc.setFontSize(18);
          doc.setFont(undefined, 'bold');
          const text = line.replace('# ', '');
          doc.text(text, margin, yPosition);
          yPosition += 10;
        } else if (line.startsWith('## ')) {
          doc.setFontSize(14);
          doc.setFont(undefined, 'bold');
          const text = line.replace('## ', '');
          doc.text(text, margin, yPosition);
          yPosition += 8;
        } else if (line.startsWith('### ')) {
          doc.setFontSize(12);
          doc.setFont(undefined, 'bold');
          const text = line.replace('### ', '');
          doc.text(text, margin, yPosition);
          yPosition += 7;
        } else if (line.startsWith('**') && line.endsWith('**')) {
          // Bold text
          doc.setFontSize(11);
          doc.setFont(undefined, 'bold');
          const text = line.replace(/\*\*/g, '');
          const wrappedText = doc.splitTextToSize(text, maxWidth);
          doc.text(wrappedText, margin, yPosition);
          yPosition += wrappedText.length * 6;
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
          // Bullet points
          doc.setFontSize(10);
          doc.setFont(undefined, 'normal');
          const text = line.replace(/^[-*] /, '');
          const wrappedText = doc.splitTextToSize(`• ${text}`, maxWidth - 5);
          doc.text(wrappedText, margin + 5, yPosition);
          yPosition += wrappedText.length * 5;
        } else if (/^\d+\./.test(line)) {
          // Numbered lists
          doc.setFontSize(10);
          doc.setFont(undefined, 'normal');
          const wrappedText = doc.splitTextToSize(line, maxWidth - 5);
          doc.text(wrappedText, margin + 5, yPosition);
          yPosition += wrappedText.length * 5;
        } else {
          // Regular text
          doc.setFontSize(10);
          doc.setFont(undefined, 'normal');
          const cleanText = line.replace(/\*\*/g, '').replace(/\*/g, '');
          const wrappedText = doc.splitTextToSize(cleanText, maxWidth);
          doc.text(wrappedText, margin, yPosition);
          yPosition += wrappedText.length * 5;
        }
      }

      // Save PDF
      const fileName = `OSINT_Report_${target.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);

      toast({
        title: "PDF Exported",
        description: "Report has been downloaded successfully",
      });
    } catch (error) {
      console.error('PDF export error:', error);
      toast({
        title: "Export Failed",
        description: "Failed to generate PDF report",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-start gap-3">
          <FileText className="h-6 w-6 text-primary mt-1" />
          <div className="flex-1">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>OSINT Investigation Report</CardTitle>
                <CardDescription className="mt-2">
                  Target: <span className="font-medium text-foreground">{target}</span>
                  <br />
                  Generated: {new Date(generatedAt).toLocaleString()}
                  <br />
                  Total Findings: {findingsCount}
                </CardDescription>
              </div>
              <Button onClick={exportToPDF} variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                Export PDF
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px] pr-4">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown
              components={{
                h1: ({ children }) => (
                  <h1 className="text-2xl font-bold mb-4 text-foreground border-b pb-2">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-xl font-semibold mt-6 mb-3 text-foreground">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-lg font-medium mt-4 mb-2 text-foreground">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="mb-3 text-foreground/90 leading-relaxed">
                    {children}
                  </p>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc pl-6 mb-3 space-y-1">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal pl-6 mb-3 space-y-1">
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="text-foreground/90">
                    {children}
                  </li>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-foreground">
                    {children}
                  </strong>
                ),
                code: ({ children }) => (
                  <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">
                    {children}
                  </code>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-primary pl-4 italic my-4 text-muted-foreground">
                    {children}
                  </blockquote>
                ),
              }}
            >
              {report}
            </ReactMarkdown>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default ReportDisplay;
