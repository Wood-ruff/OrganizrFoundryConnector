/** Returns a copy of the collapsed-sections map with one section toggled. */
export function toggleSection(collapsed, section) {
  const next = { ...collapsed };
  if (next[section]) delete next[section];
  else next[section] = true;
  return next;
}

export function isCollapsed(collapsed, section) {
  return Boolean(collapsed?.[section]);
}
