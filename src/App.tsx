import { useState } from 'react';
import { useCanvases } from '@/hooks/useCanvases';
import { CanvasGallery } from '@/components/CanvasGallery';
import { CanvasEditor } from '@/components/CanvasEditor';
import type { ExcalidrawCanvas } from '@/types/canvas';

export function App() {
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
  const [tempCanvas, setTempCanvas] = useState<ExcalidrawCanvas | null>(null);
  const {
    loading,
    createCanvas,
    addProject,
    moveCanvasToProject,
    deleteProject,
    projects,
    updateCanvas,
    deleteCanvas,
    getCanvasList,
    getCanvas,
  } = useCanvases();

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="text-center">
          <div className="mb-4 size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading canvases...</p>
        </div>
      </div>
    );
  }

  const isTempCanvasActive = Boolean(
    activeCanvasId && tempCanvas && tempCanvas.id === activeCanvasId
  );
  const currentCanvas = isTempCanvasActive
    ? tempCanvas
    : activeCanvasId
      ? getCanvas(activeCanvasId)
      : null;

  if (currentCanvas) {
    return (
      <CanvasEditor
        canvas={currentCanvas}
        onSave={(data) => {
          if (activeCanvasId) {
            if (isTempCanvasActive) {
              setTempCanvas((prev) => (prev ? { ...prev, data, updatedAt: Date.now() } : prev));
            } else {
              updateCanvas(activeCanvasId, { data });
            }
          }
        }}
        onBack={() => {
          if (isTempCanvasActive) {
            setTempCanvas(null);
          }
          setActiveCanvasId(null);
        }}
      />
    );
  }

  return (
    <CanvasGallery
      canvases={getCanvasList()}
      projects={projects}
      onAddProject={addProject}
      onDeleteProject={deleteProject}
      onMoveCanvasToProject={moveCanvasToProject}
      onCreateNew={(name, description, project) => {
        const newCanvas = createCanvas(name, description, project);
        // Automatically open the new canvas
        setActiveCanvasId(newCanvas.id);
      }}
      onCreateTemp={() => {
        const tempId = `temp-${Date.now()}`;
        const now = Date.now();
        const temp: ExcalidrawCanvas = {
          id: tempId,
          name: 'Temp Canvas',
          description: 'Ephemeral canvas. It will be deleted on close.',
          project: 'Temp',
          data: JSON.stringify({ elements: [], appState: {} }),
          createdAt: now,
          updatedAt: now,
        };
        setTempCanvas(temp);
        setActiveCanvasId(tempId);
      }}
      onOpenCanvas={(canvasId) => {
        setActiveCanvasId(canvasId);
      }}
      onDeleteCanvas={(canvasId) => {
        deleteCanvas(canvasId);
      }}
    />
  );
}

export default App
