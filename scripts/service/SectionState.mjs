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

const GM_ONLY_SECTIONS = ["settings"];

/** Returns a copy of the render parts without the GM-only sections when the user is not a GM. */
export function visibleSectionParts(parts, isGM) {
  const visible = { ...parts };
  if (isGM) return visible;
  for (const section of GM_ONLY_SECTIONS) delete visible[section];
  return visible;
}
