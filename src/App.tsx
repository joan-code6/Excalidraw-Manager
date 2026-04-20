import { useEffect, useState } from "react"
import {
  Routes,
  Route,
  useParams,
  useNavigate,
  useSearchParams,
} from "react-router-dom"
import { useCanvases } from "@/hooks/useCanvases"
import { CanvasGallery } from "@/components/CanvasGallery"
import { CanvasEditor } from "@/components/CanvasEditor"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ExcalidrawCanvas } from "@/types/canvas"

type CanvasesApi = ReturnType<typeof useCanvases>

function GalleryPage({ canvasesApi }: { canvasesApi: CanvasesApi }) {
  const navigate = useNavigate()
  const { projectId } = useParams()

  const {
    loading,
    createCanvas,
    addProject,
    moveCanvasToProject,
    deleteProject,
    renameProject,
    projects,
    deleteCanvas,
    getCanvasList,
  } = canvasesApi

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="text-center">
          <div className="mb-4 size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading canvases...</p>
        </div>
      </div>
    )
  }

  return (
    <CanvasGallery
      projectId={projectId || null}
      canvases={getCanvasList()}
      projects={projects}
      onAddProject={addProject}
      onDeleteProject={deleteProject}
      onRenameProject={renameProject}
      onMoveCanvasToProject={moveCanvasToProject}
      onCreateNew={(name, description, project) => {
        const newCanvas = createCanvas(name, description, project)
        navigate(`/canvas/${newCanvas.id}`, { replace: true })
      }}
      onCreateTemp={() => {
        const tempId = `temp-${Date.now()}`
        navigate(`/canvas/${tempId}?temp=true`, { replace: true })
      }}
      onOpenProject={(project) => {
        navigate(
          project === "/" ? "/" : `/project/${encodeURIComponent(project)}`
        )
      }}
      onOpenCanvas={(canvasId) => {
        navigate(`/canvas/${canvasId}`)
      }}
      onDeleteCanvas={(canvasId) => {
        deleteCanvas(canvasId)
      }}
      onBack={() => navigate("/")}
    />
  )
}

function EditorPage({ canvasesApi }: { canvasesApi: CanvasesApi }) {
  const navigate = useNavigate()
  const { canvasId } = useParams()
  const [searchParams] = useSearchParams()
  const isTemp = searchParams.get("temp") === "true"

  const { loading, updateCanvas, getCanvas } = canvasesApi

  const [tempCanvas, setTempCanvas] = useState<ExcalidrawCanvas | null>(null)

  useEffect(() => {
    if (isTemp) {
      const now = Date.now()
      setTempCanvas({
        id: canvasId!,
        name: "Temp Canvas",
        description: "Ephemeral canvas. It will be deleted on close.",
        project: "Temp",
        data: JSON.stringify({ elements: [], appState: {} }),
        createdAt: now,
        updatedAt: now,
      })
    }
  }, [canvasId, isTemp])

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="text-center">
          <div className="mb-4 size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading canvas...</p>
        </div>
      </div>
    )
  }

  const canvas = isTemp ? tempCanvas : canvasId ? getCanvas(canvasId) : null

  if (!canvas) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">Canvas not found</p>
        </div>
      </div>
    )
  }

  return (
    <CanvasEditor
      canvas={canvas}
      onSave={(data) => {
        if (canvasId) {
          if (isTemp) {
            setTempCanvas((prev) =>
              prev ? { ...prev, data, updatedAt: Date.now() } : prev
            )
          } else {
            updateCanvas(canvasId, { data })
          }
        }
      }}
      onRename={(name) => {
        if (!canvasId) return
        if (isTemp) {
          setTempCanvas((prev) =>
            prev ? { ...prev, name, updatedAt: Date.now() } : prev
          )
        } else {
          updateCanvas(canvasId, { name })
        }
      }}
      onBack={() => {
        navigate(-1)
      }}
    />
  )
}

export function App() {
  const canvasesApi = useCanvases()
  const activeConflict = canvasesApi.syncConflicts[0]

  return (
    <>
      <Routes>
        <Route path="/" element={<GalleryPage canvasesApi={canvasesApi} />} />
        <Route
          path="/project/:projectId"
          element={<GalleryPage canvasesApi={canvasesApi} />}
        />
        <Route
          path="/canvas/:canvasId"
          element={<EditorPage canvasesApi={canvasesApi} />}
        />
      </Routes>

      <Dialog open={Boolean(activeConflict)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Sync conflict detected</DialogTitle>
            <DialogDescription>
              {activeConflict ? (
                activeConflict.remoteDeleted
                  ? `Canvas "${activeConflict.canvasName}" was changed locally, but it was deleted remotely.`
                  : `Canvas "${activeConflict.canvasName}" was edited in another session while you also changed it here.`
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {activeConflict && (
            <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p>
                Local update: {new Date(activeConflict.localUpdatedAt).toLocaleString()}
              </p>
              <p>
                Remote update: {activeConflict.remoteDeleted ? "Deleted remotely" : new Date(activeConflict.remoteUpdatedAt).toLocaleString()}
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              onClick={() => {
                if (!activeConflict) return
                canvasesApi.resolveSyncConflict(
                  activeConflict.id,
                  "accept-remote"
                )
              }}
            >
              Accept Remote
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (!activeConflict) return
                canvasesApi.resolveSyncConflict(
                  activeConflict.id,
                  "save-local-as-new"
                )
              }}
            >
              Save Local As New
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!activeConflict) return
                canvasesApi.resolveSyncConflict(
                  activeConflict.id,
                  "overwrite-remote"
                )
              }}
            >
              Overwrite Remote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default App
