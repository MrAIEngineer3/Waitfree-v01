import { redirect } from 'next/navigation';

export default function SettingsDefault() {
  redirect('/settings/profile');
}
