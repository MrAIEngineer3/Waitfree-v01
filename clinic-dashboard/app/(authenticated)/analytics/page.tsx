"use client";

import { useClinicContext } from '../../../components/ClinicContext';
import StatsCards from '../../../components/StatsCards';

export default function AnalyticsPage() {
	const { clinicId, clinicName, doctorId } = useClinicContext();
	const hasContext = Boolean(clinicId && doctorId);

	return (
		<div className="space-y-6 pb-8">
			{/* Header Section - Modern with subtle gradient */}
			<div className="relative">
				<div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-indigo-50/30 to-transparent dark:from-blue-950/20 dark:via-indigo-950/10 dark:to-transparent rounded-3xl blur-3xl" />
				<div className="relative backdrop-blur-sm bg-card/70 border border-border rounded-2xl p-6 sm:p-8 shadow-sm">
					<div className="flex items-start justify-between">
						<div className="space-y-2">
							<div className="flex items-center gap-3">
								<div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
									<svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
									</svg>
								</div>
								<div>
									<h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Analytics</h1>
									<p className="text-sm text-muted-foreground mt-0.5">Insights and performance metrics for {clinicName || 'your clinic'}</p>
								</div>
							</div>
						</div>
						<div className="hidden sm:flex items-center gap-2">
							<button className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-accent transition-colors">
								<span className="flex items-center gap-2">
									<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
									</svg>
									Export
								</span>
							</button>
						</div>
					</div>
				</div>
			</div>

			{hasContext ? (
				<div className="space-y-6">
					{/* Stats Cards Section */}
					<StatsCards />

					{/* Performance Overview */}
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
						{/* Queue Efficiency Card */}
						<div className="group relative bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
							<div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 dark:from-emerald-500/10 dark:to-teal-500/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
							<div className="relative space-y-4">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3">
										<div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
											<svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
											</svg>
										</div>
										<h3 className="text-lg font-semibold text-foreground">Queue Efficiency</h3>
									</div>
									<span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2.5 py-1 rounded-full">Live</span>
								</div>
								<div className="space-y-3">
									<div className="flex items-baseline justify-between">
										<span className="text-sm text-muted-foreground">Average wait time</span>
										<span className="text-2xl font-bold text-foreground">12<span className="text-sm font-normal text-muted-foreground">min</span></span>
									</div>
									<div className="w-full bg-muted rounded-full h-2">
										<div className="bg-gradient-to-r from-emerald-500 to-teal-500 h-2 rounded-full" style={{width: '75%'}} />
									</div>
									<p className="text-xs text-muted-foreground">Coming soon: Real-time wait time tracking</p>
								</div>
							</div>
						</div>

						{/* Patient Flow Card */}
						<div className="group relative bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
							<div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-primary/5 dark:from-primary/10 dark:to-primary/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
							<div className="relative space-y-4">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3">
										<div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
											<svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
											</svg>
										</div>
										<h3 className="text-lg font-semibold text-foreground">Patient Flow</h3>
									</div>
									<span className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">Today</span>
								</div>
								<div className="space-y-3">
									<div className="flex items-baseline justify-between">
										<span className="text-sm text-muted-foreground">Peak hours</span>
										<span className="text-2xl font-bold text-foreground">10-12<span className="text-sm font-normal text-muted-foreground">AM</span></span>
									</div>
									<div className="flex gap-1">
										{[30, 60, 45, 80, 100, 95, 70, 50].map((h, i) => (
											<div key={i} className="flex-1 bg-muted rounded-sm" style={{height: '40px', display: 'flex', alignItems: 'flex-end'}}>
												<div className="w-full bg-gradient-to-t from-primary to-primary/80 rounded-sm" style={{height: `${h}%`}} />
											</div>
										))}
									</div>
									<p className="text-xs text-muted-foreground">Coming soon: Hourly patient distribution</p>
								</div>
							</div>
						</div>
					</div>

					{/* Advanced Metrics Preview */}
					<div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 border border-gray-700 dark:border-gray-800 rounded-2xl p-8 shadow-lg">
						<div className="space-y-6">
							<div className="flex items-start justify-between">
								<div className="space-y-2">
									<h3 className="text-xl font-semibold text-white">Advanced Analytics</h3>
									<p className="text-sm text-gray-400 dark:text-gray-500">Powerful insights coming soon to help optimize your clinic operations</p>
								</div>
								<div className="px-3 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-xs font-semibold rounded-full">
									Coming Soon
								</div>
							</div>
							<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
								{[
									{ icon: '⏱️', label: 'Wait Time Analytics', desc: 'Track average wait times by day/week' },
									{ icon: '📊', label: 'Patient Trends', desc: 'Identify patterns in patient flow' },
									{ icon: '⚡', label: 'Efficiency Metrics', desc: 'Monitor queue performance' },
									{ icon: '👨‍⚕️', label: 'Doctor Utilization', desc: 'Optimize resource allocation' }
								].map((item, i) => (
									<div key={i} className="bg-white/5 dark:bg-white/10 backdrop-blur-sm border border-white/10 dark:border-white/20 rounded-xl p-4 hover:bg-white/10 dark:hover:bg-white/15 transition-colors">
										<div className="text-2xl mb-2">{item.icon}</div>
										<h4 className="text-sm font-semibold text-white mb-1">{item.label}</h4>
										<p className="text-xs text-gray-400 dark:text-gray-500">{item.desc}</p>
									</div>
								))}
							</div>
						</div>
					</div>
				</div>
			) : (
				<div className="bg-card border border-border rounded-2xl p-12 shadow-sm">
					<div className="text-center space-y-4 max-w-md mx-auto">
						<div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto">
							<svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
							</svg>
						</div>
						<h3 className="text-lg font-semibold text-foreground">Complete Clinic Setup</h3>
						<p className="text-sm text-muted-foreground">Set up your clinic profile to unlock detailed analytics and insights about your practice.</p>
					</div>
				</div>
			)}
		</div>
	);
}
