/* import { LocalNotifications, ScheduleOptions } from "@capacitor/local-notifications";
import { Toast } from "@capacitor/toast";

export async function notify(title: string, body?: string, bodyExpanded?: string, summary?: string) {
    const response = await LocalNotifications.requestPermissions();
    const options: ScheduleOptions = {
        notifications: [
            { id: 1, title, body: body ?? title, largeBody: bodyExpanded, summaryText: summary },
        ]
    };
    LocalNotifications.schedule(options);
}
export async function toast(text: string, duration?: "short" | "long") {
    await Toast.show({ text, duration })
} */