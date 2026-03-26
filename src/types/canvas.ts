export interface ExcalidrawCanvas {
  id: string;
  name: string;
  description?: string;
  project: string;
  data: string; // JSON string of Excalidraw elements + appState + thumbnail
  createdAt: number;
  updatedAt: number;
}

export type CanvasListItem = ExcalidrawCanvas;
