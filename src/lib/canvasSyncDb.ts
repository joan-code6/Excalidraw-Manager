import { AppwriteException, ID, Permission, Query, Role } from 'appwrite';
import type { Models } from 'appwrite';
import {
  APPWRITE_CANVASES_COLLECTION_ID,
  APPWRITE_DATABASE_ID,
  APPWRITE_DB_ENABLED,
  databases,
} from '@/lib/appwrite';
import type { ExcalidrawCanvas } from '@/types/canvas';

interface CanvasDocument extends Models.Document {
  userId: string;
  name: string;
  description?: string;
  project: string;
  data: string;
  createdAt: number;
  updatedAt: number;
}

export type CanvasSyncErrorReason = 'unauthorized' | 'forbidden' | 'invalid-structure' | 'unknown';

export class CanvasSyncError extends Error {
  reason: CanvasSyncErrorReason;
  statusCode?: number;

  constructor(reason: CanvasSyncErrorReason, message: string, statusCode?: number) {
    super(message);
    this.name = 'CanvasSyncError';
    this.reason = reason;
    this.statusCode = statusCode;
  }
}

export type CanvasUpsertMode = 'auto' | 'prefer-create' | 'prefer-update';

function toCanvasSyncError(error: unknown): CanvasSyncError {
  if (error instanceof CanvasSyncError) {
    return error;
  }

  if (error instanceof AppwriteException) {
    if (error.code === 401) {
      return new CanvasSyncError(
        'unauthorized',
        'Appwrite 401: not authorized. Check Web platform origin, OAuth session, and collection read/create permissions for role:users.',
        401
      );
    }

    if (error.code === 403) {
      return new CanvasSyncError(
        'forbidden',
        'Appwrite 403: forbidden. Check collection/document permissions and rules.',
        403
      );
    }

    if (error.code === 400 && /Invalid document structure/i.test(error.message)) {
      return new CanvasSyncError(
        'invalid-structure',
        `Appwrite schema mismatch: ${error.message}`,
        400
      );
    }

    return new CanvasSyncError('unknown', `${error.message}`, error.code);
  }

  return new CanvasSyncError('unknown', 'Unknown sync error.');
}

function getConfig() {
  if (!APPWRITE_DB_ENABLED || !APPWRITE_DATABASE_ID || !APPWRITE_CANVASES_COLLECTION_ID) {
    return null;
  }

  return {
    databaseId: APPWRITE_DATABASE_ID,
    collectionId: APPWRITE_CANVASES_COLLECTION_ID,
  };
}

function toCanvas(doc: CanvasDocument): ExcalidrawCanvas {
  return {
    id: doc.$id,
    name: doc.name,
    description: doc.description,
    project: doc.project,
    data: doc.data,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toPayload(userId: string, canvas: ExcalidrawCanvas) {
  return {
    userId,
    name: canvas.name,
    description: canvas.description || '',
    project: canvas.project,
    data: canvas.data,
    createdAt: canvas.createdAt,
    updatedAt: canvas.updatedAt,
  };
}

export async function listUserCanvases(userId: string): Promise<ExcalidrawCanvas[]> {
  const config = getConfig();
  if (!config) {
    return [];
  }

  const all: CanvasDocument[] = [];
  let cursorAfter: string | null = null;

  while (true) {
    const queries = [Query.equal('userId', userId), Query.limit(100)];
    if (cursorAfter) {
      queries.push(Query.cursorAfter(cursorAfter));
    }

    let res;
    try {
      res = await databases.listDocuments<CanvasDocument>(
        config.databaseId,
        config.collectionId,
        queries
      );
    } catch (error) {
      throw toCanvasSyncError(error);
    }

    all.push(...res.documents);

    if (res.documents.length < 100) {
      break;
    }

    cursorAfter = res.documents[res.documents.length - 1].$id;
  }

  return all.map(toCanvas);
}

async function createCanvasDocument(userId: string, canvas: ExcalidrawCanvas): Promise<void> {
  const config = getConfig();
  if (!config) {
    return;
  }

  const payload = toPayload(userId, canvas);

  await databases.createDocument(config.databaseId, config.collectionId, canvas.id || ID.unique(), payload, [
    Permission.read(Role.user(userId)),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
  ]);
}

async function updateCanvasDocument(userId: string, canvas: ExcalidrawCanvas): Promise<void> {
  const config = getConfig();
  if (!config) {
    return;
  }

  const payload = toPayload(userId, canvas);
  await databases.updateDocument(config.databaseId, config.collectionId, canvas.id, payload);
}

export async function upsertCanvas(
  userId: string,
  canvas: ExcalidrawCanvas,
  mode: CanvasUpsertMode = 'auto'
): Promise<void> {
  const config = getConfig();
  if (!config) {
    return;
  }

  const tryUpdateThenCreate = async () => {
    try {
      await updateCanvasDocument(userId, canvas);
    } catch (error) {
      const syncError = toCanvasSyncError(error);
      if (syncError.statusCode && syncError.statusCode !== 404) {
        throw syncError;
      }

      try {
        await createCanvasDocument(userId, canvas);
      } catch (createError) {
        throw toCanvasSyncError(createError);
      }
    }
  };

  const tryCreateThenUpdate = async () => {
    try {
      await createCanvasDocument(userId, canvas);
    } catch (error) {
      const syncError = toCanvasSyncError(error);
      if (syncError.statusCode && syncError.statusCode !== 409) {
        throw syncError;
      }

      try {
        await updateCanvasDocument(userId, canvas);
      } catch (updateError) {
        throw toCanvasSyncError(updateError);
      }
    }
  };

  if (mode === 'prefer-create') {
    await tryCreateThenUpdate();
    return;
  }

  if (mode === 'prefer-update') {
    await tryUpdateThenCreate();
    return;
  }

  await tryUpdateThenCreate();
}

export async function deleteCanvasDocument(canvasId: string): Promise<void> {
  const config = getConfig();
  if (!config) {
    return;
  }

  try {
    await databases.deleteDocument(config.databaseId, config.collectionId, canvasId);
  } catch (error) {
    const syncError = toCanvasSyncError(error);
    if (syncError.statusCode === 404) {
      // Already deleted.
      return;
    }
    throw syncError;
  }
}
