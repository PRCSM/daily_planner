// Applies the stored theme before first paint (no flash). Dark first. Kept as a file (not inline) so the CSP can forbid inline scripts.
try {
  var t = localStorage.getItem('cadence.theme') || 'dark'
  if (t === 'system') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  document.documentElement.dataset.theme = t
} catch (e) {}
