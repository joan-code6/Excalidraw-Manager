export interface ExcalidrawCanvas {
  id: string;
  name: string;
  description?: string;
  project: string;
  data: string; // JSON string of Excalidraw elements + appState + thumbnail
  createdAt: number;
  updatedAt: number;
}

export interface CanvasShare {
  id: string; // Share ID (unique token)
  canvasId: string; // Reference to the canvas
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
  data: string; // Synced canvas data for fast read access
}

export type CanvasListItem = ExcalidrawCanvas;
