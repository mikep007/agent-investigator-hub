import { useState, useEffect, RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderPlus, Folder, Plus, BookmarkPlus, Tag, Camera, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { captureScreenshot } from "@/utils/screenshotCapture";

interface CaseItem {
  item_type: 'finding' | 'profile' | 'platform' | 'breach' | 'note';
  title: string;
  content: any;
  source_url?: string;
  source_investigation_id?: string;
  tags?: string[];
}

interface SaveToCaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CaseItem | null;
  elementRef?: RefObject<HTMLElement>;
}

interface Case {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  item_count?: number;
}

const SaveToCaseDialog = ({ open, onOpenChange, item, elementRef }: SaveToCaseDialogProps) => {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newCaseName, setNewCaseName] = useState("");
  const [newCaseDescription, setNewCaseDescription] = useState("");
  const [tags, setTags] = useState<string[]>(item?.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [captureScreenshotEnabled, setCaptureScreenshotEnabled] = useState(false);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchCases();
      setTags(item?.tags || []);
    }
  }, [open, item]);

  const fetchCases = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

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
      
      if (casesWithCount.length === 0) {
        setIsCreatingNew(true);
      }
    } catch (error: any) {
      console.error('Error fetching cases:', error);
    }
  };

  const handleCreateCase = async () => {
    if (!newCaseName.trim()) return;

    setLoading(true);
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
      setSelectedCaseId(data.id);
      setIsCreatingNew(false);
      setNewCaseName("");
      setNewCaseDescription("");

      toast({
        title: "Case Created",
        description: `"${data.name}" case file created successfully`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create case",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToCase = async () => {
    if (!selectedCaseId || !item) return;

    setLoading(true);
    let screenshotUrl: string | undefined;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Capture screenshot if enabled
      if (captureScreenshotEnabled && elementRef?.current) {
        setIsCapturingScreenshot(true);
        const result = await captureScreenshot(
          elementRef.current,
          user.id,
          item.title
        );
        setIsCapturingScreenshot(false);

        if (result.success && result.url) {
          screenshotUrl = result.url;
        } else if (result.error) {
          console.warn('Screenshot capture failed:', result.error);
        }
      }

      const { error } = await supabase
        .from('case_items')
        .insert({
          case_id: selectedCaseId,
          user_id: user.id,
          item_type: item.item_type,
          title: item.title,
          content: item.content,
          source_url: item.source_url,
          source_investigation_id: item.source_investigation_id,
          tags: tags.length > 0 ? tags : null,
          screenshot_url: screenshotUrl || null,
        });

      if (error) throw error;

      const selectedCase = cases.find(c => c.id === selectedCaseId);

      toast({
        title: "Saved to Case",
        description: screenshotUrl 
          ? `Item saved with screenshot to "${selectedCase?.name}"` 
          : `Item saved to "${selectedCase?.name}" case file`,
      });

      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save to case",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setIsCapturingScreenshot(false);
    }
  };

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const getItemTypeIcon = (type: string) => {
    switch (type) {
      case 'profile': return '👤';
      case 'platform': return '🌐';
      case 'breach': return '🔓';
      case 'note': return '📝';
      default: return '📋';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookmarkPlus className="h-5 w-5 text-primary" />
            Save to Case File
          </DialogTitle>
          <DialogDescription>
            Save this {item?.item_type} to an organized case file for long-term investigation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Item Preview */}
          {item && (
            <div className="p-3 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-2 mb-1">
                <span>{getItemTypeIcon(item.item_type)}</span>
                <span className="font-medium truncate">{item.title}</span>
                <Badge variant="outline" className="ml-auto text-xs">
                  {item.item_type}
                </Badge>
              </div>
            </div>
          )}

          {/* Case Selection or Creation */}
          {!isCreatingNew ? (
            <div className="space-y-3">
              <Label>Select Case File</Label>
              <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a case file..." />
                </SelectTrigger>
                <SelectContent>
                  {cases.map(caseItem => (
                    <SelectItem key={caseItem.id} value={caseItem.id}>
                      <div className="flex items-center gap-2">
                        <Folder className="h-4 w-4" />
                        <span>{caseItem.name}</span>
                        <Badge variant="secondary" className="text-xs ml-2">
                          {caseItem.item_count} items
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setIsCreatingNew(true)}
              >
                <FolderPlus className="h-4 w-4 mr-2" />
                Create New Case
              </Button>
            </div>
          ) : (
            <div className="space-y-3 p-4 rounded-lg border bg-card">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">New Case File</Label>
                {cases.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsCreatingNew(false)}
                  >
                    Cancel
                  </Button>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="case-name">Case Name</Label>
                <Input
                  id="case-name"
                  placeholder="e.g., John Doe Investigation"
                  value={newCaseName}
                  onChange={(e) => setNewCaseName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="case-description">Description (optional)</Label>
                <Textarea
                  id="case-description"
                  placeholder="Brief description of this case..."
                  value={newCaseDescription}
                  onChange={(e) => setNewCaseDescription(e.target.value)}
                  rows={2}
                />
              </div>

              <Button
                onClick={handleCreateCase}
                disabled={!newCaseName.trim() || loading}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Case
              </Button>
            </div>
          )}

          {/* Screenshot Capture */}
          {elementRef && (
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4 text-primary" />
                <div>
                  <Label className="text-sm font-medium">Capture Screenshot</Label>
                  <p className="text-xs text-muted-foreground">Save visual evidence with this item</p>
                </div>
              </div>
              <Switch
                checked={captureScreenshotEnabled}
                onCheckedChange={setCaptureScreenshotEnabled}
              />
            </div>
          )}

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags (optional)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
              />
              <Button variant="outline" size="icon" onClick={addTag}>
                <Tag className="h-4 w-4" />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map(tag => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="cursor-pointer hover:bg-destructive/20"
                    onClick={() => removeTag(tag)}
                  >
                    {tag} ×
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveToCase}
            disabled={!selectedCaseId || loading || isCapturingScreenshot}
          >
            {isCapturingScreenshot ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Capturing...
              </>
            ) : (
              <>
                <BookmarkPlus className="h-4 w-4 mr-2" />
                {loading ? 'Saving...' : captureScreenshotEnabled ? 'Save with Screenshot' : 'Save to Case'}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SaveToCaseDialog;
