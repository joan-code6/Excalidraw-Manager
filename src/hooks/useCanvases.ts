import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { ExcalidrawCanvas, CanvasListItem } from '@/types/canvas';
import { useAuth } from '@/hooks/useAuth';
import { APPWRITE_DB_ENABLED } from '@/lib/appwrite';
import {
  CanvasSyncError,
  deleteCanvasDocument,
  listUserCanvases,
  upsertCanvas,
} from '@/lib/canvasSyncDb';

const STORAGE_KEY = 'excalidraw-canvases';
const PROJECTS_STORAGE_KEY = 'excalidraw-projects';
const DEFAULT_PROJECT = 'General';

export function useCanvases() {
  const [canvases, setCanvases] = useState<ExcalidrawCanvas[]>([]);
  const [projects, setProjects] = useState<string[]>([DEFAULT_PROJECT]);
  const [loading, setLoading] = useState(true);
  const remoteHydratedRef = useRef(false);
  const previousCanvasIdsRef = useRef<string[]>([]);
  const previousCanvasUpdatedAtRef = useRef<Map<string, number>>(new Map());
  const syncingRef = useRef(false);
  const syncBlockedReasonRef = useRef<string | null>(null);

  const blockCloudSync = useCallback((reason: string) => {
    if (syncBlockedReasonRef.current) {
      return;
    }
    syncBlockedReasonRef.current = reason;
    console.warn(`Cloud sync disabled for this session: ${reason}`);
  }, []);

  // Load canvases from localStorage on mount
  useEffect(() => {
    const loadCanvases = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as ExcalidrawCanvas[];
          const normalized = parsed.map((canvas) => ({
            ...canvas,
            project: canvas.project || DEFAULT_PROJECT,
          }));
          setCanvases(normalized);
        }

        const storedProjects = localStorage.getItem(PROJECTS_STORAGE_KEY);
        if (storedProjects) {
          const parsedProjects = JSON.parse(storedProjects) as string[];
          const uniqueProjects = Array.from(
            new Set([DEFAULT_PROJECT, ...parsedProjects.filter(Boolean)])
          );
          setProjects(uniqueProjects);
        }
      } catch (error) {
        console.error('Failed to load canvases:', error);
      } finally {
        setLoading(false);
      }
    };
    loadCanvases();
  }, []);

  // Save canvases to localStorage whenever they change
  const saveCanvases = useCallback((updatedCanvases: ExcalidrawCanvas[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCanvases));
      setCanvases(updatedCanvases);
    } catch (error) {
      console.error('Failed to save canvases:', error);
    }
  }, []);

  // When signed in and DB is configured, merge local data with server data.
  const { user } = useAuth();
  const canSyncWithDb = useMemo(
    () => Boolean(APPWRITE_DB_ENABLED && user?.$id),
    [user]
  );

  useEffect(() => {
    if (!canSyncWithDb || !user?.$id) {
      remoteHydratedRef.current = false;
      syncBlockedReasonRef.current = null;
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const remoteCanvases = await listUserCanvases(user.$id);

        const stored = localStorage.getItem(STORAGE_KEY);
        let localCanvases: ExcalidrawCanvas[] = [];
        if (stored) {
          try {
            localCanvases = JSON.parse(stored) as ExcalidrawCanvas[];
          } catch (err) {
            console.error('Failed to parse local canvases for merge:', err);
          }
        }

        // Merge by id preferring the newest updatedAt
        const map = new Map<string, ExcalidrawCanvas>();
        localCanvases.forEach((c) => map.set(c.id, c));
        remoteCanvases.forEach((c) => {
          const existing = map.get(c.id);
          if (!existing || (c.updatedAt && c.updatedAt > existing.updatedAt)) {
            map.set(c.id, c);
          }
        });

        const merged = Array.from(map.values()).sort(
          (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
        );
        if (!cancelled && merged.length > 0) {
          saveCanvases(merged);
        }

        remoteHydratedRef.current = true;
        previousCanvasIdsRef.current = merged.map((c) => c.id);
        previousCanvasUpdatedAtRef.current = new Map(
          merged.map((canvas) => [canvas.id, canvas.updatedAt || 0])
        );
      } catch (err) {
        if (err instanceof CanvasSyncError) {
          blockCloudSync(err.message);
        } else {
          console.error('Failed to sync canvases from Appwrite DB:', err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blockCloudSync, canSyncWithDb, saveCanvases, user?.$id]);

  // Push local changes to Appwrite DB when signed in.
  useEffect(() => {
    if (
      !canSyncWithDb ||
      !user?.$id ||
      !remoteHydratedRef.current ||
      syncingRef.current ||
      Boolean(syncBlockedReasonRef.current)
    ) {
      return;
    }

    let cancelled = false;

    const t = setTimeout(async () => {
      try {
        syncingRef.current = true;

        const currentIds = new Set(canvases.map((c) => c.id));
        const previousIds = previousCanvasIdsRef.current;
        const previousUpdatedAtMap = previousCanvasUpdatedAtRef.current;
        const nextUpdatedAtMap = new Map<string, number>();

        for (const canvas of canvases) {
          if (cancelled) {
            return;
          }

          const canvasUpdatedAt = canvas.updatedAt || 0;
          const previousUpdatedAt = previousUpdatedAtMap.get(canvas.id);
          if (previousUpdatedAt !== canvasUpdatedAt) {
            await upsertCanvas(user.$id, canvas);
          }

          nextUpdatedAtMap.set(canvas.id, canvasUpdatedAt);
        }

        for (const previousId of previousIds) {
          if (cancelled) {
            return;
          }
          if (!currentIds.has(previousId)) {
            await deleteCanvasDocument(previousId);
          }
        }

        previousCanvasIdsRef.current = [...currentIds];
        previousCanvasUpdatedAtRef.current = nextUpdatedAtMap;
      } catch (err) {
        if (!cancelled) {
          if (err instanceof CanvasSyncError) {
            blockCloudSync(err.message);
          } else {
            console.error('Failed to sync canvases to Appwrite DB:', err);
          }
        }
      } finally {
        syncingRef.current = false;
      }
    }, 800);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [blockCloudSync, canvases, canSyncWithDb, user?.$id]);

  const createCanvas = useCallback(
    (name: string, description?: string, project = DEFAULT_PROJECT) => {
      const newCanvas: ExcalidrawCanvas = {
        id: `canvas-${Date.now()}`,
        name,
        description,
        project,
        data: JSON.stringify({ elements: [], appState: {} }), // Empty canvas with proper structure
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      saveCanvases([...canvases, newCanvas]);
      return newCanvas;
    },
    [canvases, saveCanvases]
  );

  const addProject = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    setProjects((prev) => {
      if (prev.includes(trimmed)) {
        return prev;
      }
      const updated = [...prev, trimmed];
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const moveCanvasToProject = useCallback(
    (id: string, project: string) => {
      const targetProject = project.trim() || DEFAULT_PROJECT;
      const updated = canvases.map((canvas) =>
        canvas.id === id
          ? {
              ...canvas,
              project: targetProject,
              updatedAt: Date.now(),
            }
          : canvas
      );
      saveCanvases(updated);

      setProjects((prev) => {
        if (prev.includes(targetProject)) {
          return prev;
        }
        const next = [...prev, targetProject];
        localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    [canvases, saveCanvases]
  );

  const deleteProject = useCallback(
    (name: string) => {
      if (!name || name === DEFAULT_PROJECT) {
        return;
      }

      const updatedCanvases = canvases.map((canvas) =>
        canvas.project === name
          ? {
              ...canvas,
              project: DEFAULT_PROJECT,
              updatedAt: Date.now(),
            }
          : canvas
      );
      saveCanvases(updatedCanvases);

      setProjects((prev) => {
        const next = prev.filter((project) => project !== name);
        localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    [canvases, saveCanvases]
  );

  const updateCanvas = useCallback(
    (id: string, updates: Partial<ExcalidrawCanvas>) => {
      const updated = canvases.map((canvas) =>
        canvas.id === id
          ? {
              ...canvas,
              ...updates,
              updatedAt: Date.now(),
            }
          : canvas
      );
      saveCanvases(updated);
    },
    [canvases, saveCanvases]
  );

  const deleteCanvas = useCallback(
    (id: string) => {
      const updated = canvases.filter((canvas) => canvas.id !== id);
      saveCanvases(updated);
    },
    [canvases, saveCanvases]
  );

  const getCanvas = useCallback(
    (id: string) => {
      return canvases.find((canvas) => canvas.id === id);
    },
    [canvases]
  );

  const getCanvasList = useCallback(() => {
    return canvases.map((canvas): CanvasListItem => ({
      id: canvas.id,
      name: canvas.name,
      description: canvas.description,
      project: canvas.project,
      data: canvas.data,
      createdAt: canvas.createdAt,
      updatedAt: canvas.updatedAt,
    }));
  }, [canvases]);

  return {
    canvases,
    loading,
    createCanvas,
    addProject,
    moveCanvasToProject,
    deleteProject,
    updateCanvas,
    deleteCanvas,
    projects,
    getCanvas,
    getCanvasList,
  };
}
