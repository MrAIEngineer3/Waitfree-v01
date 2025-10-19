"use client";
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';

export default function AccountSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="text-sm text-gray-600">Sign-out or remove your account.</p>
      </div>

      <Card variant="outline">
        <CardContent className="space-y-4 pt-6">
          <h2 className="text-base font-semibold">Logout</h2>
          <p className="text-sm text-gray-600">You can sign out safely and sign back in later.</p>
          <Button variant="secondary">Logout</Button>
        </CardContent>
      </Card>

      <Card variant="outline" className="border-red-200">
        <CardContent className="space-y-4 pt-6">
          <h2 className="text-base font-semibold text-sem-danger">Delete Account</h2>
          <p className="text-sm text-gray-600">This action is permanent and cannot be undone. All your data will be removed.</p>
          <div className="flex gap-3">
            <Button variant="soft-destructive">I understand</Button>
            <Button variant="destructive">Delete my account</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
