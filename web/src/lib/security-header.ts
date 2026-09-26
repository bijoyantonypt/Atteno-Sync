/**
 * Applies defensive HTTP security headers to the response.
 * In Vite dev mode this runs client-side; in production you should ALSO
 * set these at the web-server / CDN level (netlify.toml, nginx.conf, etc.).
 */
export function applySecurityHeaders(): void {
  if (typeof document === 'undefined') return;

  const meta = (name: string, content: string) => {
    const el = document.createElement('meta');
    el.setAttribute('http-equiv', name);
    el.setAttribute('content', content);
    document.head.appendChild(el);
  };

  meta('X-Content-Type-Options', 'nosniff');
  meta('X-Frame-Options', 'DENY');
  meta('Referrer-Policy', 'strict-origin-when-cross-origin');
  meta(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      `connect-src 'self' ${import.meta.env.VITE_SUPABASE_URL}`,
    ].join('; ')
  );
}
