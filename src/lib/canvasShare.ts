import { databases, APPWRITE_DATABASE_ID, APPWRITE_SHARES_COLLECTION_ID } from '@/lib/appwrite';
import type { CanvasShare } from '@/types/canvas';

import { Query } from 'appwrite';

/**
 * Generate a unique share token
 */
function generateShareToken(): string {
  return `share-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Create a shareable link for a canvas
 */
export async function createCanvasShare(
  canvasId: string,
  canvasData: string
): Promise<CanvasShare | null> {
  if (!APPWRITE_DATABASE_ID || !APPWRITE_SHARES_COLLECTION_ID) {
    console.error('Appwrite Database not properly configured for shares');
    return null;
  }

  try {
    const shareId = generateShareToken();
    const now = new Date().toISOString();

    const share = await databases.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_SHARES_COLLECTION_ID,
      shareId,
      {
        canvasId,
        data: canvasData,
        createdAt: now,
        updatedAt: now,
      }
    );

    return {
      id: share.$id,
      canvasId: share.canvasId,
      createdAt: share.createdAt,
      updatedAt: share.updatedAt,
      data: share.data,
    };
  } catch (error) {
    console.error('Failed to create canvas share:', error);
    return null;
  }
}

/**
 * Get a shared canvas
 */
export async function getCanvasShare(shareId: string): Promise<CanvasShare | null> {
  if (!APPWRITE_DATABASE_ID || !APPWRITE_SHARES_COLLECTION_ID) {
    console.error('Appwrite Database not properly configured for shares');
    return null;
  }

  try {
    const share = await databases.getDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_SHARES_COLLECTION_ID,
      shareId
    );

    return {
      id: share.$id,
      canvasId: share.canvasId,
      createdAt: share.createdAt,
      updatedAt: share.updatedAt,
      data: share.data,
    };
  } catch (error) {
    console.error('Failed to get canvas share:', error);
    return null;
  }
}

/**
 * Update shared canvas data (called when the original canvas is saved)
 */
export async function updateCanvasShareData(
  shareId: string,
  canvasData: string
): Promise<boolean> {
  if (!APPWRITE_DATABASE_ID || !APPWRITE_SHARES_COLLECTION_ID) {
    console.error('Appwrite Database not properly configured for shares');
    return false;
  }

  try {
    await databases.updateDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_SHARES_COLLECTION_ID,
      shareId,
      {
        data: canvasData,
        updatedAt: new Date().toISOString(),
      }
    );

    return true;
  } catch (error) {
    console.error('Failed to update canvas share:', error);
    return false;
  }
}

/**
 * Delete a share
 */
export async function deleteCanvasShare(shareId: string): Promise<boolean> {
  if (!APPWRITE_DATABASE_ID || !APPWRITE_SHARES_COLLECTION_ID) {
    console.error('Appwrite Database not properly configured for shares');
    return false;
  }

  try {
    await databases.deleteDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_SHARES_COLLECTION_ID,
      shareId
    );

    return true;
  } catch (error) {
    console.error('Failed to delete canvas share:', error);
    return false;
  }
}

/**
 * Get the share URL for a given share ID
 */
export function getShareUrl(shareId: string): string {
  return `${window.location.origin}/share/${shareId}`;
}

/**
 * Find all shares for a canvas
 */
export async function findCanvasShares(
  canvasId: string
): Promise<CanvasShare[]> {
  if (!APPWRITE_DATABASE_ID || !APPWRITE_SHARES_COLLECTION_ID) {
    console.error('Appwrite Database not properly configured for shares');
    return [];
  }

  try {
    const { documents } = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_SHARES_COLLECTION_ID,
       [Query.equal('canvasId', canvasId)]
    );

    return documents.map((share) => ({
      id: share.$id,
      canvasId: share.canvasId,
      createdAt: share.createdAt,
      updatedAt: share.updatedAt,
      data: share.data,
    }));
  } catch (error) {
    console.error('Failed to find canvas shares:', error);
    return [];
  }
}

/**
 * Update all shares for a canvas with new data
 */
export async function updateAllCanvasShares(
  canvasId: string,
  canvasData: string
): Promise<void> {
  const shares = await findCanvasShares(canvasId);
  
  const updatePromises = shares.map((share) =>
    updateCanvasShareData(share.id, canvasData)
  );

  try {
    await Promise.all(updatePromises);
  } catch (error) {
    console.error('Failed to update all shares:', error);
  }
}
