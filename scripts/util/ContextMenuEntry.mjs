const LABEL_SHAPE_GENERATION = 14;

/**
 * A directory context-menu entry in the shape the running Foundry generation reads: V14 `{label, icon, visible,
 * onClick}`, V13 `{name, icon (HTML), condition, callback}`. Both hand the entry's list element to `isVisible`/`run`.
 */
export function contextMenuEntry(generation, { label, icon, isVisible, run }) {
  if (generation >= LABEL_SHAPE_GENERATION) {
    return { label, icon, visible: isVisible, onClick: (event, li) => run(li) };
  }
  return { name: label, icon: `<i class="${icon}"></i>`, condition: isVisible, callback: run };
}

/** The document id a directory list element names (`data-entry-id`), or null. */
export function directoryEntryId(li) {
  return li?.dataset?.entryId ?? null;
}

/** Whether a directory hook came from the world directory of `worldCollection`, not from a compendium window. */
export function isWorldDirectory(app, worldCollection) {
  return Boolean(app) && app.collection === worldCollection;
}
