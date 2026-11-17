# 2026-11-16 control refinement

Latest authority: user's Toss Securities light/dark screenshots, explicit request to replace every old control, widen the schedule workspace, clarify default notifications, and add first-entry coachmarks. This supersedes the earlier paper planner aesthetic. Official TDS is still not installed or bypassed; React 19 is retained.

## Control coverage

| Surface | Implementation | Values and behavior |
| --- | --- | --- |
| All choices | Radix Select, themed options, selected check, scroll and keyboard | Native hidden select retains name, real change events, empty values, required/disabled and form reset |
| All dates | Custom Monday-first calendar, year/month choices, previous/next, today/clear, arrow keys | Native text value is validated as ISO date with min/max; no OS date popup |
| All times | Editable HH:mm plus hour/minute popover | 15-minute step checks retained; PostgreSQL HH:mm:ss zero seconds normalize without changing time |
| Category colors | HEX input and color palette | Category original values change only on explicit form save |
| Numbers/files | Number stepper and file button | Native number constraints and file selection preserved |
| Check/radio/switch | Custom appearance on native inputs | checked/defaultChecked/name/disabled serialize without hidden-field substitutes |
| Confirm/prompt/alert | Accessible app dialogs | Approval/cancel/Escape/text entry preserve original decisions; no browser confirm/prompt UI |
| Validation/tooltips | Shared notice and tooltip surfaces | Native constraint validation stays active; SDK errors are not exposed |
| First-run notifications | Primary opt-in, real permission/subscription before enabling preferences | No permission prompt on load, no silent mutation of existing account preferences; enabled switch updates without clearing quiet-hour draft |
| Coachmarks | Five anchored steps, skip/complete, browser-local persistence, Settings → 사용법 replay | No demo/user data mutation; mobile targets adapted; explicit replay works before onboarding completion and after panel expansion |

## Workspace

56px desktop header, inline week heading, one calendar toolbar, 304px desktop panel, compact date headers, explicit ‘일정 넓게’ / ‘작업 패널’ action. No smaller core type. The 1366×768 calendar height is now over 420px (earlier screenshot approximately 320px). Day focus, outside-event navigation and exact time geometry remain available. Editors have a wider desktop canvas. Dark palette is neutral charcoal.

## Verification

See TEST_REPORT for exact commands/results and screenshots. Existing auth/RPC/version guards, synchronization, database/Edge and SW reload/ignoreVary handling are preserved. Review findings (stored quiet-time format, stale notification switch, empty hour fallback, hidden replay targets and onboarding replay gate) have regression coverage. OS notification permission dialogs and file pickers remain OS-owned; app-owned control surfaces are themed.
