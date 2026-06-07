const NOTIFICATIONS_ENABLED_KEY = "live-browser-notifications-enabled";

export function readBrowserNotificationsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(NOTIFICATIONS_ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeBrowserNotificationsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, enabled ? "true" : "false");
  } catch {
    // ignore
  }
}

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!isBrowserNotificationSupported()) return "unsupported";
  if (Notification.permission === "granted") {
    writeBrowserNotificationsEnabled(true);
    return "granted";
  }
  if (Notification.permission === "denied") {
    writeBrowserNotificationsEnabled(false);
    return "denied";
  }
  const result = await Notification.requestPermission();
  writeBrowserNotificationsEnabled(result === "granted");
  return result;
}

export function showBrowserMatchNotification(title: string, body: string, tag: string): void {
  if (!isBrowserNotificationSupported()) return;
  if (Notification.permission !== "granted") return;
  if (!readBrowserNotificationsEnabled()) return;

  try {
    new Notification(title, {
      body,
      tag,
      icon: "/favicon.ico",
      silent: false,
    });
  } catch {
    // ignore notification failures
  }
}
