import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"
import { LogIn, LogOut, User } from "lucide-react"

export function SignInButton() {
  const { enabled, user, loading, signInWithGoogle, signOut } = useAuth()

  if (!enabled || loading) {
    return null
  }

  if (!user) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={signInWithGoogle}
        className="gap-2 text-muted-foreground hover:text-foreground"
      >
        <LogIn className="size-4" />
        Sign in
      </Button>
    )
  }

  return (
    <div className="inline-flex items-center gap-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="flex size-6 items-center justify-center rounded-full bg-muted">
          <User className="size-3.5 text-muted-foreground" />
        </div>
        <span className="hidden sm:inline">{user.name || user.email}</span>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={signOut}
        title="Sign out"
        className="text-muted-foreground hover:text-foreground"
      >
        <LogOut className="size-4" />
      </Button>
    </div>
  )
}

export default SignInButton
