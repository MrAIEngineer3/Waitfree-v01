import SettingsTabs from '@/components/settings/SettingsTabs';
import React from 'react';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="space-y-8 pb-8">
			{/* Modern Header with Gradient */}
			<div className="relative">
				<div className="absolute inset-0 bg-gradient-to-br from-violet-50/50 via-purple-50/30 to-transparent rounded-3xl blur-3xl" />
				<div className="relative backdrop-blur-sm bg-white/70 border border-gray-200/60 rounded-2xl p-6 sm:p-8 shadow-sm">
					<div className="flex items-start gap-4">
						<div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
							<svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
							</svg>
						</div>
						<div className="flex-1">
							<h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Settings</h1>
							<p className="text-sm text-gray-600 mt-1">
								Manage your profile, security, doctors, notifications, billing, and preferences.
							</p>
						</div>
					</div>
				</div>
			</div>

			{/* Settings Navigation */}
			<SettingsTabs />
			
			{/* Content Area */}
			<div className="mt-6">
				{children}
			</div>
		</div>
	);
}
