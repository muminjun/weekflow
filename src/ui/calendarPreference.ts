export const calendarAskKey = "weekflow.calendar.ask";
export function shouldAskCalendar() {
  try {
    return localStorage.getItem(calendarAskKey) !== "off";
  } catch {
    return true;
  }
}
export function setAskCalendar(ask: boolean) {
  try {
    localStorage.setItem(calendarAskKey, ask ? "on" : "off");
  } catch {
    /* Device preferences are optional. */
  }
}
