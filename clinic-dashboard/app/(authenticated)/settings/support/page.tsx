"use client";
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

export default function SupportSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
        <p className="text-sm text-gray-600">Find answers or get in touch.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card padding="lg" variant="outline" className="lg:col-span-2 space-y-4">
          <h2 className="text-base font-semibold">FAQ</h2>
          <ul className="divide-y divide-sem-border">
            {[
              { q: 'How do I add a new doctor?', a: 'Go to Settings → Doctors and click “Add Doctor”.' },
              { q: 'Can I pause notifications?', a: 'Yes, under Settings → Notifications, toggle channels off anytime.' },
              { q: 'Where can I download invoices?', a: 'Settings → Billing → Billing History → Download.' },
            ].map((f, idx) => (
              <li key={idx} className="py-3">
                <div className="font-medium">{f.q}</div>
                <div className="text-sm text-gray-600">{f.a}</div>
              </li>
            ))}
          </ul>
        </Card>

        <Card padding="lg" variant="outline" className="space-y-4">
          <h2 className="text-base font-semibold">Contact Support</h2>
          <p className="text-sm text-gray-600">Our team typically responds within a few hours.</p>
          <div className="space-y-2 text-sm">
            <div>Email: support@waitfree.app</div>
            <div>WhatsApp: +91 90000 00000</div>
          </div>
          <Button variant="accent">Start a conversation</Button>
        </Card>
      </div>
    </div>
  );
}
