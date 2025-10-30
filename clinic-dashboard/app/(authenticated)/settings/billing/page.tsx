"use client";
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Separator } from '@/components/ui/separator';

export default function BillingSettingsPage() {
  return (
    <div className="max-w-6xl space-y-6">
      {/* Page Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Subscription & Billing</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your plan, payment methods, and invoices</p>
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card variant="outline" className="xl:col-span-2">
          <CardContent className="space-y-5 pt-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-foreground">Current Plan</h2>
                <p className="text-sm text-muted-foreground break-words">Professional — ₹999/month, renews on 28 Oct 2025</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button size="sm" variant="secondary">
                  Manage plan
                </Button>
                <Button size="sm" variant="outline">
                  Cancel
                </Button>
              </div>
            </div>
            <ul className="text-sm text-foreground list-disc pl-5">
              <li>Unlimited queues and appointments</li>
              <li>Automated reminders (WhatsApp/SMS/Email)</li>
              <li>Priority support</li>
            </ul>
          </CardContent>
        </Card>

        <Card variant="outline">
          <CardContent className="space-y-4 pt-6">
            <h2 className="text-base font-semibold text-foreground">Payment Method</h2>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-md border border-border p-4">
              <div className="text-sm flex-1 min-w-0">
                <div className="font-medium text-foreground">Visa •••• 4242</div>
                <div className="text-muted-foreground">Expires 04/27</div>
              </div>
              <Button size="sm" variant="outline" className="flex-shrink-0 w-full sm:w-auto">
                Update
              </Button>
            </div>
            <Button size="sm" variant="ghost">
              Add another method
            </Button>
          </CardContent>
        </Card>
      </div>

        <Card variant="outline">
          <CardContent className="space-y-4 pt-6">
            <h2 className="text-base font-semibold text-foreground">Billing History</h2>
            <div className="overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
              <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2">Date</th>
                  <th className="py-2">Description</th>
                  <th className="py-2">Amount</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[1, 2, 3].map((i) => (
                  <tr key={i}>
                    <td className="py-2">28 Sep 2025</td>
                    <td className="py-2">Professional Plan — Monthly</td>
                    <td className="py-2">₹999</td>
                    <td className="py-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
                        Paid
                      </span>
                    </td>
                    <td className="py-2">
                      <Button size="sm" variant="outline">
                        Download
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
