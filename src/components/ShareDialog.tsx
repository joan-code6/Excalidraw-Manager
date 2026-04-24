import { useState } from 'react';
import { Copy, Check, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface ShareLinkItem {
  id: string;
  url: string;
  access: 'view' | 'edit';
  invitedEmail?: string;
}

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canvasName: string;
  shareLinks: ShareLinkItem[];
  isLoadingShares?: boolean;
  onCreateViewShare: () => void;
  onCreateEditShare: () => void;
  onInviteByEmail: (email: string) => void;
  onDeleteShare?: (linkId: string) => void;
  isCreating?: boolean;
}

export function ShareDialog({
  open,
  onOpenChange,
  canvasName,
  shareLinks,
  isLoadingShares = false,
  onCreateViewShare,
  onCreateEditShare,
  onInviteByEmail,
  onDeleteShare,
  isCreating = false,
}: ShareDialogProps) {
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [email, setEmail] = useState('');

  const handleCopy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(link);
      setTimeout(() => setCopiedLink((current) => (current === link ? null : current)), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleInviteByEmail = () => {
    const trimmed = email.trim();
    if (!trimmed) {
      return;
    }
    onInviteByEmail(trimmed);
    setEmail('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Canvas</DialogTitle>
          <DialogDescription>
            Add collaborators by link or by email to work on <strong>{canvasName}</strong> in real-time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Existing Share Links</label>
            {isLoadingShares ? (
              <p className="text-xs text-muted-foreground">Loading links...</p>
            ) : shareLinks.length === 0 ? (
              <p className="text-xs text-muted-foreground">No links yet.</p>
            ) : (
              <div className="space-y-2">
                {shareLinks.map((linkItem) => (
                  <div key={linkItem.id} className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">
                      {linkItem.access === 'edit' ? 'Can edit' : 'View only'}
                      {linkItem.invitedEmail ? ` • ${linkItem.invitedEmail}` : ''}
                    </div>
                    <div className="flex gap-2">
                    <Input
                      value={linkItem.url}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button
                      onClick={() => handleCopy(linkItem.url)}
                      variant="outline"
                      size="icon"
                      disabled={isCreating || isLoadingShares}
                    >
                      {copiedLink === linkItem.url ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      onClick={() => onDeleteShare?.(linkItem.id)}
                      variant="outline"
                      size="icon"
                      disabled={isCreating || isLoadingShares}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 border-t pt-4">
            <label className="text-sm font-medium">Create Collaboration Links</label>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                onClick={onCreateViewShare}
                disabled={isCreating || isLoadingShares}
                variant="outline"
                className="w-full"
              >
                {isCreating ? 'Creating...' : 'Create View Link'}
              </Button>
              <Button
                onClick={onCreateEditShare}
                disabled={isCreating || isLoadingShares}
                className="w-full"
              >
                {isCreating ? 'Creating...' : 'Create Edit Link'}
              </Button>
            </div>
            <div className="flex gap-2 pt-2">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Invite by email (creates edit link)"
                disabled={isCreating || isLoadingShares}
              />
              <Button
                onClick={handleInviteByEmail}
                disabled={isCreating || isLoadingShares || !email.trim()}
                className="shrink-0"
              >
                Invite
              </Button>
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">Features:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Viewers and collaborators see updates in real-time</li>
              <li>Choose between view-only and editable links</li>
              <li>Create invite links labeled for a specific email</li>
              <li>No login required</li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isCreating}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
