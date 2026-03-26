import { useState, useCallback, useEffect } from 'react';
import type { ExcalidrawCanvas, CanvasListItem } from '@/types/canvas';

const STORAGE_KEY = 'excalidraw-canvases';
const PROJECTS_STORAGE_KEY = 'excalidraw-projects';
const DEFAULT_PROJECT = 'General';

export function useCanvases() {
  const [canvases, setCanvases] = useState<ExcalidrawCanvas[]>([]);
  const [projects, setProjects] = useState<string[]>([DEFAULT_PROJECT]);
  const [loading, setLoading] = useState(true);

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
