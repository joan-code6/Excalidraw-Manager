import { useEffect, useRef, useState, useMemo } from 'react';
import { Excalidraw, exportToCanvas } from '@excalidraw/excalidraw';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ExcalidrawCanvas } from '@/types/canvas';
import { ChevronLeft, Save, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import '@excalidraw/excalidraw/index.css';

interface CanvasEditorProps {
  canvas: ExcalidrawCanvas;
  onSave: (data: string) => void;
  onBack: () => void;
}

export function CanvasEditor({ canvas, onSave, onBack }: CanvasEditorProps) {
  const excalidrawAPI = useRef<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(canvas.name);
  const { theme, setTheme } = useTheme();

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
          appState,
          files,
          thumbnail,
        });
        
        onSave(data);
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
    if (newName.trim()) {
      // This would need to be passed up to parent to handle
      setIsRenaming(false);
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
      const appState = parsed.appState || {};
      // Ensure collaborators is an array
      if (appState.collaborators && !Array.isArray(appState.collaborators)) {
        appState.collaborators = [];
      }
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename();
                    if (e.key === 'Escape') setIsRenaming(false);
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

      {/* Auto-save Indicator */}
      <div className="border-t bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
        Auto-saved • {new Date(canvas.updatedAt).toLocaleTimeString()}
      </div>
    </div>
  );
}
