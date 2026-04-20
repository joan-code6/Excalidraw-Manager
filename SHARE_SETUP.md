# Share Feature Setup Guide

The share feature allows users to generate read-only links to their canvases that viewers can access in real-time using Appwrite's live updates.

## Required Environment Variables

Add these to your `.env` file:

```env
VITE_APPWRITE_SHARES_COLLECTION_ID=your_shares_collection_id
```

## Appwrite Setup

### 1. Create the Shares Collection

In your Appwrite console:

1. Go to **Databases** > Select your database (e.g., `excalidraw`)
2. Click **Create Collection**
3. Set the Collection ID: `shares` (or use a custom ID and update `VITE_APPWRITE_SHARES_COLLECTION_ID`)
4. Click **Create**

### 2. Add Attributes to the Collection

Create the following attributes in the shares collection:

| Field Name | Type | Required | Default |
|-----------|------|----------|---------|
| `canvasId` | String | Yes | - |
| `data` | String | Yes | - |
| `createdAt` | DateTime | Yes | - |
| `updatedAt` | DateTime | Yes | - |

### 3. Create Indexes (Optional but Recommended)

For better query performance:

- Create an index on `canvasId` for quick lookups

### 4. Set Permissions

Set up permissions on the shares collection:

- **Read**: `Any` (public - allows anyone to view shared canvases)
- **Create**: `Authenticated` or `Any` (depending on your preference)
- **Update**: `Any` or `Authenticated` (for live updates)

Example permission pattern:
```
["create", "read", "update"]
users: Any (or Authenticated for write operations)
```

## How It Works

1. **Generate Share Link**: When a user clicks the "Share" button in the canvas editor, a new document is created in the shares collection with the current canvas data.

2. **Share Link Format**: The generated link looks like: `https://yourapp.com/share/share-{timestamp}-{random}`

3. **Real-time Syncing**: Using Appwrite's real-time feature, when the original canvas is saved, the share document is updated. Viewers automatically see the changes in real-time via the Realtime subscription.

4. **Read-only Access**: Viewers see the canvas in view-only mode and cannot make edits.

## Architecture

### Components

- **CanvasEditor**: Added "Share" button to trigger share creation
- **CanvasViewer**: New read-only viewer component with real-time updates
- **ShareDialog**: Dialog showing generated share link with copy button
- **canvasShare.ts**: Utilities for creating, updating, and managing shares

### Database Structure

**Shares Collection**:
```
{
  "$id": "share-{unique-token}",
  "canvasId": "canvas-{id}",
  "data": "{...serialized canvas data...}",
  "createdAt": 1234567890,
  "updatedAt": 1234567890
}
```

## Future Enhancements

- **Cursor Tracking**: Show the canvas editor's cursor position to viewers
- **Share Expiration**: Set expiration dates on shares
- **Share Permissions**: Different permission levels (view, comment, etc.)
- **Share Analytics**: Track who views and when
- **Revoke Shares**: Ability to revoke access to shares
- **Collaborative Cursors**: Show multiple users' cursors in real-time
