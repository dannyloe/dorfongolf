import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";

export function usePushNotifications() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!user) return;

    async function registerPush() {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;

        const { PushNotifications } = await import("@capacitor/push-notifications");

        const permResult = await PushNotifications.requestPermissions();
        if (permResult.receive !== "granted") return;

        await PushNotifications.register();

        PushNotifications.addListener("registration", async (token) => {
          try {
            await apiRequest("POST", "/api/notifications/device-token", {
              token: token.value,
              platform: Capacitor.getPlatform(),
            });
          } catch (err) {
            console.error("[pushNotifications] Failed to register token:", err);
          }
        });

        PushNotifications.addListener("registrationError", (err) => {
          console.error("[pushNotifications] Registration error:", err);
        });

        PushNotifications.addListener("notificationActionPerformed", (action) => {
          try {
            const data = action.notification.data as Record<string, string> | undefined;
            if (!data) return;

            if (data.matchId) {
              navigate(`/match/${data.matchId}`);
            } else if (data.eventId) {
              navigate(`/ryder-cup/${data.eventId}`);
            }
          } catch (err) {
            console.error("[pushNotifications] Deep-link navigation error:", err);
          }
        });
      } catch (err) {
        console.error("[pushNotifications] Setup error:", err);
      }
    }

    registerPush();
  }, [user]);
}
