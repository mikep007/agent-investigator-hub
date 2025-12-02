import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  FileText, Download, Printer, Shield, AlertTriangle, 
  User, Mail, Phone, MapPin, Globe, Calendar, 
  CheckCircle2, XCircle, ExternalLink, Copy
} from "lucide-react";
import { FindingData } from "./types";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";

interface IntelligenceDossierProps {
  findings: FindingData[];
  targetName?: string;
  investigationId?: string;
}

const IntelligenceDossier = ({ findings, targetName, investigationId }: IntelligenceDossierProps) => {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Extract all data points
  const extractDossierData = () => {
    const dossier = {
      subject: targetName || 'Unknown Subject',
      emails: new Set<string>(),
      phones: new Set<string>(),
      locations: new Set<string>(),
      usernames: new Set<string>(),
      platforms: new Map<string, { url: string; verified: boolean }>(),
      breaches: [] as any[],
      webMentions: [] as any[],
      relatives: new Set<string>(),
      riskIndicators: [] as string[],
    };

    findings.forEach(finding => {
      const data = finding.data;

      // People search data
      if (finding.agent_type === 'People_search' && data.results) {
        data.results.forEach((result: any) => {
          if (result.phones) result.phones.forEach((p: any) => dossier.phones.add(p.number || p));
          if (result.emails) result.emails.forEach((e: string) => dossier.emails.add(e));
          if (result.relatives) result.relatives.forEach((r: any) => dossier.relatives.add(r.name || r));
          if (result.addresses) {
            result.addresses.forEach((addr: any) => {
              const loc = typeof addr === 'string' ? addr : addr.full || `${addr.street}, ${addr.city}, ${addr.state}`;
              if (loc) dossier.locations.add(loc);
            });
          }
        });
      }

      // Sherlock platforms
      if (finding.agent_type === 'Sherlock' && data.foundPlatforms) {
        if (data.username) dossier.usernames.add(data.username);
        data.foundPlatforms.forEach((p: any) => {
          dossier.platforms.set(p.name, { url: p.url, verified: p.verificationStatus === 'verified' });
        });
      }

      // Holehe platforms
      if (finding.agent_type === 'Holehe') {
        if (data.email) dossier.emails.add(data.email);
        if (data.allResults) {
          data.allResults
            .filter((r: any) => r.exists)
            .forEach((r: any) => {
              dossier.platforms.set(r.name || r.domain, { 
                url: `https://${r.domain}`, 
                verified: r.verificationStatus === 'verified' 
              });
            });
        }
      }

      // Breaches
      if (finding.agent_type === 'Breach' || finding.source?.includes('LeakCheck')) {
        if (data.sources) {
          data.sources.forEach((source: any) => {
            dossier.breaches.push({
              name: source.name || source.source,
              date: source.date || source.breach_date,
              fields: source.fields || [],
              data: source.line || source.data,
            });
            dossier.riskIndicators.push(`Data exposed in ${source.name || source.source} breach`);
          });
        }
      }

      // Web mentions
      if (finding.agent_type === 'Web' && data.items) {
        data.items.forEach((item: any) => {
          dossier.webMentions.push({
            title: item.title,
            snippet: item.snippet,
            url: item.link,
            source: item.displayLink,
          });
        });
      }

      // Address
      if (finding.agent_type === 'Address' && data.location) {
        dossier.locations.add(data.location.formatted_address);
      }
    });

    return dossier;
  };

  const dossier = extractDossierData();

  // Calculate risk level
  const calculateRiskLevel = () => {
    let risk = 0;
    if (dossier.breaches.length > 0) risk += 30;
    if (dossier.breaches.length > 3) risk += 20;
    if (dossier.platforms.size > 10) risk += 10;
    if (dossier.phones.size > 0 && dossier.emails.size > 0) risk += 10;
    return Math.min(risk, 100);
  };

  const riskLevel = calculateRiskLevel();
  const riskColor = riskLevel > 60 ? 'text-destructive' : riskLevel > 30 ? 'text-yellow-500' : 'text-green-500';

  const exportToPDF = async () => {
    setExporting(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      let y = margin;

      // Helper for page breaks
      const checkPageBreak = (height: number) => {
        if (y + height > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          y = margin;
        }
      };

      // Title
      doc.setFontSize(20);
      doc.setFont(undefined, 'bold');
      doc.text('INTELLIGENCE DOSSIER', margin, y);
      y += 8;
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text('CONFIDENTIAL - FOR AUTHORIZED USE ONLY', margin, y);
      y += 15;

      // Subject Info
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text(`Subject: ${dossier.subject}`, margin, y);
      y += 7;
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(`Report Generated: ${currentDate}`, margin, y);
      y += 5;
      doc.text(`Case ID: ${investigationId || 'N/A'}`, margin, y);
      y += 5;
      doc.text(`Risk Assessment: ${riskLevel}%`, margin, y);
      y += 15;

      // Contact Information
      checkPageBreak(40);
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('CONTACT INFORMATION', margin, y);
      y += 8;
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');

      if (dossier.emails.size > 0) {
        doc.text(`Emails: ${Array.from(dossier.emails).join(', ')}`, margin, y);
        y += 5;
      }
      if (dossier.phones.size > 0) {
        doc.text(`Phone Numbers: ${Array.from(dossier.phones).join(', ')}`, margin, y);
        y += 5;
      }
      if (dossier.locations.size > 0) {
        const locations = Array.from(dossier.locations);
        doc.text('Locations:', margin, y);
        y += 5;
        locations.forEach(loc => {
          checkPageBreak(10);
          const lines = doc.splitTextToSize(`  • ${loc}`, pageWidth - 2 * margin);
          doc.text(lines, margin, y);
          y += lines.length * 5;
        });
      }
      y += 10;

      // Digital Footprint
      checkPageBreak(40);
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('DIGITAL FOOTPRINT', margin, y);
      y += 8;
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(`Total Platforms: ${dossier.platforms.size}`, margin, y);
      y += 5;
      doc.text(`Known Usernames: ${Array.from(dossier.usernames).join(', ') || 'None'}`, margin, y);
      y += 10;

      // Platforms list
      Array.from(dossier.platforms.entries()).forEach(([name, info]) => {
        checkPageBreak(10);
        const status = info.verified ? '[VERIFIED]' : '[PENDING]';
        doc.text(`  • ${name} ${status}`, margin, y);
        y += 5;
      });
      y += 10;

      // Breach History
      if (dossier.breaches.length > 0) {
        checkPageBreak(40);
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('DATA BREACH EXPOSURE', margin, y);
        y += 8;
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');

        dossier.breaches.forEach(breach => {
          checkPageBreak(20);
          doc.text(`  • ${breach.name}`, margin, y);
          y += 5;
          if (breach.date) {
            doc.text(`    Date: ${breach.date}`, margin, y);
            y += 5;
          }
          if (breach.fields?.length > 0) {
            doc.text(`    Exposed: ${breach.fields.join(', ')}`, margin, y);
            y += 5;
          }
        });
      }

      // Save
      doc.save(`Intelligence_Dossier_${dossier.subject.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);

      toast({
        title: "Dossier Exported",
        description: "PDF has been downloaded successfully",
      });
    } catch (error) {
      console.error('PDF export error:', error);
      toast({
        title: "Export Failed",
        description: "Failed to generate PDF",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Text copied to clipboard" });
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-1 print:p-0">
        {/* Header */}
        <Card className="border-2 border-primary/20 print:border-black">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="h-8 w-8 text-primary" />
                <div>
                  <CardTitle className="text-xl">INTELLIGENCE DOSSIER</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">CONFIDENTIAL - FOR AUTHORIZED USE ONLY</p>
                </div>
              </div>
              <div className="flex gap-2 print:hidden">
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
                <Button size="sm" onClick={exportToPDF} disabled={exporting}>
                  <Download className="h-4 w-4 mr-2" />
                  {exporting ? 'Exporting...' : 'Export PDF'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Subject:</span>
                <p className="font-semibold">{dossier.subject}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Report Date:</span>
                <p className="font-semibold">{currentDate}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Case ID:</span>
                <p className="font-mono text-xs">{investigationId?.slice(0, 8) || 'N/A'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Risk Level:</span>
                <p className={`font-bold ${riskColor}`}>{riskLevel}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              1. SUBJECT IDENTIFICATION
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {dossier.emails.size > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Email Addresses ({dossier.emails.size})</span>
                </div>
                <div className="space-y-1 ml-6">
                  {Array.from(dossier.emails).map((email, idx) => (
                    <div key={idx} className="flex items-center gap-2 group">
                      <code className="text-sm bg-muted px-2 py-1 rounded">{email}</code>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 print:hidden"
                        onClick={() => copyToClipboard(email)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {dossier.phones.size > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Phone Numbers ({dossier.phones.size})</span>
                </div>
                <div className="space-y-1 ml-6">
                  {Array.from(dossier.phones).map((phone, idx) => (
                    <div key={idx} className="flex items-center gap-2 group">
                      <code className="text-sm bg-muted px-2 py-1 rounded">{phone}</code>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 print:hidden"
                        onClick={() => copyToClipboard(phone)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {dossier.locations.size > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Known Locations ({dossier.locations.size})</span>
                </div>
                <div className="space-y-1 ml-6">
                  {Array.from(dossier.locations).map((loc, idx) => (
                    <p key={idx} className="text-sm">{loc}</p>
                  ))}
                </div>
              </div>
            )}

            {dossier.relatives.size > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Related Persons ({dossier.relatives.size})</span>
                </div>
                <div className="flex flex-wrap gap-2 ml-6">
                  {Array.from(dossier.relatives).map((rel, idx) => (
                    <Badge key={idx} variant="outline">{rel}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Digital Footprint */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="h-5 w-5" />
              2. DIGITAL FOOTPRINT
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <p className="text-sm text-muted-foreground">
                Subject maintains presence on <strong>{dossier.platforms.size}</strong> online platforms
                {dossier.usernames.size > 0 && (
                  <> using usernames: <strong>{Array.from(dossier.usernames).join(', ')}</strong></>
                )}
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {Array.from(dossier.platforms.entries()).map(([name, info], idx) => (
                <div 
                  key={idx} 
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    {info.verified ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    )}
                    <span className="text-sm font-medium">{name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 print:hidden"
                    onClick={() => window.open(info.url, '_blank')}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Breach History */}
        {dossier.breaches.length > 0 && (
          <Card className="border-destructive/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                3. DATA BREACH EXPOSURE
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {dossier.breaches.map((breach, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold">{breach.name}</span>
                      {breach.date && (
                        <Badge variant="outline" className="text-xs">
                          <Calendar className="h-3 w-3 mr-1" />
                          {breach.date}
                        </Badge>
                      )}
                    </div>
                    {breach.fields?.length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        <strong>Exposed Data:</strong> {breach.fields.join(', ')}
                      </p>
                    )}
                    {breach.data && (
                      <div className="mt-2 p-2 bg-muted rounded text-xs font-mono break-all">
                        {breach.data}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Web Mentions */}
        {dossier.webMentions.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="h-5 w-5" />
                4. WEB PRESENCE & MENTIONS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {dossier.webMentions.slice(0, 10).map((mention, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-muted/30">
                    <a 
                      href={mention.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:underline"
                    >
                      {mention.title}
                    </a>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {mention.snippet}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Source: {mention.source}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground py-4 border-t">
          <p>This document contains sensitive information gathered from open sources.</p>
          <p>Verify all data before taking action. Generated by OSINT Investigation Platform.</p>
        </div>
      </div>
    </ScrollArea>
  );
};

export default IntelligenceDossier;
