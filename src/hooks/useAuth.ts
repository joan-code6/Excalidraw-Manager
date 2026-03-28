import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { OAuthProvider } from 'appwrite';
import type { Models } from 'appwrite';
import { account, APPWRITE_ENABLED } from '@/lib/appwrite';

type AppwriteUser = Models.User<Models.Preferences>;

type AuthSnapshot = {
	user: AppwriteUser | null;
	loading: boolean;
	initialized: boolean;
};

const listeners = new Set<() => void>();

let authSnapshot: AuthSnapshot = {
	user: null,
	loading: APPWRITE_ENABLED,
	initialized: !APPWRITE_ENABLED,
};

let refreshInFlight: Promise<void> | null = null;
let bootstrapInFlight: Promise<void> | null = null;

function sleep(ms: number) {
	return new Promise<void>((resolve) => {
		window.setTimeout(resolve, ms);
	});
}

function emitAuthChanged() {
	listeners.forEach((listener) => listener());
}

function setAuthSnapshot(next: Partial<AuthSnapshot>) {
	authSnapshot = {
		...authSnapshot,
		...next,
	};
	emitAuthChanged();
}

function subscribeAuth(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function getAuthSnapshot() {
	return authSnapshot;
}

async function refreshAuthState() {
	if (!APPWRITE_ENABLED) {
		setAuthSnapshot({
			user: null,
			loading: false,
			initialized: true,
		});
		return;
	}

	if (refreshInFlight) {
		await refreshInFlight;
		return;
	}

	if (!authSnapshot.initialized && !authSnapshot.loading) {
		setAuthSnapshot({ loading: true });
	}

	refreshInFlight = (async () => {
		try {
			const user = await account.get();
			setAuthSnapshot({
				user,
				loading: false,
				initialized: true,
			});
		} catch {
			setAuthSnapshot({
				user: null,
				loading: false,
				initialized: true,
			});
		}
	})();

	try {
		await refreshInFlight;
	} finally {
		refreshInFlight = null;
	}
}

function getAuthCallbackContext() {
	const url = new URL(window.location.href);
	const userId = url.searchParams.get('userId');
	const secret = url.searchParams.get('secret');
	const hasOauthParams =
		(typeof userId === 'string' && userId.length > 0 && typeof secret === 'string' && secret.length > 0) ||
		(typeof url.searchParams.get('code') === 'string' && url.searchParams.get('code')!.length > 0) ||
		(typeof url.searchParams.get('state') === 'string' && url.searchParams.get('state')!.length > 0);

	return {
		url,
		userId,
		secret,
		hasOauthParams,
	};
}

function clearAuthCallbackParams(url: URL) {
	const paramsToClear = ['userId', 'secret'];
	let changed = false;

	for (const param of paramsToClear) {
		if (url.searchParams.has(param)) {
			url.searchParams.delete(param);
			changed = true;
		}
	}

	if (changed) {
		const nextUrl = `${url.pathname}${url.search}${url.hash}`;
		window.history.replaceState(null, document.title, nextUrl);
	}
}

async function bootstrapAuthState() {
	if (!APPWRITE_ENABLED) {
		await refreshAuthState();
		return;
	}

	if (bootstrapInFlight) {
		await bootstrapInFlight;
		return;
	}

	bootstrapInFlight = (async () => {
		const { url, userId, secret, hasOauthParams } = getAuthCallbackContext();

		if (userId && secret) {
			try {
				await account.createSession(userId, secret);
			} catch (error) {
				console.warn('OAuth callback session finalization failed; continuing with account refresh.', error);
			} finally {
				clearAuthCallbackParams(url);
			}
		}

		await refreshAuthState();

		if (!authSnapshot.user && hasOauthParams) {
			for (let attempt = 0; attempt < 5; attempt += 1) {
				await sleep(500);
				await refreshAuthState();
				if (authSnapshot.user) {
					break;
				}
			}
		}
	})();

	try {
		await bootstrapInFlight;
	} finally {
		bootstrapInFlight = null;
	}
}

export function useAuth() {
	const state = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthSnapshot);

	useEffect(() => {
		if (!state.initialized) {
			void bootstrapAuthState();
		}
	}, [state.initialized]);

	useEffect(() => {
		if (!APPWRITE_ENABLED) {
			return;
		}

		const onVisibleOrFocused = () => {
			void refreshAuthState();
		};

		const onVisibilityChange = () => {
			if (document.visibilityState === 'visible') {
				onVisibleOrFocused();
			}
		};

		window.addEventListener('focus', onVisibleOrFocused);
		document.addEventListener('visibilitychange', onVisibilityChange);

		return () => {
			window.removeEventListener('focus', onVisibleOrFocused);
			document.removeEventListener('visibilitychange', onVisibilityChange);
		};
	}, []);

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
			setAuthSnapshot({
				user: null,
				loading: false,
				initialized: true,
			});
		} catch (err) {
			console.error('Sign out failed', err);
		}
	}, []);

	return {
		enabled: APPWRITE_ENABLED,
		user: state.user,
		loading: state.loading,
		signInWithGoogle,
		signOut,
		refresh: refreshAuthState,
	};
}
