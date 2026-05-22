/** true cuando la app corre en macOS (traffic lights integrados en la sidebar). */
export function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac/i.test(navigator.userAgent) || navigator.platform === 'MacIntel';
}
