import { databases, APPWRITE_DATABASE_ID, APPWRITE_SHARES_COLLECTION_ID } from '@/lib/appwrite';
import type { CanvasShare } from '@/types/canvas';

import { Query } from 'appwrite';

export interface CreateCanvasShareOptions {
  access?: 'view' | 'edit';
  invitedEmail?: string;
}

/**
 * Generate a unique share token
 */
function generateShareToken(): string {
  return `share-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function mapShareDocument(share: any): CanvasShare {
  return {
    id: share.$id,
    canvasId: share.canvasId,
    createdAt: share.createdAt,
    updatedAt: share.updatedAt,
    data: share.data,
    access: share.access === 'edit' ? 'edit' : 'view',
    invitedEmail: typeof share.invitedEmail === 'string' && share.invitedEmail.trim().length > 0
      ? share.invitedEmail
      : undefined,
  };
}

/**
 * Create a shareable link for a canvas
 */
export async function createCanvasShare(
  canvasId: string,
  canvasData: string,
  options: CreateCanvasShareOptions = {}
): Promise<CanvasShare | null> {
  if (!APPWRITE_DATABASE_ID || !APPWRITE_SHARES_COLLECTION_ID) {
    console.error('Appwrite Database not properly configured for shares');
    return null;
  }

  try {
    const shareId = generateShareToken();
    const now = new Date().toISOString();
    const invitedEmail = options.invitedEmail?.trim().toLowerCase() || '';

    const basePayload = {
      canvasId,
      data: canvasData,
      createdAt: now,
      updatedAt: now,
    };

    const extendedPayload = {
      ...basePayload,
      access: options.access === 'edit' ? 'edit' : 'view',
      invitedEmail,
    };

    let share;
    try {
      share = await databases.createDocument(
        APPWRITE_DATABASE_ID,
        APPWRITE_SHARES_COLLECTION_ID,
        shareId,
        extendedPayload
      );
    } catch (error: any) {
      if (error?.code === 400 && /Invalid document structure/i.test(error?.message || '')) {
        // Backward compatibility: collection may not have access/invitedEmail attributes yet.
        share = await databases.createDocument(
          APPWRITE_DATABASE_ID,
          APPWRITE_SHARES_COLLECTION_ID,
          shareId,
          basePayload
        );
      } else {
        throw error;
      }
    }

    return mapShareDocument(share);
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

    return mapShareDocument(share);
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

    return documents.map((share) => mapShareDocument(share));
  } catch (error) {
    console.error('Failed to find canvas shares:', error);
    return [];
  }
}

function filterSharesByAccess(
  shares: CanvasShare[],
  accessFilter?: 'view' | 'edit'
): CanvasShare[] {
  if (!accessFilter) {
    return shares;
  }

  return shares.filter((share) => {
    const access = share.access === 'edit' ? 'edit' : 'view';
    return access === accessFilter;
  });
}

/**
 * Update all shares for a canvas with new data
 */
export async function updateAllCanvasShares(
  canvasId: string,
  canvasData: string,
  accessFilter?: 'view' | 'edit'
): Promise<void> {
  const shares = await findCanvasShares(canvasId);
  const targetShares = filterSharesByAccess(shares, accessFilter);
  
  const updatePromises = targetShares.map((share) =>
    updateCanvasShareData(share.id, canvasData)
  );

  try {
    await Promise.all(updatePromises);
  } catch (error) {
    console.error('Failed to update all shares:', error);
  }
}

/**
 * Update all editable collaboration links for a canvas.
 */
export async function updateEditableCanvasShares(
  canvasId: string,
  canvasData: string,
  excludeShareId?: string
): Promise<void> {
  const shares = await findCanvasShares(canvasId);
  const editableShares = filterSharesByAccess(shares, 'edit').filter(
    (share) => share.id !== excludeShareId
  );

  if (editableShares.length === 0) {
    return;
  }

  const updates = editableShares.map((share) => updateCanvasShareData(share.id, canvasData));

  try {
    await Promise.all(updates);
  } catch (error) {
    console.error('Failed to update editable shares:', error);
  }
}
