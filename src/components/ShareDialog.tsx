import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canvasName: string;
  shareLinks: string[];
  isLoadingShares?: boolean;
  onCreateNewShare: () => void;
  isCreating?: boolean;
}

export function ShareDialog({
  open,
  onOpenChange,
  canvasName,
  shareLinks,
  isLoadingShares = false,
  onCreateNewShare,
  isCreating = false,
}: ShareDialogProps) {
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const handleCopy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(link);
      setTimeout(() => setCopiedLink((current) => (current === link ? null : current)), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Canvas</DialogTitle>
          <DialogDescription>
            Anyone with this link can view <strong>{canvasName}</strong> in
            real-time.
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
                {shareLinks.map((link) => (
                  <div key={link} className="flex gap-2">
                    <Input
                      value={link}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button
                      onClick={() => handleCopy(link)}
                      variant="outline"
                      size="icon"
                      disabled={isCreating || isLoadingShares}
                    >
                      {copiedLink === link ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 border-t pt-4">
            <label className="text-sm font-medium">Create New Share Link</label>
            <Button
              onClick={onCreateNewShare}
              disabled={isCreating || isLoadingShares}
              className="w-full"
            >
              {isCreating ? 'Creating...' : 'Create New Link'}
            </Button>
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">Features:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Viewers see updates in real-time</li>
              <li>Read-only access (no editing)</li>
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
