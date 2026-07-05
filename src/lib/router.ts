/** Minimal hash router. Hash routes keep GitHub Pages happy (no 404
 * rewrites needed) and make the browser back button / iOS edge swipe
 * behave naturally, since every screen is a real history entry. */

import { useEffect, useState } from 'react';

export function useRoute(): string {
  const [route, setRoute] = useState(() => parse());
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

function parse(): string {
  const hash = window.location.hash.replace(/^#/, '');
  return hash || '/';
}

export function navigate(path: string): void {
  window.location.hash = path;
}

export function goBack(): void {
  if (window.history.length > 1) window.history.back();
  else navigate('/');
}
