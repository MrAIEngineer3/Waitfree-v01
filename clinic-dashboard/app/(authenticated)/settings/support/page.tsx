"use client";
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Separator } from '@/components/ui/separator';

export default function SupportSettingsPage() {
  return (
    <div className="max-w-6xl space-y-6">
      {/* Page Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Support</h1>
          <p className="text-sm text-muted-foreground mt-1">Find answers or get in touch with our team</p>
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card variant="outline">
          <CardContent className="lg:col-span-2 space-y-4 pt-6">
            <h2 className="text-base font-semibold text-foreground">FAQ</h2>
            <ul className="divide-y divide-border">
              {[
                { q: 'How do I add a new doctor?', a: 'Go to Settings → Doctors and click “Add Doctor”.' },
                { q: 'Can I pause notifications?', a: 'Yes, under Settings → Notifications, toggle channels off anytime.' },
                { q: 'Where can I download invoices?', a: 'Settings → Billing → Billing History → Download.' },
              ].map((f, idx) => (
                <li key={idx} className="py-3">
                  <div className="font-medium text-foreground">{f.q}</div>
                  <div className="text-sm text-muted-foreground">{f.a}</div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card variant="outline">
          <CardContent className="space-y-4 pt-6">
            <h2 className="text-base font-semibold text-foreground">Contact Support</h2>
            <p className="text-sm text-muted-foreground">Our team typically responds within a few hours.</p>
            <div className="space-y-2 text-sm text-foreground">
              <div className="break-words">Email: docsetu.services@gmail.com</div>
              <div>WhatsApp: +91-8817244374</div>
            </div>
            <Button variant="accent" className="w-full sm:w-auto">Start a conversation</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
