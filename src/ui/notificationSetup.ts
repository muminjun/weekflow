import type { Dataset, Change } from "../domain/types";
/** Permission + subscription must succeed before we enable delivery or finish onboarding. */
export async function enablePlannerNotifications(
  data: Dataset,
  commit: (changes: Change[]) => Promise<void>,
  register: () => Promise<void>,
  finishSetup = false,
) {
  await register();
  const changes: Change[] = [
    {
      table: "notification_preferences",
      action: "update",
      row: { user_id: data.profile.id, enabled: true },
      expected_version: data.notification_preferences.version,
    },
  ];
  if (finishSetup)
    changes.push({
      table: "profiles",
      action: "update",
      row: { id: data.profile.id, onboarding_completed: true },
      expected_version: data.profile.version,
    });
  await commit(changes);
}
