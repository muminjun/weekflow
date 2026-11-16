# WEEKFLOW viewport UI

Authority: the user's 2026-11-16 handoff explicitly authorizes implementation, tests, commit/push and the existing Pages deployment without approval pauses. Work in the specified clean repository on a feature branch, preserving the data layer and service worker cache fixes.

## Intent and approach
Large readable Korean type and a viewport workspace replace the paper document. Keep React 19, native form controls and Radix dialogs; no new dependency or service. Official TDS is restricted to Apps in Toss, with a React 18 / TDSMobileAITProvider setup and browser restrictions. References: https://developers-apps-in-toss.toss.im/design/components ; https://tossmini-docs.toss.im/tds-mobile/start/ ; https://techchat-apps-in-toss.toss.im/t/toss-tds-mobile/1395 ; https://guide.tossplace.com/start/take-order .

Alternatives considered: fitting the existing 20-hour paper grid makes content illegible; merely scrolling the old calendar fails the handoff. Chosen: fit a working range to the actual available height, keep an explicit range label and outside-event navigation, and offer full-day / saved-range detail scrolling on demand. The fit view does not update the database profile. Start at 09–18, navigate earlier/later or jump to an outside event; respect availability and show counts. Geometry uses one effective scale for grid, blocks, focus windows, drag/drop, preview and resize. Exact duration wins over minimum visual block height. Compact short blocks open the existing keyboard/touch accessible editor.

Header: brand, truthful sync, theme, quick add, settings. Workspace heading: week navigation and review entry. Central seven days; right panel: Todo / goals / deadlines with counts, bounded lists. Mobile: day strip, one day and bottom actions; Radix task sheet. Review lives in a dialog with existing save/finalization logic.

System fonts require no download and remain offline. rem type scale: body/input 16, list 16, event 14, metadata 13, label 14, section 18, title 26. Large mode increases root type without changing minute calculations. Shared native Button/IconButton/TextField/SegmentedControl styling preserves FormData and focus semantics. Dialog heading and scrollable body, sticky form actions, safe areas and reduced motion.

Four semantic palettes: clean blue, paper lime, soft mint, dark. Device-local versioned appearance preference, defensive JSON reads/writes, document-root theme for portals, pre-React initialization to reduce flashes, color-scheme/theme-color. No app remount. Category data is unchanged; event text contrast is derived from its actual category fill.

## Verification
Unit: defensive preferences, storage denial, geometry/range clipping and midnight, category contrast; current data/queue/database suites unchanged. Browser: all six requested viewports, real bounding boxes/no root overflow, computed fonts, short blocks, theme persistence and invalid values, portal/forms/week/data preservation, accessible controls, outside-event navigation, full range, pointer move/resize by effective scale, native serialization, goals/deadlines/review, backup, mobile tracker. Keep SW regression. Existing live API scripts are read before deciding; UI changes do not require remote data mutations.
