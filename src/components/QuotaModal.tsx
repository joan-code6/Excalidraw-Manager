import React from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useAuth } from '@/hooks/useAuth'

export function QuotaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, signInWithGoogle } = useAuth()

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Storage limit reached</DialogTitle>
          <DialogDescription>
            You have reached your browser's storage limit. To continue using this
            service please sign in with Google to enable cloud backups and
            offload older projects.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {!user ? (
            <p className="text-sm text-muted-foreground mb-4">
              Sign in to securely store older projects in your cloud account.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mb-4">You're signed in — we can free up local space by moving older projects to the cloud.</p>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          {!user && (
            <Button onClick={() => signInWithGoogle()}>Login with Google</Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Dismiss
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default QuotaModal
