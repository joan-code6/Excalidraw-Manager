import { useCallback, useEffect, useState } from 'react';
import { OAuthProvider } from 'appwrite';
import { account, APPWRITE_ENABLED } from '@/lib/appwrite';

export function useAuth() {
	const [user, setUser] = useState<any | null>(null);
	const [loading, setLoading] = useState(true);

	const fetchUser = useCallback(async () => {
		if (!APPWRITE_ENABLED) {
			setLoading(false);
			setUser(null);
			return;
		}

		setLoading(true);
		try {
			const u = await account.get();
			setUser(u);
		} catch {
			setUser(null);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchUser();
	}, [fetchUser]);

	const signInWithGoogle = useCallback(() => {
		if (!APPWRITE_ENABLED) {
			console.warn('Appwrite is not configured; sign-in disabled');
			return;
		}

		const success = window.location.href;
		const failure = window.location.href;
		account.createOAuth2Session(OAuthProvider.Google, success, failure);
	}, []);

	const signOut = useCallback(async () => {
		if (!APPWRITE_ENABLED) {
			return;
		}

		try {
			await account.deleteSession('current');
			setUser(null);
		} catch (err) {
			console.error('Sign out failed', err);
		}
	}, []);

	return {
		enabled: APPWRITE_ENABLED,
		user,
		loading,
		signInWithGoogle,
		signOut,
		refresh: fetchUser,
	};
}
