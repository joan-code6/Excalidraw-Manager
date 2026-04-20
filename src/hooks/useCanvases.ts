import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import type { ExcalidrawCanvas, CanvasListItem } from "@/types/canvas"
import { useAuth } from "@/hooks/useAuth"
import { APPWRITE_DB_ENABLED } from "@/lib/appwrite"
import {
  type CanvasUpsertMode,
  CanvasSyncError,
  deleteCanvasDocument,
  getCanvasById,
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

function createConflictCanvasName(name: string) {
  const timestamp = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
  return `${name} (Conflict copy ${timestamp})`
}

function createConflictCanvas(source: ExcalidrawCanvas): ExcalidrawCanvas {
  const now = Date.now()
  return {
    ...source,
    id: createCanvasId(),
    name: createConflictCanvasName(source.name),
    createdAt: now,
    updatedAt: now,
  }
}

export type CanvasConflictResolution =
  | "save-local-as-new"
  | "overwrite-remote"
  | "accept-remote"

export interface CanvasSyncConflict {
  id: string
  canvasId: string
  canvasName: string
  localUpdatedAt: number
  remoteUpdatedAt: number
  remoteDeleted: boolean
}

interface PendingConflictContext {
  conflict: CanvasSyncConflict
  localCanvas: ExcalidrawCanvas
  remoteCanvas: ExcalidrawCanvas | null
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
  const [syncConflicts, setSyncConflicts] = useState<CanvasSyncConflict[]>([])
  const conflictByCanvasIdRef = useRef<Map<string, string>>(new Map())
  const conflictContextRef = useRef<Map<string, PendingConflictContext>>(new Map())
  const forceOverwriteCanvasIdsRef = useRef<Set<string>>(new Set())

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
  const saveCanvases = useCallback(
    (
      updatedCanvases:
        | ExcalidrawCanvas[]
        | ((currentCanvases: ExcalidrawCanvas[]) => ExcalidrawCanvas[])
    ) => {
      try {
        setCanvases((currentCanvases) => {
          const nextCanvases =
            typeof updatedCanvases === "function"
              ? updatedCanvases(currentCanvases)
              : updatedCanvases
          const normalized = normalizeCanvases(nextCanvases)
          localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))

          setProjects((prev) => {
            const next = mergeProjectsWithDerived(prev, normalized)
            localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next))
            return next
          })

          return normalized
        })
      } catch (error) {
        console.error("Failed to save canvases:", error)
      }
    },
    []
  )

  const resolveSyncConflict = useCallback(
    (conflictId: string, resolution: CanvasConflictResolution) => {
      const context = conflictContextRef.current.get(conflictId)
      if (!context) {
        return
      }

      conflictContextRef.current.delete(conflictId)
      conflictByCanvasIdRef.current.delete(context.conflict.canvasId)
      setSyncConflicts((prev) => prev.filter((conflict) => conflict.id !== conflictId))

      if (resolution === "overwrite-remote") {
        forceOverwriteCanvasIdsRef.current.add(context.conflict.canvasId)
        return
      }

      if (resolution === "accept-remote") {
        saveCanvases((currentCanvases) => {
          const withoutLocal = currentCanvases.filter(
            (canvas) => canvas.id !== context.conflict.canvasId
          )
          if (context.remoteCanvas) {
            return [context.remoteCanvas, ...withoutLocal].sort(
              (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
            )
          }
          return withoutLocal
        })

        if (context.remoteCanvas) {
          knownRemoteIdsRef.current.add(context.conflict.canvasId)
          previousCanvasUpdatedAtRef.current.set(
            context.conflict.canvasId,
            context.remoteCanvas.updatedAt || 0
          )
        } else {
          knownRemoteIdsRef.current.delete(context.conflict.canvasId)
          previousCanvasUpdatedAtRef.current.delete(context.conflict.canvasId)
          previousCanvasIdsRef.current = previousCanvasIdsRef.current.filter(
            (id) => id !== context.conflict.canvasId
          )
        }
        forceOverwriteCanvasIdsRef.current.delete(context.conflict.canvasId)
        return
      }

      // save-local-as-new
      const conflictCopy = createConflictCanvas(context.localCanvas)
      saveCanvases((currentCanvases) => {
        const withoutOriginal = currentCanvases.filter(
          (canvas) => canvas.id !== context.conflict.canvasId
        )
        const next = context.remoteCanvas
          ? [context.remoteCanvas, conflictCopy, ...withoutOriginal]
          : [conflictCopy, ...withoutOriginal]
        return next.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      })

      if (context.remoteCanvas) {
        knownRemoteIdsRef.current.add(context.conflict.canvasId)
        previousCanvasUpdatedAtRef.current.set(
          context.conflict.canvasId,
          context.remoteCanvas.updatedAt || 0
        )
      } else {
        knownRemoteIdsRef.current.delete(context.conflict.canvasId)
        previousCanvasUpdatedAtRef.current.delete(context.conflict.canvasId)
        previousCanvasIdsRef.current = previousCanvasIdsRef.current.filter(
          (id) => id !== context.conflict.canvasId
        )
      }
      previousCanvasUpdatedAtRef.current.delete(conflictCopy.id)
      forceOverwriteCanvasIdsRef.current.delete(context.conflict.canvasId)
    },
    [saveCanvases]
  )

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
      conflictByCanvasIdRef.current = new Map()
      conflictContextRef.current = new Map()
      forceOverwriteCanvasIdsRef.current = new Set()
      setSyncConflicts([])
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

    if (
      syncConflicts.length > 0 ||
      conflictByCanvasIdRef.current.size > 0 ||
      conflictContextRef.current.size > 0
    ) {
      conflictByCanvasIdRef.current = new Map()
      conflictContextRef.current = new Map()
      forceOverwriteCanvasIdsRef.current = new Set()
      setSyncConflicts([])
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
        const nextKnownRemoteIds = new Set<string>()
        const remoteAdoptions = new Map<string, ExcalidrawCanvas>()

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
          nextKnownRemoteIds.delete(pendingId)
        }

        for (const canvas of canvases) {
          if (cancelled) {
            return
          }

          const hasPendingConflict =
            conflictByCanvasIdRef.current.has(canvas.id) &&
            !forceOverwriteCanvasIdsRef.current.has(canvas.id)
          if (hasPendingConflict) {
            const previousUpdatedAt = previousUpdatedAtMap.get(canvas.id)
            if (previousUpdatedAt !== undefined) {
              nextUpdatedAtMap.set(canvas.id, previousUpdatedAt)
            }
            if (knownRemoteIdSet.has(canvas.id) || previousIdSet.has(canvas.id)) {
              nextKnownRemoteIds.add(canvas.id)
            }
            continue
          }

          if (pendingDeleteIdsRef.current.has(canvas.id)) {
            continue
          }

          const canvasUpdatedAt = canvas.updatedAt || 0
          const previousUpdatedAt = previousUpdatedAtMap.get(canvas.id)
          const mightExistRemotely =
            knownRemoteIdSet.has(canvas.id) ||
            previousIdSet.has(canvas.id) ||
            previousUpdatedAt !== undefined

          if (previousUpdatedAt !== canvasUpdatedAt) {
            const remoteCanvas = mightExistRemotely
              ? await getCanvasById(canvas.id)
              : null
            const remoteUpdatedAt = remoteCanvas?.updatedAt || 0
            const remoteChangedSinceBaseline =
              remoteCanvas === null
                ? previousUpdatedAt !== undefined && mightExistRemotely
                : previousUpdatedAt === undefined
                  ? false
                  : remoteUpdatedAt > previousUpdatedAt

            if (remoteChangedSinceBaseline) {
              if (forceOverwriteCanvasIdsRef.current.has(canvas.id)) {
                await upsertCanvas(user.$id, canvas, "prefer-update")
                forceOverwriteCanvasIdsRef.current.delete(canvas.id)
                nextKnownRemoteIds.add(canvas.id)
                nextUpdatedAtMap.set(canvas.id, canvasUpdatedAt)
                continue
              }

              // Automatic conflict handling:
              // 1) Remote deleted: re-create from local edit.
              // 2) Remote newer: accept remote into local store.
              // 3) Local newer or equal: overwrite remote with local.
              if (remoteCanvas === null) {
                await upsertCanvas(user.$id, canvas, "prefer-create")
                nextKnownRemoteIds.add(canvas.id)
                nextUpdatedAtMap.set(canvas.id, canvasUpdatedAt)
                continue
              }

              if (remoteUpdatedAt > canvasUpdatedAt) {
                remoteAdoptions.set(canvas.id, remoteCanvas)
                nextKnownRemoteIds.add(canvas.id)
                nextUpdatedAtMap.set(canvas.id, remoteUpdatedAt)
                continue
              }

              await upsertCanvas(user.$id, canvas, "prefer-update")
              nextKnownRemoteIds.add(canvas.id)
              nextUpdatedAtMap.set(canvas.id, canvasUpdatedAt)
              continue
            }

            const upsertMode: CanvasUpsertMode = remoteCanvas
              ? "prefer-update"
              : "prefer-create"
            await upsertCanvas(user.$id, canvas, upsertMode)
            nextKnownRemoteIds.add(canvas.id)
          }

          if (mightExistRemotely) {
            nextKnownRemoteIds.add(canvas.id)
          }

          nextUpdatedAtMap.set(canvas.id, canvasUpdatedAt)
        }

        if (remoteAdoptions.size > 0 && !cancelled) {
          saveCanvases((currentCanvases) => {
            const merged = currentCanvases.map((existing) => {
              const adopted = remoteAdoptions.get(existing.id)
              return adopted || existing
            })

            return merged.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
          })
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
            nextKnownRemoteIds.delete(previousId)
          }
        }

        knownRemoteIdsRef.current = new Set(nextKnownRemoteIds)
        previousCanvasIdsRef.current = canvases.map((c) => c.id)
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
  }, [blockCloudSync, canvases, canSyncWithDb, saveCanvases, syncConflicts.length, user?.$id])

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
      saveCanvases((currentCanvases) => [...currentCanvases, newCanvas])
      return newCanvas
    },
    [saveCanvases]
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
      saveCanvases((currentCanvases) =>
        currentCanvases.map((canvas) =>
          canvas.id === id
            ? {
                ...canvas,
                project: targetProject,
                updatedAt: Date.now(),
              }
            : canvas
        )
      )

      setProjects((prev) => {
        if (prev.includes(targetProject)) {
          return prev
        }
        const next = [...prev, targetProject]
        localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next))
        return next
      })
    },
    [saveCanvases]
  )

  const deleteProject = useCallback(
    (name: string) => {
      if (!name || name === DEFAULT_PROJECT) {
        return
      }

      saveCanvases((currentCanvases) =>
        currentCanvases.map((canvas) =>
          canvas.project === name
            ? {
                ...canvas,
                project: DEFAULT_PROJECT,
                updatedAt: Date.now(),
              }
            : canvas
        )
      )

      setProjects((prev) => {
        const next = prev.filter((project) => project !== name)
        localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next))
        return next
      })
    },
    [saveCanvases]
  )

  const renameProject = useCallback(
    (oldName: string, newName: string) => {
      if (!oldName || !newName || oldName === newName) {
        return
      }

      saveCanvases((currentCanvases) =>
        currentCanvases.map((canvas) =>
          canvas.project === oldName
            ? {
                ...canvas,
                project: newName,
                updatedAt: Date.now(),
              }
            : canvas
        )
      )

      setProjects((prev) => prev.map((p) => (p === oldName ? newName : p)))
    },
    [saveCanvases]
  )

  const updateCanvas = useCallback(
    (id: string, updates: Partial<ExcalidrawCanvas>) => {
      saveCanvases((currentCanvases) =>
        currentCanvases.map((canvas) =>
          canvas.id === id
            ? {
                ...canvas,
                ...updates,
                updatedAt: Date.now(),
              }
            : canvas
        )
      )
    },
    [saveCanvases]
  )

  const deleteCanvas = useCallback(
    (id: string) => {
      const deletedAt = Date.now()
      pendingDeleteIdsRef.current.set(id, deletedAt)
      deleteTombstonesRef.current.set(id, deletedAt)
      saveCanvases((currentCanvases) =>
        currentCanvases.filter((canvas) => canvas.id !== id)
      )
    },
    [saveCanvases]
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
    syncConflicts,
    resolveSyncConflict,
  }
}
