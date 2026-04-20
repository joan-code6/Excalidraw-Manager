# Share Feature Setup Guide

The share feature allows users to add collaborators to a canvas by link or by email-labeled invite links, and keep everyone in sync in real-time through Appwrite Realtime.

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
| `access` | String | No | `view` |
| `invitedEmail` | String | No | Empty |

Notes:

- `access` supports `view` and `edit`.
- `invitedEmail` is optional metadata for email-targeted invite links.

### 3. Create Indexes (Optional but Recommended)

For better query performance:

- Create an index on `canvasId` for quick lookups
- Optional: create an index on `access` if you plan to query by permission type later

### 4. Set Permissions

Set up permissions on the shares collection:

- **Read**: `Any` (public - allows anyone with link access)
- **Create**: `Authenticated` (recommended)
- **Update**: `Any` or `Authenticated` (required for live collaboration updates)

Example permission pattern:
```
["create", "read", "update"]
users: Any (or Authenticated for write operations)
```

## How It Works

1. **Generate Share Link**: In the canvas editor, users can create:
  - View link: read-only shared view.
  - Edit link: collaborative editing link.
  - Email invite link: editable link labeled with target email.

2. **Share Link Format**: The generated link looks like: `https://yourapp.com/share/share-{timestamp}-{random}`

3. **Real-time Syncing**: The shared page subscribes to the share document via Appwrite Realtime. For editable links, each change is debounced and written back to the share document so all open sessions update live.

4. **Access Mode Enforcement in UI**:
  - `access=view` opens in view-only mode.
  - `access=edit` opens in collaborative mode.

## Architecture

### Components

- **CanvasEditor**: Added "Share" button to trigger share creation
- **CanvasViewer**: Shared route viewer/editor with real-time updates
- **ShareDialog**: Dialog to create view/edit/email invite links
- **canvasShare.ts**: Utilities for creating, updating, and managing shares

### Database Structure

**Shares Collection**:
```
{
  "$id": "share-{unique-token}",
  "canvasId": "canvas-{id}",
  "data": "{...serialized canvas data...}",
  "createdAt": "2026-04-20T12:34:56.789Z",
  "updatedAt": "2026-04-20T12:34:56.789Z",
  "access": "view | edit",
  "invitedEmail": "optional@domain.com"
}
```

## Future Enhancements

- **Cursor Tracking**: Show the canvas editor's cursor position to viewers
- **Share Expiration**: Set expiration dates on shares
- **Share Permissions**: Different permission levels (view, comment, etc.)
- **Share Analytics**: Track who views and when
- **Revoke Shares**: Ability to revoke access to shares
- **Collaborative Cursors**: Show multiple users' cursors in real-time
