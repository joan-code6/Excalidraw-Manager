import { useEffect, useRef, useMemo } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import { Button } from '@/components/ui/button';
import { Moon, Sun, ChevronLeft } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { client } from '@/lib/appwrite';
import type { ExcalidrawCanvas } from '@/types/canvas';
import '@excalidraw/excalidraw/index.css';

interface CanvasViewerProps {
  canvas: ExcalidrawCanvas;
  onBack: () => void;
  shareId?: string;
}

export function CanvasViewer({ canvas, onBack, shareId }: CanvasViewerProps) {
  const excalidrawAPI = useRef<any>(null);
  const { theme, setTheme } = useTheme();
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const normalizeAppStateForExcalidraw = (appState: any) => {
    const normalized = appState && typeof appState === 'object' ? { ...appState } : {};
    normalized.collaborators = new Map();
    normalized.viewModeEnabled = true;
    return normalized;
  };

  const resolvedTheme = useMemo(() => {
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return theme;
  }, [theme]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!shareId) return;

     const databaseId = import.meta.env.VITE_APPWRITE_DATABASE_ID;
     const sharesCollectionId = import.meta.env.VITE_APPWRITE_SHARES_COLLECTION_ID;

     if (!databaseId || !sharesCollectionId) {
       console.error('Missing Appwrite configuration for real-time');
       return;
     }

     try {
       // Subscribe to updates on this specific share document
       const unsubscribe = client.subscribe(
         `databases.${databaseId}.collections.${sharesCollectionId}.documents.${shareId}`,
         (response: any) => {
           // Handle both create and update events
           if (
             response.events.includes(
               `databases.${databaseId}.collections.${sharesCollectionId}.documents.${shareId}.update`
             )
           ) {
             // Update the canvas with new data
             const updatedShare = response.payload;
             if (updatedShare.data && excalidrawAPI.current) {
               try {
                 const parsed = JSON.parse(updatedShare.data);
                 if (parsed.elements !== undefined) {
                   excalidrawAPI.current.updateScene({
                     elements: parsed.elements,
                     appState: normalizeAppStateForExcalidraw(parsed.appState),
                     files: parsed.files || {},
                   });
                 }
               } catch (err) {
                 console.error('Failed to parse updated share data:', err);
               }
             }
           }
         }
       );

       unsubscribeRef.current = () => unsubscribe();
     } catch (error) {
       console.error('Failed to subscribe to real-time updates:', error);
     }


    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [shareId]);

  let initialData: any = undefined;
  try {
    const parsed = JSON.parse(canvas.data);
    if (Array.isArray(parsed)) {
      initialData = {
        elements: parsed,
        appState: {},
      };
    } else if (parsed && parsed.elements !== undefined) {
      const appState = normalizeAppStateForExcalidraw(parsed.appState);
      initialData = {
        elements: parsed.elements,
        appState: appState,
        files: parsed.files || {},
      };
    } else {
      initialData = {
        elements: [],
        appState: {},
      };
    }
  } catch (err) {
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
            onClick={onBack}
            variant="ghost"
            size="sm"
            className="gap-2 shrink-0"
          >
            <ChevronLeft className="size-5" />
          </Button>
          <div className="h-6 w-px bg-border shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold truncate">
              {canvas.name}
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                (View Only)
              </span>
            </h2>
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
        </div>
      </div>

      {/* Excalidraw Canvas - Read Only */}
      <div className="flex-1 overflow-hidden">
        <Excalidraw
          key={canvas.id}
          initialData={initialData}
          theme={resolvedTheme}
          excalidrawAPI={(api: any) => {
            excalidrawAPI.current = api;
          }}
        />
      </div>
    </div>
  );
}
