import { Toast } from "@capacitor/toast";
import { LocalNotifications, ScheduleOptions } from "@capacitor/local-notifications"

export const DEVELOPMENT = import.meta.env.MODE === "development";

export async function errorToast(error: any) {
    if (DEVELOPMENT) {
        const { display } = await LocalNotifications.requestPermissions();
        if (display !== "granted") return;

        if (error instanceof Error) {
            console.error(error);
            return Toast.show({
                text: `${error.name}: ${error.message}`,
                duration: "long",
            })
        }
        else {
            console.error(error);
            return Toast.show({
                text: `${error}`,
                duration: "long",
            })
        }
    }
}

export async function errorNotification(error: any) {
    if (DEVELOPMENT) {
        const { display } = await LocalNotifications.requestPermissions();
        if (display !== "granted") return;

        let options: ScheduleOptions;
        if (error instanceof Error) {
            options = {
                notifications: [
                    { id: 1, title: `${error.name}`, body: `${error.name}`, largeBody: `${error}`, summaryText: `${error.name}` },
                ]
            };
        }
        else {
            options = {
                notifications: [
                    { id: 1, title: "Wayfinder Error", body: `${error}`, largeBody: `${error}`, summaryText: `${error}` },
                ]
            };
        }
        LocalNotifications.schedule(options);
    }
}
