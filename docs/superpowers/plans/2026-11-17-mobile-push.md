# Mobile workspace and Push diagnostics implementation plan

Goal: explain actual delivery failures with evidence and make the mobile planner useful at 360–390px without sacrificing readable text or existing functionality.

Architecture: retain React/Radix and existing RPC/auth/sync paths. Device-specific diagnostics live in the Push client and notification setup; mobile workspace stays one viewport, with touch creation, fewer duplicated actions and viewport-aware editors.

User has authorized implementation/testing/existing main deployment and opted out of approval pauses. Existing Toss Securities visual direction remains. No key rotation, DB reset, paid services, or silent preference changes.

- [x] Inspect permission, local subscription, server registration, Cron and actual delivery separately; test current device delivery without exposing endpoints/tokens.
- [x] Add regression coverage for current-device Push status and test routing before implementation. Never describe gateway acceptance as OS display.
- [x] Implement actionable notification diagnostics and stale registration recovery with existing boundaries.
- [x] Add mobile regression tests for compact header, >=44px touch actions, timeline room, tap creation, sheets and reduced-height editor save.
- [x] Refine mobile layout and touch interaction, preserve date range/exact geometry/day tracking and all original form values.
- [x] Run type/lint/unit/E2E/build/secrets, inspect 360/390 mobile and desktop screenshots, review.
- [x] Commit/push main, confirm CI/Pages and live/PWA/offline behavior; record precise physical-device limitations.

User additions during execution:
- Mobile save must offer native-calendar copy. Implement device-local ICS/share handoff with explicit OS confirmation and no claimed automatic sync; never upload private calendar content to a public URL.
- Reduce input padding/height while retaining16px text and44px touch targets.
- Replace double-click as primary creation with hover one-hour silhouette and one click.
- Implement all three proposed additions: blank-space duration drag, schedule search/today navigation, and unplaced-Todo free-slot suggestions with explicit selection before save. Retain exact15-minute geometry and existing overlap/version guards. Suggestions use real availability, holidays/overrides and occupied intervals, exclude past time, and never auto-write data.

Rulings during implementation: requestPermission runs in the click gesture before awaits; registration failure preserves an existing subscription; test targets only this endpoint. Worker receipt is acknowledged separately from OS display. Native calendar is a one-event copy through a local ICS file/share sheet; no new calendar OAuth or public feed is introduced. Inputs retain16px with44px basic height. Blank touch opens after synthetic click to prevent click-through. Mouse selection and hover share the measured15-minute scale. Search exposes explicit week/today/all scope. Recommendations require confirmed holidays and explicit editor/save; no automatic planner changes.
