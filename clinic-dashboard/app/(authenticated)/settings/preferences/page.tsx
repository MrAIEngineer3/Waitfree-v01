"use client";
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Separator } from '@/components/ui/separator';
import { useState } from 'react';

type LanguageOption = 'en' | 'hi';
type ThemeOption = 'light' | 'dark' | 'system';

// Modern Radio Button Component
function RadioOption({ 
  checked, 
  onChange, 
  label, 
  description,
  icon 
}: { 
  checked: boolean; 
  onChange: () => void; 
  label: string; 
  description?: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`
        relative flex items-start gap-4 p-4 rounded-xl border-2 transition-all text-left w-full
        ${checked 
          ? 'border-primary bg-accent shadow-md shadow-primary/10' 
          : 'border-border hover:border-primary/50 hover:bg-accent'
        }
      `}
    >
      <div className={`
        w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5
        ${checked ? 'border-primary' : 'border-border'}
      `}>
        {checked && (
          <div className="w-3 h-3 rounded-full bg-primary" />
        )}
      </div>
      {icon && (
        <div className={`
          w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0
          ${checked ? 'bg-primary' : 'bg-muted'}
        `}>
          <div className={checked ? 'text-primary-foreground' : 'text-muted-foreground'}>
            {icon}
          </div>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h4 className={`text-sm font-semibold ${checked ? 'text-primary' : 'text-foreground'}`}>
          {label}
        </h4>
        {description && (
          <p className={`text-xs mt-0.5 ${checked ? 'text-primary' : 'text-muted-foreground'}`}>
            {description}
          </p>
        )}
      </div>
      {checked && (
        <div className="absolute top-3 right-3">
          <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </button>
  );
}

export default function PreferencesSettingsPage() {
  const [language, setLanguage] = useState<LanguageOption>('en');
  const [theme, setTheme] = useState<ThemeOption>('system');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }, 1000);
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Page Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">App Preferences</h1>
          <p className="text-sm text-muted-foreground mt-1">Customize your experience with language and theme settings</p>
        </div>
      </div>

      <Separator />

      <Card padding="none" variant="outline" className="overflow-hidden">

        <div className="p-8 space-y-8">
          {/* Language Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center">
                <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">Language</h3>
                <p className="text-sm text-muted-foreground">Select your preferred language</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <RadioOption
                checked={language === 'en'}
                onChange={() => setLanguage('en')}
                label="English"
                description="Default language"
                icon={
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="bold">EN</text>
                  </svg>
                }
              />
              <RadioOption
                checked={language === 'hi'}
                onChange={() => setLanguage('hi')}
                label="हिंदी (Hindi)"
                description="भारतीय भाषा"
                icon={
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="bold">HI</text>
                  </svg>
                }
              />
            </div>
          </section>

          {/* Theme Section */}
          <Separator className="my-6" />
          
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">Appearance</h3>
                <p className="text-sm text-muted-foreground">Choose how the app looks</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <RadioOption
                checked={theme === 'light'}
                onChange={() => setTheme('light')}
                label="Light"
                description="Bright and clear"
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                }
              />
              <RadioOption
                checked={theme === 'dark'}
                onChange={() => setTheme('dark')}
                label="Dark"
                description="Easy on the eyes"
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                }
              />
              <RadioOption
                checked={theme === 'system'}
                onChange={() => setTheme('system')}
                label="System"
                description="Auto adjust"
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                }
              />
            </div>
          </section>

          {/* Additional Preferences Preview */}
          <Separator className="my-6" />
          
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">More Options</h3>
                <p className="text-sm text-muted-foreground">Additional customization coming soon</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <span className="text-sm font-medium text-muted-foreground">Sound Effects</span>
                </div>
                <span className="text-xs text-muted-foreground bg-background px-2 py-1 rounded">Soon</span>
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium text-muted-foreground">Date & Time Format</span>
                </div>
                <span className="text-xs text-muted-foreground bg-background px-2 py-1 rounded">Soon</span>
              </div>
            </div>
          </section>

          {/* Success Message */}
          {success && (
            <div className="flex items-start gap-3 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3">
              <svg className="w-5 h-5 text-green-500 dark:text-green-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-green-700 dark:text-green-400">Preferences saved successfully!</span>
            </div>
          )}

          {/* Action Buttons */}
          <Separator className="my-6" />
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <Button variant="default" onClick={handleSave} loading={saving} className="w-full sm:w-auto">
              Save Preferences
            </Button>
            <Button 
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setLanguage('en');
                setTheme('system');
              }}
            >
              Reset to Default
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
