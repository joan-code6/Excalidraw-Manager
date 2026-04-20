import { useEffect, useRef, useState, useMemo } from 'react';
import { Excalidraw, exportToCanvas } from '@excalidraw/excalidraw';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ExcalidrawCanvas } from '@/types/canvas';
import { ChevronLeft, Save, Moon, Sun, Share2 } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { ShareDialog } from '@/components/ShareDialog';
import { createCanvasShare, findCanvasShares, getShareUrl, updateAllCanvasShares } from '@/lib/canvasShare';
import '@excalidraw/excalidraw/index.css';

interface CanvasEditorProps {
  canvas: ExcalidrawCanvas;
  onSave: (data: string) => void;
  onRename: (name: string) => void;
  onBack: () => void;
}

export function CanvasEditor({ canvas, onSave, onRename, onBack }: CanvasEditorProps) {
  const excalidrawAPI = useRef<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(canvas.name);
  const { theme, setTheme } = useTheme();
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareLinks, setShareLinks] = useState<string[]>([]);
  const [isLoadingShares, setIsLoadingShares] = useState(false);
  const [isCreatingShare, setIsCreatingShare] = useState(false);

  const normalizeAppStateForExcalidraw = (appState: any) => {
    const normalized = appState && typeof appState === 'object' ? { ...appState } : {};
    // Excalidraw expects collaborators to be a Map-like object with forEach.
    normalized.collaborators = new Map();
    return normalized;
  };

  const toSerializableAppState = (appState: any) => {
    const { collaborators: _collaborators, ...rest } = appState || {};
    return rest;
  };

  useEffect(() => {
    setNewName(canvas.name);
  }, [canvas.id, canvas.name]);

  const resolvedTheme = useMemo(() => {
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  }, [theme]);

  const handleSave = async () => {
    if (excalidrawAPI.current) {
      try {
        setIsSaving(true);
        const elements = excalidrawAPI.current.getSceneElements();
        const appState = excalidrawAPI.current.getAppState();
        const files = excalidrawAPI.current.getFiles?.() ?? {};
        
        // Generate thumbnail from scene data to avoid grabbing the wrong layered canvas.
        let thumbnail: string | undefined;
        try {
          if (elements.length > 0) {
            const thumbCanvas = await exportToCanvas({
              elements,
              appState,
              files,
            });
            const canvasData = thumbCanvas.toDataURL('image/png');
            if (canvasData.length > 100) {
              thumbnail = canvasData;
            }
          }
        } catch (err) {
          console.error('Failed to generate thumbnail:', err);
        }
        
        const data = JSON.stringify({
          elements,
          appState: toSerializableAppState(appState),
          files,
          thumbnail,
        });
        
        onSave(data);
        
        // Update all shares with new data
        await updateAllCanvasShares(canvas.id, data);
        
        // Visual feedback
        setTimeout(() => setIsSaving(false), 500);
      } catch (error) {
        console.error('Failed to save canvas:', error);
        setIsSaving(false);
      }
    }
  };

  const handleBack = () => {
    // Save before going back
    handleSave();
    setTimeout(() => {
      onBack();
    }, 100);
  };

  const handleRename = () => {
    const trimmedName = newName.trim();
    if (!trimmedName) {
      setNewName(canvas.name);
      setIsRenaming(false);
      return;
    }

    if (trimmedName !== canvas.name) {
      onRename(trimmedName);
    }

    setNewName(trimmedName);
    setIsRenaming(false);
  };

  const handleShare = async () => {
    if (!canvas.id) return;

    try {
      setIsLoadingShares(true);
      const existingShares = await findCanvasShares(canvas.id);
      const links = existingShares
        .map((share) => getShareUrl(share.id))
        .sort((a, b) => a.localeCompare(b));
      setShareLinks(links);
      setShareDialogOpen(true);
    } catch (error) {
      console.error('Failed to load shares:', error);
    } finally {
      setIsLoadingShares(false);
    }
  };

  const handleCreateNewShare = async () => {
    if (!excalidrawAPI.current) return;

    try {
      setIsCreatingShare(true);
      const elements = excalidrawAPI.current.getSceneElements();
      const appState = excalidrawAPI.current.getAppState();
      const files = excalidrawAPI.current.getFiles?.() ?? {};

      const shareData = JSON.stringify({
        elements,
        appState: toSerializableAppState(appState),
        files,
      });

      const share = await createCanvasShare(canvas.id, shareData);
      if (!share) return;

      const newLink = getShareUrl(share.id);
      setShareLinks((prev) => [newLink, ...prev.filter((link) => link !== newLink)]);
    } catch (error) {
      console.error('Failed to create share:', error);
    } finally {
      setIsCreatingShare(false);
    }
  };

  // Auto-save every 5 seconds and when window closes
  useEffect(() => {
    const autoSaveInterval = setInterval(() => {
      handleSave();
    }, 5000);

    const handleBeforeUnload = () => {
      handleSave();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(autoSaveInterval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [excalidrawAPI]);

  let initialData: any = undefined;
  try {
    const parsed = JSON.parse(canvas.data);
    // Handle both old format (array only) and new format (object with elements)
    if (Array.isArray(parsed)) {
      // Old format: just an array of elements
      initialData = {
        elements: parsed,
        appState: {},
      };
    } else if (parsed && parsed.elements !== undefined) {
      // New format: object with elements and appState
      const appState = normalizeAppStateForExcalidraw(parsed.appState);
      initialData = {
        elements: parsed.elements,
        appState: appState,
        files: parsed.files || {},
      };
    } else {
      // Fallback to empty canvas
      initialData = {
        elements: [],
        appState: {},
      };
    }
  } catch (err) {
    // If data is invalid, start with empty canvas
    console.error('Failed to parse canvas data:', err);
    initialData = {
      elements: [],
      appState: {},
    };
  }

  return (
    <div className="flex flex-col h-svh bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Button
            onClick={handleBack}
            variant="ghost"
            size="sm"
            className="gap-2 shrink-0"
          >
            <ChevronLeft className="size-5" />
          </Button>
          <div className="h-6 w-px bg-border shrink-0" />
          <div className="flex-1 min-w-0">
            {isRenaming ? (
              <div className="flex gap-2 items-center">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-8"
                  onBlur={handleRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename();
                    if (e.key === 'Escape') {
                      setNewName(canvas.name);
                      setIsRenaming(false);
                    }
                  }}
                  autoFocus
                />
              </div>
            ) : (
              <h2 
                className="text-lg font-semibold truncate cursor-pointer hover:text-primary transition-colors"
                onClick={() => setIsRenaming(true)}
                title="Click to rename"
              >
                {canvas.name}
              </h2>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
              setTheme(nextTheme);
            }}
            title="Toggle dark mode"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="size-5" />
            ) : (
              <Moon className="size-5" />
            )}
          </Button>

          <Button
            onClick={handleShare}
            disabled={isCreatingShare}
            variant="outline"
            className="gap-2"
            size="sm"
            title="Generate a shareable link for others to view"
          >
            <Share2 className="size-4" />
            Share
          </Button>

          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="gap-2"
            size="sm"
          >
            <Save className="size-4" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Excalidraw Canvas */}
      <div className="flex-1 overflow-hidden">
        <Excalidraw
          key={canvas.id}
          onChange={() => {
            // Could add auto-save debouncing here if needed
          }}
          initialData={initialData}
          theme={resolvedTheme}
          excalidrawAPI={(api: any) => {
            excalidrawAPI.current = api;
          }}
        />
      </div>

      <ShareDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        canvasName={canvas.name}
        shareLinks={shareLinks}
        isLoadingShares={isLoadingShares}
        onCreateNewShare={handleCreateNewShare}
        isCreating={isCreatingShare}
      />
    </div>
  );
}
