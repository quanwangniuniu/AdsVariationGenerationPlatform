// lib/userStorage.ts

export interface User {
  id: string | number;
  username?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  created_at?: string;
}

const USER_STORAGE_KEY = 'current_user';
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes cache expiry

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  if (typeof window.sessionStorage === 'undefined') return null;
  return window.sessionStorage;
}

interface StoredPayload {
  user: User;
  storedAt: number;
}

export function saveUser(user: User): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const payload: StoredPayload = { user, storedAt: Date.now() };
    storage.setItem(USER_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    // Swallow storage errors (e.g., quota exceeded, private mode)
    console.warn('Failed to persist user info', err);
  }
}

export function getUser(): User | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as StoredPayload;
    if (!payload?.user || typeof payload.storedAt !== 'number') {
      storage.removeItem(USER_STORAGE_KEY);
      return null;
    }
    if (Date.now() - payload.storedAt > CACHE_EXPIRY) {
      storage.removeItem(USER_STORAGE_KEY);
      return null;
    }
    return payload.user;
  } catch (err) {
    console.warn('Failed to read cached user info', err);
    storage.removeItem(USER_STORAGE_KEY);
    return null;
  }
}

export function clearUser(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(USER_STORAGE_KEY);
  } catch (err) {
    console.warn('Failed to clear cached user info', err);
  }
}

export function hasValidUser(): boolean {
  return Boolean(getUser());
}
