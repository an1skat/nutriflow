const SAFE_INTERNAL_ORIGIN = 'https://nutriflow.invalid';

export function getSafeReturnPath(candidate: string | null | undefined, fallback = '/'): string {
  if (!candidate || !candidate.startsWith('/')) {
    return fallback;
  }

  try {
    const url = new URL(candidate, SAFE_INTERNAL_ORIGIN);

    if (url.origin !== SAFE_INTERNAL_ORIGIN) {
      return fallback;
    }

    if (url.pathname === '/login' || url.pathname.startsWith('/login/')) {
      return fallback;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
