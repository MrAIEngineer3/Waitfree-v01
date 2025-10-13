export interface NotificationChannelsState {
  whatsapp?: boolean;
  sms?: boolean;
  email?: boolean;
}

export interface NotificationEventsState {
  tokenUpdates?: boolean;
  appointmentReminders?: boolean;
}

export interface NotificationSettingsDoc {
  channels?: NotificationChannelsState;
  events?: NotificationEventsState;
  updatedAt?: unknown;
  updatedBy?: string | null;
}
