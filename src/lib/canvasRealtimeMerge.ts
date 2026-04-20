export interface SceneSnapshot {
  elements: any[]
  files: Record<string, any>
}

function asObject(value: unknown): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, any>
  }
  return {}
}

function asElementArray(value: unknown): any[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item) => item && typeof item === "object") as any[]
}

function elementVersion(element: any): number {
  return typeof element?.version === "number" ? element.version : 0
}

function elementUpdated(element: any): number {
  return typeof element?.updated === "number" ? element.updated : 0
}

function elementVersionNonce(element: any): number {
  return typeof element?.versionNonce === "number" ? element.versionNonce : 0
}

function pickNewerElement(a: any, b: any): any {
  const aVersion = elementVersion(a)
  const bVersion = elementVersion(b)
  if (bVersion !== aVersion) {
    return bVersion > aVersion ? b : a
  }

  const aUpdated = elementUpdated(a)
  const bUpdated = elementUpdated(b)
  if (bUpdated !== aUpdated) {
    return bUpdated > aUpdated ? b : a
  }

  const aNonce = elementVersionNonce(a)
  const bNonce = elementVersionNonce(b)
  return bNonce >= aNonce ? b : a
}

export function parseSceneSnapshot(raw: string): SceneSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as any

    if (Array.isArray(parsed)) {
      return {
        elements: asElementArray(parsed),
        files: {},
      }
    }

    if (!parsed || typeof parsed !== "object") {
      return null
    }

    return {
      elements: asElementArray(parsed.elements),
      files: asObject(parsed.files),
    }
  } catch {
    return null
  }
}

export function serializeSceneSnapshot(
  elements: any[],
  files: Record<string, any> | null | undefined
): string {
  return JSON.stringify({
    elements: asElementArray(elements),
    files: asObject(files),
  })
}

export function mergeSceneSnapshots(local: SceneSnapshot, remote: SceneSnapshot): SceneSnapshot {
  const byId = new Map<string, any>()

  for (const element of local.elements) {
    if (!element?.id) {
      continue
    }
    byId.set(element.id, element)
  }

  for (const incoming of remote.elements) {
    if (!incoming?.id) {
      continue
    }
    const existing = byId.get(incoming.id)
    if (!existing) {
      byId.set(incoming.id, incoming)
      continue
    }
    byId.set(incoming.id, pickNewerElement(existing, incoming))
  }

  return {
    elements: Array.from(byId.values()),
    files: {
      ...local.files,
      ...remote.files,
    },
  }
}
