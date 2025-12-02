import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  ArrowLeft, Search, MoreVertical, Trash2, Edit, 
  Download, ExternalLink, Tag, Calendar, User, Globe,
  Shield, FileText, StickyNote, Plus, FolderOpen, Image
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";

interface CaseItem {
  id: string;
  item_type: string;
  title: string;
  content: any;
  source_url: string | null;
  tags: string[] | null;
  created_at: string;
  screenshot_url?: string | null;
}

interface Case {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

const CaseDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [items, setItems] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<CaseItem | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");

  useEffect(() => {
    if (id) {
      fetchCaseData();
    }
  }, [id]);

  const fetchCaseData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      // Fetch case
      const { data: caseResult, error: caseError } = await supabase
        .from('cases')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (caseError) throw caseError;
      setCaseData(caseResult);
      setEditName(caseResult.name);
      setEditDescription(caseResult.description || "");

      // Fetch items
      const { data: itemsResult, error: itemsError } = await supabase
        .from('case_items')
        .select('*')
        .eq('case_id', id)
        .order('created_at', { ascending: false });

      if (itemsError) throw itemsError;
      setItems(itemsResult || []);
    } catch (error: any) {
      console.error('Error fetching case:', error);
      toast({
        title: "Error",
        description: "Failed to load case data",
        variant: "destructive",
      });
      navigate('/cases');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCase = async () => {
    if (!editName.trim() || !id) return;

    try {
      const { error } = await supabase
        .from('cases')
        .update({
          name: editName.trim(),
          description: editDescription.trim() || null,
        })
        .eq('id', id);

      if (error) throw error;

      setCaseData(prev => prev ? { ...prev, name: editName, description: editDescription } : null);
      setEditDialogOpen(false);

      toast({
        title: "Case Updated",
        description: "Case details have been updated",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update case",
        variant: "destructive",
      });
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      const { error } = await supabase
        .from('case_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      setItems(items.filter(i => i.id !== itemId));
      setSelectedItem(null);

      toast({
        title: "Item Deleted",
        description: "Item has been removed from the case",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete item",
        variant: "destructive",
      });
    }
  };

  const handleAddNote = async () => {
    if (!noteTitle.trim() || !noteContent.trim() || !id) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('case_items')
        .insert({
          case_id: id,
          user_id: user.id,
          item_type: 'note',
          title: noteTitle.trim(),
          content: { text: noteContent.trim() },
        })
        .select()
        .single();

      if (error) throw error;

      setItems([data, ...items]);
      setNoteDialogOpen(false);
      setNoteTitle("");
      setNoteContent("");

      toast({
        title: "Note Added",
        description: "Your note has been saved to this case",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add note",
        variant: "destructive",
      });
    }
  };

  const exportToPDF = async () => {
    if (!caseData) return;

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      let y = margin;

      const checkPageBreak = (height: number) => {
        if (y + height > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          y = margin;
        }
      };

      // Title
      doc.setFontSize(20);
      doc.setFont(undefined, 'bold');
      doc.text('CASE FILE REPORT', margin, y);
      y += 10;

      // Case info
      doc.setFontSize(14);
      doc.text(caseData.name, margin, y);
      y += 7;
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      if (caseData.description) {
        const descLines = doc.splitTextToSize(caseData.description, pageWidth - 2 * margin);
        doc.text(descLines, margin, y);
        y += descLines.length * 5;
      }
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, y);
      y += 5;
      doc.text(`Total Items: ${items.length}`, margin, y);
      y += 15;

      // Items
      items.forEach((item, index) => {
        checkPageBreak(40);
        
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(`${index + 1}. ${item.title}`, margin, y);
        y += 6;
        
        doc.setFontSize(9);
        doc.setFont(undefined, 'italic');
        doc.text(`Type: ${item.item_type} | Added: ${new Date(item.created_at).toLocaleDateString()}`, margin, y);
        y += 5;

        doc.setFont(undefined, 'normal');
        const contentStr = typeof item.content === 'string' 
          ? item.content 
          : JSON.stringify(item.content, null, 2);
        const contentLines = doc.splitTextToSize(contentStr.slice(0, 500), pageWidth - 2 * margin);
        doc.text(contentLines, margin, y);
        y += contentLines.length * 4 + 10;
      });

      doc.save(`Case_${caseData.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);

      toast({
        title: "PDF Exported",
        description: "Case file has been exported successfully",
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: "Failed to generate PDF",
        variant: "destructive",
      });
    }
  };

  const filteredItems = items.filter(item =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.item_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'profile': return <User className="h-4 w-4" />;
      case 'platform': return <Globe className="h-4 w-4" />;
      case 'breach': return <Shield className="h-4 w-4 text-destructive" />;
      case 'note': return <StickyNote className="h-4 w-4 text-yellow-500" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <FolderOpen className="h-12 w-12 animate-pulse text-primary" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Case not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/cases')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-primary" />
                  {caseData.name}
                </h1>
                {caseData.description && (
                  <p className="text-sm text-muted-foreground">{caseData.description}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setNoteDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Note
              </Button>
              <Button variant="outline" size="sm" onClick={exportToPDF}>
                <Download className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setEditDialogOpen(true)}>
                <Edit className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Items List */}
          <div className="lg:col-span-2 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search items..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Items */}
            {filteredItems.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    {items.length === 0
                      ? "No items in this case yet. Save findings from investigations to build your case file."
                      : "No items match your search."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ScrollArea className="h-[calc(100vh-250px)]">
                <div className="space-y-3 pr-4">
                  {filteredItems.map(item => (
                    <Card
                      key={item.id}
                      className={`cursor-pointer transition-all hover:border-primary/50 ${
                        selectedItem?.id === item.id ? 'border-primary' : ''
                      }`}
                      onClick={() => setSelectedItem(item)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            {getItemIcon(item.item_type)}
                            <CardTitle className="text-base">{item.title}</CardTitle>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {item.item_type}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(item.created_at)}
                          </div>
                          {item.tags && item.tags.length > 0 && (
                            <div className="flex gap-1">
                              {item.tags.slice(0, 3).map(tag => (
                                <Badge key={tag} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Detail Panel */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle className="text-base">Item Details</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedItem ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getItemIcon(selectedItem.item_type)}
                        <span className="font-medium">{selectedItem.title}</span>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {selectedItem.source_url && (
                            <DropdownMenuItem onClick={() => window.open(selectedItem.source_url!, '_blank')}>
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Open Source
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteItem(selectedItem.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <Separator />

                    <div className="text-sm text-muted-foreground">
                      <Calendar className="h-3 w-3 inline mr-1" />
                      {formatDate(selectedItem.created_at)}
                    </div>

                    {selectedItem.tags && selectedItem.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {selectedItem.tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            <Tag className="h-3 w-3 mr-1" />
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <Separator />

                    {/* Screenshot Preview */}
                    {selectedItem.screenshot_url && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Image className="h-3 w-3" />
                          Screenshot Evidence
                        </div>
                        <a 
                          href={selectedItem.screenshot_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="block"
                        >
                          <img 
                            src={selectedItem.screenshot_url} 
                            alt="Screenshot evidence"
                            className="rounded-md border w-full hover:opacity-90 transition-opacity cursor-pointer"
                          />
                        </a>
                      </div>
                    )}

                    <ScrollArea className="h-[250px]">
                      <div className="text-sm space-y-2">
                        {selectedItem.item_type === 'note' ? (
                          <p className="whitespace-pre-wrap">{selectedItem.content.text}</p>
                        ) : (
                          <pre className="text-xs bg-muted p-3 rounded overflow-auto">
                            {JSON.stringify(selectedItem.content, null, 2)}
                          </pre>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    Select an item to view details
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Edit Case Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Case</DialogTitle>
            <DialogDescription>Update case details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Case Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateCase}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Note Dialog */}
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
            <DialogDescription>Add a note to this case file</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                placeholder="Note title..."
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                placeholder="Write your note..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                rows={5}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNoteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddNote} disabled={!noteTitle.trim() || !noteContent.trim()}>
              Add Note
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CaseDetail;
