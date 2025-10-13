"use client";
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

export default function BillingSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Subscription & Billing</h1>
        <p className="text-sm text-gray-600">Manage your plan, payment methods, and invoices.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card padding="lg" variant="outline" className="xl:col-span-2 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-semibold">Current Plan</h2>
              <p className="text-sm text-gray-600">Professional — ₹999/month, renews on 28 Oct 2025</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary">
                Manage plan
              </Button>
              <Button size="sm" variant="outline">
                Cancel
              </Button>
            </div>
          </div>
          <ul className="text-sm text-gray-700 list-disc pl-5">
            <li>Unlimited queues and appointments</li>
            <li>Automated reminders (WhatsApp/SMS/Email)</li>
            <li>Priority support</li>
          </ul>
        </Card>

        <Card padding="lg" variant="outline" className="space-y-4">
          <h2 className="text-base font-semibold">Payment Method</h2>
          <div className="flex items-center justify-between rounded-md border border-sem-border p-4">
            <div className="text-sm">
              <div className="font-medium">Visa •••• 4242</div>
              <div className="text-gray-600">Expires 04/27</div>
            </div>
            <Button size="sm" variant="outline">
              Update
            </Button>
          </div>
          <Button size="sm" variant="ghost">
            Add another method
          </Button>
        </Card>
      </div>

      <Card padding="lg" variant="outline" className="space-y-4">
        <h2 className="text-base font-semibold">Billing History</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600">
                <th className="py-2">Date</th>
                <th className="py-2">Description</th>
                <th className="py-2">Amount</th>
                <th className="py-2">Status</th>
                <th className="py-2">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sem-border">
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
      </Card>
    </div>
  );
}
