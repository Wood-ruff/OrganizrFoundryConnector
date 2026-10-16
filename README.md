# Organizr Connector for Foundry VTT

A Foundry VTT module that hooks into the live session and pushes session information to an
Organizr campaign workspace.

## Current features

- An **Organizr** tab in the right sidebar (placed before Settings).
- The tab lists the combatants of the running combat in turn order, marks the current turn,
  defeated combatants and the round number. Players only see combatants visible to them.

## Requirements

Foundry VTT 13.341 or newer (verified on V14).

## Install for development

Foundry loads modules from `<Foundry user data>/Data/modules/<module id>`. The folder name must
be the module id, so link this repository there instead of copying it (Windows, cmd):

```
mklink /J "<Foundry user data>\Data\modules\organizr-foundry-connector" "<path to this repository>"
```

Then enable "Organizr Connector" in the world's module management.

## Tests

```
npm test
```

Runs the pure service tests with Node's built-in test runner; no dependencies are needed.
