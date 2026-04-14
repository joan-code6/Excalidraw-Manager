import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import type { ExcalidrawCanvas, CanvasListItem } from "@/types/canvas"
import { useAuth } from "@/hooks/useAuth"
import { APPWRITE_DB_ENABLED } from "@/lib/appwrite"
import {
  type CanvasUpsertMode,
  CanvasSyncError,
  deleteCanvasDocument,
  listUserCanvases,
  upsertCanvas,
} from "@/lib/canvasSyncDb"

const STORAGE_KEY = "excalidraw-canvases"
const PROJECTS_STORAGE_KEY = "excalidraw-projects"
const DEFAULT_PROJECT = "General"
const CLOUD_BASELINE_STORAGE_PREFIX = "excalidraw-cloud-baseline"

const APPWRITE_ID_MAX_LENGTH = 36
const APPWRITE_ID_PATTERN = /^[A-Za-z0-9._-]+$/

function createShortCanvasId() {
  const timePart = Date.now().toString(36)
  const randomPart = Math.random().toString(36).slice(2, 10)
  return `canvas-${timePart}-${randomPart}`
}

function hashStringBase36(input: string) {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
}

function createDeterministicCloudSafeId(input: string) {
  const normalized = input.trim().toLowerCase()
  const hashPart = `${hashStringBase36(normalized)}${hashStringBase36(`${normalized}:salt`)}`
  const maxBodyLength = APPWRITE_ID_MAX_LENGTH - "canvas-".length
  const body = hashPart.slice(0, maxBodyLength)
  return `canvas-${body}`
}

function toCloudSafeCanvasId(input: string) {
  if (
    typeof input === "string" &&
    input.length > 0 &&
    input.length <= APPWRITE_ID_MAX_LENGTH &&
    APPWRITE_ID_PATTERN.test(input)
  ) {
    return input
  }

  if (typeof input === "string" && input.trim().length > 0) {
    return createDeterministicCloudSafeId(input)
  }

  return createShortCanvasId()
}

function normalizeCanvases(input: ExcalidrawCanvas[]): ExcalidrawCanvas[] {
  return input.map((canvas) => ({
    ...canvas,
    id: toCloudSafeCanvasId(canvas.id),
    project: canvas.project || DEFAULT_PROJECT,
  }))
}

function deriveProjectsFromCanvases(items: ExcalidrawCanvas[]): string[] {
  return Array.from(
    new Set([
      DEFAULT_PROJECT,
      ...items.map((canvas) => canvas.project || DEFAULT_PROJECT),
    ])
  )
}

function mergeProjectsWithDerived(
  storedProjects: string[],
  items: ExcalidrawCanvas[]
): string[] {
  return Array.from(
    new Set([
      DEFAULT_PROJECT,
      ...storedProjects.map((project) => project.trim()).filter(Boolean),
      ...deriveProjectsFromCanvases(items),
    ])
  )
}

function createCanvasId() {
  return createShortCanvasId()
}

function getCloudBaselineStorageKey(userId: string) {
  return `${CLOUD_BASELINE_STORAGE_PREFIX}:${userId}`
}

function loadCloudBaseline(userId: string): {
  ids: string[]
  updatedAtMap: Map<string, number>
} | null {
  try {
    const raw = localStorage.getItem(getCloudBaselineStorageKey(userId))
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as {
      ids?: unknown
      updatedAt?: Record<string, unknown>
    }

    const ids = Array.isArray(parsed.ids)
      ? parsed.ids.filter(
          (id): id is string => typeof id === "string" && id.length > 0
        )
      : []

    const updatedAtRecord =
      typeof parsed.updatedAt === "object" && parsed.updatedAt
        ? (parsed.updatedAt as Record<string, unknown>)
        : {}

    const updatedAtMap = new Map<string, number>()
    for (const [id, value] of Object.entries(updatedAtRecord)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        updatedAtMap.set(id, value)
      }
    }

    return {
      ids,
      updatedAtMap,
    }
  } catch (error) {
    console.error("Failed to load cloud baseline cache:", error)
    return null
  }
}

function saveCloudBaseline(
  userId: string,
  ids: string[],
  updatedAtMap: Map<string, number>
) {
  try {
    const updatedAt = Object.fromEntries(updatedAtMap.entries())
    localStorage.setItem(
      getCloudBaselineStorageKey(userId),
      JSON.stringify({
        ids,
        updatedAt,
      })
    )
  } catch (error) {
    console.error("Failed to save cloud baseline cache:", error)
  }
}

export function useCanvases() {
  const [canvases, setCanvases] = useState<ExcalidrawCanvas[]>([])
  const [projects, setProjects] = useState<string[]>([DEFAULT_PROJECT])
  const [loading, setLoading] = useState(true)
  const [remoteRefreshTick, setRemoteRefreshTick] = useState(0)
  const remoteHydratedRef = useRef(false)
  const baselineLoadedForUserRef = useRef<string | null>(null)
  const knownRemoteIdsRef = useRef<Set<string>>(new Set())
  const previousCanvasIdsRef = useRef<string[]>([])
  const previousCanvasUpdatedAtRef = useRef<Map<string, number>>(new Map())
  const pendingDeleteIdsRef = useRef<Map<string, number>>(new Map())
  const deleteTombstonesRef = useRef<Map<string, number>>(new Map())
  const syncingRef = useRef(false)
  const syncBlockedReasonRef = useRef<string | null>(null)

  const blockCloudSync = useCallback((reason: string) => {
    if (syncBlockedReasonRef.current) {
      return
    }
    syncBlockedReasonRef.current = reason
    console.warn(`Cloud sync disabled for this session: ${reason}`)
  }, [])

  // Load canvases from localStorage on mount
  useEffect(() => {
    const loadCanvases = () => {
      try {
        let normalizedCanvases: ExcalidrawCanvas[] = []
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored) as ExcalidrawCanvas[]
          normalizedCanvases = normalizeCanvases(parsed)
          setCanvases(normalizedCanvases)
        }

        let storedProjectsList: string[] = []
        const storedProjects = localStorage.getItem(PROJECTS_STORAGE_KEY)
        if (storedProjects) {
          storedProjectsList = JSON.parse(storedProjects) as string[]
        }

        const mergedProjects = mergeProjectsWithDerived(
          storedProjectsList,
          normalizedCanvases
        )
        setProjects(mergedProjects)
        localStorage.setItem(
          PROJECTS_STORAGE_KEY,
          JSON.stringify(mergedProjects)
        )
      } catch (error) {
        console.error("Failed to load canvases:", error)
      } finally {
        setLoading(false)
      }
    }
    loadCanvases()
  }, [])

  // Save canvases to localStorage whenever they change
  const saveCanvases = useCallback((updatedCanvases: ExcalidrawCanvas[]) => {
    try {
      const normalized = normalizeCanvases(updatedCanvases)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
      setCanvases(normalized)

      setProjects((prev) => {
        const next = mergeProjectsWithDerived(prev, normalized)
        localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next))
        return next
      })
    } catch (error) {
      console.error("Failed to save canvases:", error)
    }
  }, [])

  // When signed in and DB is configured, merge local data with server data.
  const { user } = useAuth()
  const canSyncWithDb = useMemo(
    () => Boolean(APPWRITE_DB_ENABLED && user?.$id),
    [user]
  )

  useEffect(() => {
    if (!canSyncWithDb) {
      return
    }

    const refreshRemote = () => {
      setRemoteRefreshTick((tick) => tick + 1)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshRemote()
      }
    }

    window.addEventListener("focus", refreshRemote)
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      window.removeEventListener("focus", refreshRemote)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [canSyncWithDb])

  useEffect(() => {
    if (!canSyncWithDb || !user?.$id) {
      remoteHydratedRef.current = false
      syncBlockedReasonRef.current = null
      baselineLoadedForUserRef.current = null
      knownRemoteIdsRef.current = new Set()
      return
    }

    if (baselineLoadedForUserRef.current !== user.$id) {
      const baseline = loadCloudBaseline(user.$id)
      if (baseline) {
        previousCanvasIdsRef.current = baseline.ids
        previousCanvasUpdatedAtRef.current = baseline.updatedAtMap
        knownRemoteIdsRef.current = new Set(baseline.ids)
      } else {
        previousCanvasIdsRef.current = []
        previousCanvasUpdatedAtRef.current = new Map()
        knownRemoteIdsRef.current = new Set()
      }
      baselineLoadedForUserRef.current = user.$id
    }

    let cancelled = false

    ;(async () => {
      try {
        const requestStartedAt = Date.now()
        const rawRemoteCanvases = normalizeCanvases(
          await listUserCanvases(user.$id)
        )
        const rawRemoteIdSet = new Set(
          rawRemoteCanvases.map((canvas) => canvas.id)
        )

        // Clear tombstones only when a fetch that started after delete-time confirms absence remotely.
        for (const [
          deletedId,
          deletedAt,
        ] of deleteTombstonesRef.current.entries()) {
          if (deletedAt <= requestStartedAt && !rawRemoteIdSet.has(deletedId)) {
            deleteTombstonesRef.current.delete(deletedId)
          }
        }

        const remoteCanvases = rawRemoteCanvases.filter(
          (canvas) =>
            !pendingDeleteIdsRef.current.has(canvas.id) &&
            !deleteTombstonesRef.current.has(canvas.id)
        )

        const stored = localStorage.getItem(STORAGE_KEY)
        let localCanvases: ExcalidrawCanvas[] = []
        if (stored) {
          try {
            localCanvases = normalizeCanvases(
              JSON.parse(stored) as ExcalidrawCanvas[]
            )
          } catch (err) {
            console.error("Failed to parse local canvases for merge:", err)
          }
        }

        const remoteById = new Map(
          remoteCanvases.map((canvas) => [canvas.id, canvas])
        )
        const previousUpdatedAtMap = previousCanvasUpdatedAtRef.current

        const reconciledLocalCanvases = localCanvases.filter((localCanvas) => {
          if (
            pendingDeleteIdsRef.current.has(localCanvas.id) ||
            deleteTombstonesRef.current.has(localCanvas.id)
          ) {
            return false
          }

          const remoteCanvas = remoteById.get(localCanvas.id)
          if (remoteCanvas) {
            return true
          }

          const previousUpdatedAt = previousUpdatedAtMap.get(localCanvas.id)
          if (previousUpdatedAt === undefined) {
            // Local-only canvas that has never been synced yet.
            return true
          }

          // If remote no longer has this canvas, keep it only when local changed after last sync.
          return (localCanvas.updatedAt || 0) > previousUpdatedAt
        })

        // Merge by id preferring the newest updatedAt
        const map = new Map<string, ExcalidrawCanvas>()
        reconciledLocalCanvases.forEach((c) => map.set(c.id, c))
        remoteCanvases.forEach((c) => {
          const existing = map.get(c.id)
          if (!existing || (c.updatedAt && c.updatedAt > existing.updatedAt)) {
            map.set(c.id, c)
          }
        })

        const merged = Array.from(map.values()).sort(
          (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
        )
        if (!cancelled) {
          saveCanvases(merged)
        }

        remoteHydratedRef.current = true
        knownRemoteIdsRef.current = new Set(
          rawRemoteCanvases.map((canvas) => canvas.id)
        )
        previousCanvasIdsRef.current = remoteCanvases.map((c) => c.id)
        previousCanvasUpdatedAtRef.current = new Map(
          remoteCanvases.map((canvas) => [canvas.id, canvas.updatedAt || 0])
        )
        saveCloudBaseline(
          user.$id,
          previousCanvasIdsRef.current,
          previousCanvasUpdatedAtRef.current
        )
      } catch (err) {
        if (err instanceof CanvasSyncError) {
          blockCloudSync(err.message)
        } else {
          console.error("Failed to sync canvases from Appwrite DB:", err)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    blockCloudSync,
    canSyncWithDb,
    remoteRefreshTick,
    saveCanvases,
    user?.$id,
  ])

  // Push local changes to Appwrite DB when signed in.
  useEffect(() => {
    if (
      !canSyncWithDb ||
      !user?.$id ||
      !remoteHydratedRef.current ||
      syncingRef.current ||
      Boolean(syncBlockedReasonRef.current)
    ) {
      return
    }

    let cancelled = false

    const t = setTimeout(async () => {
      try {
        syncingRef.current = true

        const currentIds = new Set(canvases.map((c) => c.id))
        const previousIds = previousCanvasIdsRef.current
        const previousIdSet = new Set(previousIds)
        const knownRemoteIdSet = new Set(knownRemoteIdsRef.current)
        const previousUpdatedAtMap = previousCanvasUpdatedAtRef.current
        const nextUpdatedAtMap = new Map<string, number>()

        const pendingDeleteEntries = [...pendingDeleteIdsRef.current.entries()]
        const deletedThisCycle = new Set<string>()
        for (const [pendingId] of pendingDeleteEntries) {
          if (cancelled) {
            return
          }

          // Only issue a remote delete when this canvas is known to exist remotely.
          if (
            knownRemoteIdSet.has(pendingId) ||
            previousIdSet.has(pendingId) ||
            previousUpdatedAtMap.has(pendingId)
          ) {
            await deleteCanvasDocument(pendingId)
          }

          pendingDeleteIdsRef.current.delete(pendingId)
          deletedThisCycle.add(pendingId)
          previousUpdatedAtMap.delete(pendingId)
        }

        for (const canvas of canvases) {
          if (cancelled) {
            return
          }

          if (pendingDeleteIdsRef.current.has(canvas.id)) {
            continue
          }

          const canvasUpdatedAt = canvas.updatedAt || 0
          const previousUpdatedAt = previousUpdatedAtMap.get(canvas.id)
          if (previousUpdatedAt !== canvasUpdatedAt) {
            const upsertMode: CanvasUpsertMode =
              previousIdSet.has(canvas.id) ||
              previousUpdatedAtMap.has(canvas.id)
                ? "prefer-update"
                : "prefer-create"
            await upsertCanvas(user.$id, canvas, upsertMode)
          }

          nextUpdatedAtMap.set(canvas.id, canvasUpdatedAt)
        }

        for (const previousId of knownRemoteIdSet) {
          if (cancelled) {
            return
          }
          if (deletedThisCycle.has(previousId)) {
            continue
          }
          if (!currentIds.has(previousId)) {
            await deleteCanvasDocument(previousId)
          }
        }

        knownRemoteIdsRef.current = new Set(currentIds)
        previousCanvasIdsRef.current = [...currentIds]
        previousCanvasUpdatedAtRef.current = nextUpdatedAtMap
        saveCloudBaseline(
          user.$id,
          previousCanvasIdsRef.current,
          previousCanvasUpdatedAtRef.current
        )
      } catch (err) {
        if (!cancelled) {
          if (err instanceof CanvasSyncError) {
            blockCloudSync(err.message)
          } else {
            console.error("Failed to sync canvases to Appwrite DB:", err)
          }
        }
      } finally {
        syncingRef.current = false
      }
    }, 800)

    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [blockCloudSync, canvases, canSyncWithDb, user?.$id])

  const createCanvas = useCallback(
    (name: string, description?: string, project = DEFAULT_PROJECT) => {
      const newCanvas: ExcalidrawCanvas = {
        id: createCanvasId(),
        name,
        description,
        project,
        data: JSON.stringify({ elements: [], appState: {} }), // Empty canvas with proper structure
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      saveCanvases([...canvases, newCanvas])
      return newCanvas
    },
    [canvases, saveCanvases]
  )

  const addProject = useCallback((name: string) => {
    const trimmed = name.trim()
    if (!trimmed) {
      return
    }
    setProjects((prev) => {
      if (prev.includes(trimmed)) {
        return prev
      }
      const updated = [...prev, trimmed]
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }, [])

  const moveCanvasToProject = useCallback(
    (id: string, project: string) => {
      const targetProject = project.trim() || DEFAULT_PROJECT
      const updated = canvases.map((canvas) =>
        canvas.id === id
          ? {
              ...canvas,
              project: targetProject,
              updatedAt: Date.now(),
            }
          : canvas
      )
      saveCanvases(updated)

      setProjects((prev) => {
        if (prev.includes(targetProject)) {
          return prev
        }
        const next = [...prev, targetProject]
        localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next))
        return next
      })
    },
    [canvases, saveCanvases]
  )

  const deleteProject = useCallback(
    (name: string) => {
      if (!name || name === DEFAULT_PROJECT) {
        return
      }

      const updatedCanvases = canvases.map((canvas) =>
        canvas.project === name
          ? {
              ...canvas,
              project: DEFAULT_PROJECT,
              updatedAt: Date.now(),
            }
          : canvas
      )
      saveCanvases(updatedCanvases)

      setProjects((prev) => {
        const next = prev.filter((project) => project !== name)
        localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next))
        return next
      })
    },
    [canvases, saveCanvases]
  )

  const renameProject = useCallback(
    (oldName: string, newName: string) => {
      if (!oldName || !newName || oldName === newName) {
        return
      }

      const updatedCanvases = canvases.map((canvas) =>
        canvas.project === oldName
          ? {
              ...canvas,
              project: newName,
              updatedAt: Date.now(),
            }
          : canvas
      )
      saveCanvases(updatedCanvases)

      setProjects((prev) => prev.map((p) => (p === oldName ? newName : p)))
    },
    [canvases, saveCanvases]
  )

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
      )
      saveCanvases(updated)
    },
    [canvases, saveCanvases]
  )

  const deleteCanvas = useCallback(
    (id: string) => {
      const deletedAt = Date.now()
      pendingDeleteIdsRef.current.set(id, deletedAt)
      deleteTombstonesRef.current.set(id, deletedAt)
      const updated = canvases.filter((canvas) => canvas.id !== id)
      saveCanvases(updated)
    },
    [canvases, saveCanvases]
  )

  const getCanvas = useCallback(
    (id: string) => {
      return canvases.find((canvas) => canvas.id === id)
    },
    [canvases]
  )

  const getCanvasList = useCallback(() => {
    return canvases.map(
      (canvas): CanvasListItem => ({
        id: canvas.id,
        name: canvas.name,
        description: canvas.description,
        project: canvas.project,
        data: canvas.data,
        createdAt: canvas.createdAt,
        updatedAt: canvas.updatedAt,
      })
    )
  }, [canvases])

  return {
    canvases,
    loading,
    createCanvas,
    addProject,
    moveCanvasToProject,
    deleteProject,
    renameProject,
    updateCanvas,
    deleteCanvas,
    projects,
    getCanvas,
    getCanvasList,
  }
}
