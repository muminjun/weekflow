# WEEKFLOW viewport UI Implementation Plan

> **For agentic workers:** use superpowers:executing-plans inline, as authorized by the user.

**Goal:** Ship the readable viewport planner and persistent themes to existing GitHub Pages.
**Architecture:** Shared appearance tokens and native UI primitives; fit Timeline using actual measured grid space; preserve domain, RPC, queue, auth and SW paths.
**Tech Stack:** Existing React 19 / TypeScript / Vite / CSS / Radix / Playwright.
**Spec:** docs/superpowers/specs/2026-11-16-viewport-ui-design.md

## Global Constraints
- Work only in /Users/minjun/Documents/development/weekflow; preserve user data and all existing features.
- No React downgrade, TDS bypass, paid infrastructure, schema change or secret rotation.
- Body 16px; mobile input >=16px; events >=14px; native name/value/checked/required/disabled serialization preserved.
- Fit mode has no root scroll or content clipping; detailed calendar and long lists may scroll internally.
- Preserve SW cache: reload and ignoreVary handling.

## Review Focus
- Very short / midnight / partially visible blocks preserve true timing and remain editable.
- Corrupt/blocked local storage falls back safely, portals and prepaint share theme.
- Long text, large fonts, many records and all six viewport sizes retain reachable actions.
- Theme changes preserve form values, selected week, categories and synchronization.
- Drag, resize and drop all use the same effective pixels/hour.

### Task 1: Appearance and viewport tests
- [x] Add failing unit tests for preferences and time geometry; run RED.
- [x] Implement appearance module, early boot script, native UI and selector; run unit suite.
- [x] Add failing browser acceptance for viewport, theme and timing behavior.

### Task 2: Workspace and calendar
- [x] Replace paper heading/footer/review layout with bounded workspace, tabs and review dialog.
- [x] Measure calendar space and use shared scale in all geometry; outside-event jump and full detail.
- [x] Preserve drag, resize, overlap, midnight, keyboard and mobile placement.
- [x] Replace styles with semantic palettes/type/control/layout tokens; maintain every secondary screen.
- [x] Run typecheck/lint, unit suite and browser tests; inspect screenshots and fix actual failures.

### Task 3: Verification and delivery
- [x] Exercise six viewport sizes, all themes, forms, mobile tracker, task/block distinction, goals/review/backup and PWA update.
- [x] Run typecheck, lint, full unit suite, E2E, production build and secret scan.
- [x] Review complete diff, update test/deployment docs and screenshots.
- [ ] Commit/push existing main; watch Quality gates and Pages success; inspect live new UI and offline SW version.
