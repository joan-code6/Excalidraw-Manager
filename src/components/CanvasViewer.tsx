import { useEffect, useRef, useMemo } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import { Button } from '@/components/ui/button';
import { Moon, Sun, ChevronLeft } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { client } from '@/lib/appwrite';
import { updateCanvasShareData, updateEditableCanvasShares } from '@/lib/canvasShare';
import { mergeSceneSnapshots, parseSceneSnapshot, serializeSceneSnapshot } from '@/lib/canvasRealtimeMerge';
import type { ExcalidrawCanvas } from '@/types/canvas';
import '@excalidraw/excalidraw/index.css';

interface CanvasViewerProps {
  canvas: ExcalidrawCanvas;
  onBack: () => void;
  shareId?: string;
  editable?: boolean;
}

export function CanvasViewer({ canvas, onBack, shareId, editable = false }: CanvasViewerProps) {
  const excalidrawAPI = useRef<any>(null);
  const { theme, setTheme } = useTheme();
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const pendingPublishTimeoutRef = useRef<number | null>(null);
  const pendingPublishDataRef = useRef<string | null>(null);
  const isApplyingRemoteRef = useRef(false);
  const lastSyncedDataRef = useRef(canvas.data);

  const normalizeAppStateForExcalidraw = (appState: any) => {
    const normalized = appState && typeof appState === 'object' ? { ...appState } : {};
    normalized.collaborators = new Map();
    normalized.viewModeEnabled = !editable;
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

  useEffect(() => {
    const parsed = parseSceneSnapshot(canvas.data);
    if (parsed) {
      lastSyncedDataRef.current = serializeSceneSnapshot(parsed.elements, parsed.files);
      return;
    }
    lastSyncedDataRef.current = canvas.data;
  }, [canvas.data]);

  // Subscribe to share document updates and apply them live.
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
           const updatedShare = response.payload;
           if (!updatedShare?.data || !excalidrawAPI.current) {
             return;
           }

           if (updatedShare.data === lastSyncedDataRef.current) {
             return;
           }

           try {
             const remoteSnapshot = parseSceneSnapshot(updatedShare.data);
             if (!remoteSnapshot) {
               return;
             }

             const localSnapshot = {
               elements: excalidrawAPI.current.getSceneElements?.() || [],
               files: excalidrawAPI.current.getFiles?.() || {},
             };

             const mergedSnapshot = mergeSceneSnapshots(localSnapshot, remoteSnapshot);

             isApplyingRemoteRef.current = true;
             excalidrawAPI.current.updateScene({
               elements: mergedSnapshot.elements,
               files: mergedSnapshot.files,
             });

             const mergedSerialized = serializeSceneSnapshot(
               mergedSnapshot.elements,
               mergedSnapshot.files
             );
             lastSyncedDataRef.current = mergedSerialized;

             if (pendingPublishDataRef.current) {
               const pendingSnapshot = parseSceneSnapshot(pendingPublishDataRef.current);
               if (pendingSnapshot) {
                 const rebasedPending = mergeSceneSnapshots(mergedSnapshot, pendingSnapshot);
                 pendingPublishDataRef.current = serializeSceneSnapshot(
                   rebasedPending.elements,
                   rebasedPending.files
                 );
               }
             }

             window.setTimeout(() => {
               isApplyingRemoteRef.current = false;
             }, 0);
           } catch (err) {
             console.error('Failed to parse updated share data:', err);
           }
         }
       );

       unsubscribeRef.current = () => unsubscribe();
     } catch (error) {
       console.error('Failed to subscribe to real-time updates:', error);
     }


    return () => {
      if (pendingPublishTimeoutRef.current !== null) {
        window.clearTimeout(pendingPublishTimeoutRef.current);
        pendingPublishTimeoutRef.current = null;
      }
      pendingPublishDataRef.current = null;
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
                {editable ? '(Collaborative)' : '(View Only)'}
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

      {/* Excalidraw Canvas */}
      <div className="flex-1 overflow-hidden">
        <Excalidraw
          key={canvas.id}
          initialData={initialData}
          theme={resolvedTheme}
          onChange={(elements: any, _appState: any, files: any) => {
            if (!editable || !shareId) {
              return;
            }

            if (isApplyingRemoteRef.current) {
              return;
            }

            const serializedData = serializeSceneSnapshot(elements, files || {});

            if (serializedData === lastSyncedDataRef.current) {
              return;
            }

            if (pendingPublishTimeoutRef.current !== null) {
              window.clearTimeout(pendingPublishTimeoutRef.current);
            }

            // Capture the data NOW so debounce fires with this version, not the one received later
            pendingPublishDataRef.current = serializedData;

            pendingPublishTimeoutRef.current = window.setTimeout(async () => {
              const dataToPublish = pendingPublishDataRef.current;
              pendingPublishDataRef.current = null;

              if (!dataToPublish) {
                return;
              }

              try {
                const updated = await updateCanvasShareData(shareId, dataToPublish);
                if (updated) {
                  await updateEditableCanvasShares(canvas.id, dataToPublish, shareId);
                  lastSyncedDataRef.current = dataToPublish;
                }
              } catch (error) {
                console.error('Failed to publish collaborator updates:', error);
              }
            }, 700);
          }}
          excalidrawAPI={(api: any) => {
            excalidrawAPI.current = api;
          }}
        />
      </div>
    </div>
  );
}
