import React from 'react';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="pb-8">
			{children}
		</div>
	);
}
