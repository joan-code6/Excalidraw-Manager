import { get, set, del } from 'idb-keyval'

export async function idbGet<T = unknown>(key: string): Promise<T | undefined> {
  try {
    return (await get(key)) as T | undefined
  } catch (err) {
    console.error('IndexedDB get failed', err)
    return undefined
  }
}

export async function idbSet(key: string, value: unknown): Promise<boolean> {
  try {
    await set(key, value)
    return true
  } catch (err) {
    console.error('IndexedDB set failed', err)
    return false
  }
}

export async function idbDel(key: string): Promise<boolean> {
  try {
    await del(key)
    return true
  } catch (err) {
    console.error('IndexedDB delete failed', err)
    return false
  }
}
