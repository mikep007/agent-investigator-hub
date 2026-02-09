import { useState, useEffect } from "react";
import ActiveInvestigationBanner from "@/components/ActiveInvestigationBanner";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  FolderOpen, Plus, Search, MoreVertical, Trash2, 
  Edit, Archive, FolderPlus, Calendar, FileText, ArrowLeft 
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Case {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  item_count?: number;
}

const Cases = () => {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newCaseName, setNewCaseName] = useState("");
  const [newCaseDescription, setNewCaseDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchCases();
  }, []);

  const fetchCases = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      const { data, error } = await supabase
        .from('cases')
        .select('*, case_items(id)')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const casesWithCount = data?.map(c => ({
        ...c,
        item_count: c.case_items?.length || 0,
      })) || [];

      setCases(casesWithCount);
    } catch (error: any) {
      console.error('Error fetching cases:', error);
      toast({
        title: "Error",
        description: "Failed to load case files",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCase = async () => {
    if (!newCaseName.trim()) return;

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('cases')
        .insert({
          user_id: user.id,
          name: newCaseName.trim(),
          description: newCaseDescription.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      setCases([{ ...data, item_count: 0 }, ...cases]);
      setCreateDialogOpen(false);
      setNewCaseName("");
      setNewCaseDescription("");

      toast({
        title: "Case Created",
        description: `"${data.name}" case file created successfully`,
      });

      // Navigate to the new case
      navigate(`/cases/${data.id}`);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create case",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCase = async (caseId: string, caseName: string) => {
    if (!confirm(`Are you sure you want to delete "${caseName}"? This will remove all saved items.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('cases')
        .delete()
        .eq('id', caseId);

      if (error) throw error;

      setCases(cases.filter(c => c.id !== caseId));

      toast({
        title: "Case Deleted",
        description: `"${caseName}" has been deleted`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete case",
        variant: "destructive",
      });
    }
  };

  const handleArchiveCase = async (caseId: string) => {
    try {
      const caseToUpdate = cases.find(c => c.id === caseId);
      const newStatus = caseToUpdate?.status === 'archived' ? 'active' : 'archived';

      const { error } = await supabase
        .from('cases')
        .update({ status: newStatus })
        .eq('id', caseId);

      if (error) throw error;

      setCases(cases.map(c => 
        c.id === caseId ? { ...c, status: newStatus } : c
      ));

      toast({
        title: newStatus === 'archived' ? "Case Archived" : "Case Restored",
        description: `Case has been ${newStatus === 'archived' ? 'archived' : 'restored'}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update case",
        variant: "destructive",
      });
    }
  };

  const filteredCases = cases.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeCases = filteredCases.filter(c => c.status === 'active');
  const archivedCases = filteredCases.filter(c => c.status === 'archived');

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2">
                <FolderOpen className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Case Files</h1>
              </div>
            </div>

            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <FolderPlus className="h-4 w-4 mr-2" />
                  New Case
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Case File</DialogTitle>
                  <DialogDescription>
                    Create a new case file to organize your investigation findings.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Case Name</Label>
                    <Input
                      id="name"
                      placeholder="e.g., John Doe Background Check"
                      value={newCaseName}
                      onChange={(e) => setNewCaseName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description (optional)</Label>
                    <Textarea
                      id="description"
                      placeholder="Brief description of this case..."
                      value={newCaseDescription}
                      onChange={(e) => setNewCaseDescription(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateCase} disabled={!newCaseName.trim() || creating}>
                    {creating ? 'Creating...' : 'Create Case'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 pt-4">
        <ActiveInvestigationBanner />
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search cases..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center text-muted-foreground">
              <FolderOpen className="h-12 w-12 mx-auto mb-4 animate-pulse" />
              <p>Loading case files...</p>
            </div>
          </div>
        ) : cases.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <FolderPlus className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-semibold mb-2">No Case Files Yet</h2>
              <p className="text-muted-foreground mb-4">
                Create your first case file to start organizing investigation findings.
              </p>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Case
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Active Cases */}
            {activeCases.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-primary" />
                  Active Cases ({activeCases.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeCases.map(caseItem => (
                    <Card
                      key={caseItem.id}
                      className="cursor-pointer hover:border-primary/50 transition-all group"
                      onClick={() => navigate(`/cases/${caseItem.id}`)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="truncate group-hover:text-primary transition-colors">
                              {caseItem.name}
                            </CardTitle>
                            {caseItem.description && (
                              <CardDescription className="line-clamp-2 mt-1">
                                {caseItem.description}
                              </CardDescription>
                            )}
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                handleArchiveCase(caseItem.id);
                              }}>
                                <Archive className="h-4 w-4 mr-2" />
                                Archive
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteCase(caseItem.id, caseItem.name);
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <FileText className="h-4 w-4" />
                            <span>{caseItem.item_count} items</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            <span>{formatDate(caseItem.updated_at)}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Archived Cases */}
            {archivedCases.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-muted-foreground">
                  <Archive className="h-5 w-5" />
                  Archived ({archivedCases.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-75">
                  {archivedCases.map(caseItem => (
                    <Card
                      key={caseItem.id}
                      className="cursor-pointer hover:border-primary/50 transition-all"
                      onClick={() => navigate(`/cases/${caseItem.id}`)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="truncate">{caseItem.name}</CardTitle>
                            <Badge variant="secondary" className="mt-2">Archived</Badge>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                handleArchiveCase(caseItem.id);
                              }}>
                                <FolderOpen className="h-4 w-4 mr-2" />
                                Restore
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteCase(caseItem.id, caseItem.name);
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{caseItem.item_count} items</span>
                          <span>{formatDate(caseItem.updated_at)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Cases;
