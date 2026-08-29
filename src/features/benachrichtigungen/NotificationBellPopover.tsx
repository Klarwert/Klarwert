import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, Bell, Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNavigationStore } from "@/stores/navigationStore";
import { useUiStore } from "@/stores/uiStore";
import {
  archiveNotification,
  checkSystemNotifications,
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/db/repositories/notifications";
import type { NotificationItem, NotificationPriority } from "@/db/types";
import { useTranslation } from "react-i18next";
import { formatDate } from "@/lib/dates";
import { useSettingsStore } from "@/stores/settingsStore";

function PriorityIcon({ priority }: { priority: NotificationPriority }) {
  if (priority === "critical") return <AlertCircle className="size-4 shrink-0 text-brick" />;
  if (priority === "warning") return <AlertTriangle className="size-4 shrink-0 text-amber-500" />;
  return <Info className="size-4 shrink-0 text-petrol" />;
}

function getNavigationPage(type: string): "vermoegen" | "vertraege" | "transaktionen" | "budgets" | "sammlungen" | "uebersicht" {
  switch (type) {
    case "import_reminder":
    case "balance_mismatch":
    case "import_failed":
      return "vermoegen";
    case "contract_detected":
    case "price_change":
    case "contract_ended":
      return "vertraege";
    case "transfer_detected":
      return "transaktionen";
    case "budget_80":
    case "budget_exceeded":
      return "budgets";
    case "sparzweck_reached":
      return "sammlungen";
    case "own_account_suggestion":
      return "vermoegen";
    default:
      return "uebersicht";
  }
}

export function NotificationBellPopover() {
  const { t } = useTranslation("benachrichtigungen");
  const dateDisplayFormat = useSettingsStore((s) => s.dateDisplayFormat);
  const queryClient = useQueryClient();
  const navigate = useNavigationStore((s) => s.navigate);
  const requestOpenCreateAsset = useUiStore((s) => s.requestOpenCreateAsset);

  // Trigger system notification check on mount
  useEffect(() => {
    void checkSystemNotifications().then(() => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
    });
  }, [queryClient]);

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listNotifications(30),
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: getUnreadNotificationCount,
  });

  async function handleNotificationClick(item: NotificationItem) {
    if (!item.is_read) {
      await markNotificationRead(item.id);
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
    }
    if (item.type === "own_account_suggestion" && item.ref_table?.startsWith("own_account_iban:")) {
      const iban = item.ref_table.slice("own_account_iban:".length);
      requestOpenCreateAsset({ iban, ibanLocked: true });
    }
    const page = getNavigationPage(item.type);
    navigate(page);
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
  }

  async function handleArchive(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    await archiveNotification(id);
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
  }

  const displayCount = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`${t('title')}, ${unreadCount}`}
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-brick text-[10px] font-bold text-white">
              {displayCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0 shadow-lg">
        <div className="flex items-center justify-between border-b border-border p-3">
          <h3 className="text-sm font-semibold text-charcoal">{t('title')}</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs text-slate hover:text-charcoal"
              onClick={() => void handleMarkAllRead()}
            >
              <Check className="mr-1 size-3" /> {t('markAllRead')}
            </Button>
          )}
        </div>

        <div className="max-h-[340px] overflow-y-auto divide-y divide-border">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate">{t('none')}</div>
          ) : (
            notifications.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => void handleNotificationClick(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void handleNotificationClick(item);
                  }
                }}
                className={`group flex items-start gap-3 p-3 transition-colors hover:bg-paper cursor-pointer ${
                  !item.is_read ? "bg-paper/50 font-medium" : "text-slate"
                }`}
              >
                <PriorityIcon priority={item.priority} />
                <div className="min-w-0 flex-1">
                  <p className={`text-xs ${!item.is_read ? "text-charcoal font-semibold" : "text-slate"}`}>
                    {item.message}
                  </p>
                  <span className="mt-1 block text-[10px] text-slate/70">
                    {item.created_at
                      ? `${formatDate(item.created_at.slice(0, 10), dateDisplayFormat)} ${item.created_at.slice(11, 16)}`
                      : ""}
                  </span>
                </div>
                <button
                  type="button"
                  title={t('archive')}
                  onClick={(e) => void handleArchive(e, item.id)}
                  className="opacity-0 group-hover:opacity-100 text-xs text-slate hover:text-charcoal p-1"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
