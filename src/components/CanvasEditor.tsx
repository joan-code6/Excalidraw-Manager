import { useEffect, useRef, useState, useMemo } from 'react';
import { Excalidraw, exportToCanvas } from '@excalidraw/excalidraw';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ExcalidrawCanvas } from '@/types/canvas';
import { ChevronLeft, Save, Moon, Sun, Share2 } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { ShareDialog, type ShareLinkItem } from '@/components/ShareDialog';
import { createCanvasShare, findCanvasShares, getShareUrl, updateAllCanvasShares, updateEditableCanvasShares } from '@/lib/canvasShare';
import { mergeSceneSnapshots, parseSceneSnapshot, serializeSceneSnapshot } from '@/lib/canvasRealtimeMerge';
import { client } from '@/lib/appwrite';
import '@excalidraw/excalidraw/index.css';

interface CanvasEditorProps {
  canvas: ExcalidrawCanvas;
  onSave: (data: string) => void;
  onRename: (name: string) => void;
  onBack: () => void;
}

export function CanvasEditor({ canvas, onSave, onRename, onBack }: CanvasEditorProps) {
  const excalidrawAPI = useRef<any>(null);
  const pendingCollabPublishTimeoutRef = useRef<number | null>(null);
  const pendingCollabDataRef = useRef<string | null>(null);
  const isApplyingRemoteCollabRef = useRef(false);
  const lastCollabDataRef = useRef<string>(canvas.data);
  const collabUnsubscribeRef = useRef<(() => void) | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(canvas.name);
  const { theme, setTheme } = useTheme();
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareLinks, setShareLinks] = useState<ShareLinkItem[]>([]);
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

  const serializeSceneForStorage = (elements: any, appState: any, files: any, thumbnail?: string) => {
    return JSON.stringify({
      elements,
      appState: toSerializableAppState(appState),
      files,
      ...(thumbnail ? { thumbnail } : {}),
    });
  };

  const serializeSceneForShare = (elements: any[], files: Record<string, any>) => {
    return serializeSceneSnapshot(elements, files);
  };

  useEffect(() => {
    setNewName(canvas.name);
  }, [canvas.id, canvas.name]);

  useEffect(() => {
    const parsed = parseSceneSnapshot(canvas.data);
    if (parsed) {
      lastCollabDataRef.current = serializeSceneForShare(parsed.elements, parsed.files);
      return;
    }
    lastCollabDataRef.current = canvas.data;
  }, [canvas.data]);

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
        
        const data = serializeSceneForStorage(elements, appState, files, thumbnail);
        const shareData = serializeSceneForShare(elements, files);
        
        onSave(data);
        
        // Keep view-only links in sync with saved owner snapshots.
        await updateAllCanvasShares(canvas.id, shareData, 'view');
        
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
      const links: ShareLinkItem[] = existingShares
        .map((share) => {
          const access: ShareLinkItem['access'] = share.access === 'edit' ? 'edit' : 'view';
          return {
            id: share.id,
            url: getShareUrl(share.id),
            access,
            invitedEmail: share.invitedEmail,
          };
        })
        .sort((a, b) => a.url.localeCompare(b.url));
      setShareLinks(links);
      setShareDialogOpen(true);
    } catch (error) {
      console.error('Failed to load shares:', error);
    } finally {
      setIsLoadingShares(false);
    }
  };

  const handleCreateShare = async (access: 'view' | 'edit', invitedEmail?: string) => {
    if (!excalidrawAPI.current) return;

    try {
      setIsCreatingShare(true);
      const elements = excalidrawAPI.current.getSceneElements();
      const files = excalidrawAPI.current.getFiles?.() ?? {};

      const shareData = serializeSceneForShare(elements, files);

      const share = await createCanvasShare(canvas.id, shareData, {
        access,
        invitedEmail,
      });
      if (!share) return;

      const newLink: ShareLinkItem = {
        id: share.id,
        url: getShareUrl(share.id),
        access: share.access === 'edit' ? 'edit' : 'view',
        invitedEmail: share.invitedEmail,
      };

      setShareLinks((prev) => [newLink, ...prev.filter((link) => link.id !== newLink.id)]);
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

  // Realtime collaboration bridge in owner editor:
  // - pull remote updates from editable shares
  // - push local edits to editable shares (debounced)
  useEffect(() => {
    const databaseId = import.meta.env.VITE_APPWRITE_DATABASE_ID;
    const sharesCollectionId = import.meta.env.VITE_APPWRITE_SHARES_COLLECTION_ID;

    if (!databaseId || !sharesCollectionId || !canvas.id) {
      return;
    }

    const unsubscribe = client.subscribe(
      `databases.${databaseId}.collections.${sharesCollectionId}.documents`,
      (response: any) => {
        const payload = response?.payload;
        if (!payload || payload.canvasId !== canvas.id || !payload.data || !excalidrawAPI.current) {
          return;
        }

        const access = payload.access === 'edit' ? 'edit' : 'view';
        if (access !== 'edit') {
          return;
        }

        if (payload.data === lastCollabDataRef.current) {
          return;
        }

        try {
          const remoteSnapshot = parseSceneSnapshot(payload.data);
          if (!remoteSnapshot) {
            return;
          }

          const localSnapshot = {
            elements: excalidrawAPI.current.getSceneElements?.() || [],
            files: excalidrawAPI.current.getFiles?.() || {},
          };

          const mergedSnapshot = mergeSceneSnapshots(localSnapshot, remoteSnapshot);

          isApplyingRemoteCollabRef.current = true;
          excalidrawAPI.current.updateScene({
            elements: mergedSnapshot.elements,
            files: mergedSnapshot.files,
          });

          const mergedSerialized = serializeSceneForShare(
            mergedSnapshot.elements,
            mergedSnapshot.files
          );
          lastCollabDataRef.current = mergedSerialized;

          if (pendingCollabDataRef.current) {
            const pendingSnapshot = parseSceneSnapshot(pendingCollabDataRef.current);
            if (pendingSnapshot) {
              const rebasedPending = mergeSceneSnapshots(mergedSnapshot, pendingSnapshot);
              pendingCollabDataRef.current = serializeSceneForShare(
                rebasedPending.elements,
                rebasedPending.files
              );
            }
          }

          window.setTimeout(() => {
            isApplyingRemoteCollabRef.current = false;
          }, 0);
        } catch (error) {
          console.error('Failed to parse collaboration payload:', error);
        }
      }
    );

    collabUnsubscribeRef.current = () => unsubscribe();

    return () => {
      if (pendingCollabPublishTimeoutRef.current !== null) {
        window.clearTimeout(pendingCollabPublishTimeoutRef.current);
        pendingCollabPublishTimeoutRef.current = null;
      }
      pendingCollabDataRef.current = null;
      if (collabUnsubscribeRef.current) {
        collabUnsubscribeRef.current();
        collabUnsubscribeRef.current = null;
      }
    };
  }, [canvas.id]);

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
          onChange={(elements: any, _appState: any, files: any) => {
            if (isApplyingRemoteCollabRef.current) {
              return;
            }

            const data = serializeSceneForShare(elements, files || {});
            if (data === lastCollabDataRef.current) {
              return;
            }

            if (pendingCollabPublishTimeoutRef.current !== null) {
              window.clearTimeout(pendingCollabPublishTimeoutRef.current);
            }

            pendingCollabDataRef.current = data;
            pendingCollabPublishTimeoutRef.current = window.setTimeout(async () => {
              const pendingData = pendingCollabDataRef.current;
              pendingCollabDataRef.current = null;

              if (!pendingData) {
                return;
              }

              try {
                await updateEditableCanvasShares(canvas.id, pendingData);
                lastCollabDataRef.current = pendingData;
              } catch (error) {
                console.error('Failed to publish editor collaboration update:', error);
              }
            }, 450);
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
        onCreateViewShare={() => handleCreateShare('view')}
        onCreateEditShare={() => handleCreateShare('edit')}
        onInviteByEmail={(email) => handleCreateShare('edit', email)}
        isCreating={isCreatingShare}
      />
    </div>
  );
}
