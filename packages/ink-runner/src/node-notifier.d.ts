declare module 'node-notifier' {
  interface Notification {
    title?: string;
    message?: string;
    sound?: boolean | string;
    wait?: boolean;
    timeout?: number;
    icon?: string;
  }

  interface NotificationCenter {
    notify(notification: Notification): void;
  }

  const notifier: NotificationCenter;
  export default notifier;
}
