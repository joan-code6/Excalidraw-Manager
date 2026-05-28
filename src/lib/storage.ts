export interface SafeSetResult {
  success: boolean
  quotaExceeded?: boolean
  error?: unknown
}

const QUOTA_EVENT_COOLDOWN_MS = 15000
let lastQuotaEventAt = 0

export function estimateSizeInBytes(value: string): number {
  try {
    return new Blob([value]).size
  } catch {
    // Fallback: approximate
    return value.length * 2
  }
}

export function safeSetItem(key: string, value: string): SafeSetResult {
  try {
    localStorage.setItem(key, value)
    return { success: true }
  } catch (err: unknown) {
    // QuotaExceededError is common; surface via flag and dispatch an event for UI
    const isQuota =
      err instanceof DOMException && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')

    if (isQuota) {
      try {
        const now = Date.now()
        if (now - lastQuotaEventAt >= QUOTA_EVENT_COOLDOWN_MS) {
          lastQuotaEventAt = now
          // notify app-wide listeners
          const detail = { key, size: estimateSizeInBytes(value), error: err }
          window.dispatchEvent(new CustomEvent('storageQuotaExceeded', { detail }))
        }
      } catch {
        // ignore
      }
    }

    return { success: false, quotaExceeded: isQuota, error: err }
  }
}
