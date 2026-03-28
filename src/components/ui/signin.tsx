import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

export function SignInButton() {
	const { enabled, user, loading, signInWithGoogle, signOut } = useAuth();

	if (!enabled || loading) {
		return null;
	}

	if (!user) {
		return (
			<Button variant="outline" size="sm" onClick={signInWithGoogle}>
				Sign in (Google)
			</Button>
		);
	}

	return (
		<div className="inline-flex items-center gap-2">
			<div className="text-sm text-muted-foreground">{user.name || user.email}</div>
			<Button variant="ghost" size="sm" onClick={signOut}>
				Sign out
			</Button>
		</div>
	);
}

export default SignInButton;
