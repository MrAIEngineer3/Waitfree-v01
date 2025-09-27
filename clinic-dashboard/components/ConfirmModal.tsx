import React from 'react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  children?: React.ReactNode; // body content (description, inputs, etc.)
  confirmLabel: string;
  cancelLabel?: string;
  onCancel: () => void;
  busy?: boolean;
  confirmTone?: 'red' | 'green' | 'orange' | 'blue' | 'gray' | 'yellow';
  /** Disable confirm button (e.g. typed text mismatch) */
  disableConfirm?: boolean;
  /** Optional id for the body text for a11y */
  bodyId?: string;
  /** Optional class override for container */
  panelClassName?: string;
  /** Show a checkbox allowing user to skip confirmations for the rest of the day */
  allowSkipToday?: boolean;
  /** Callback to persist skip; onConfirm will receive skip flag */
  onConfirm?: (skipToday?: boolean) => void; // make optional to preserve backward compat in patch
  /** Pre-checked state (consumer manages) */
  defaultSkipToday?: boolean;
}

const toneMap: Record<string, string> = {
  red: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
  green: 'bg-green-600 hover:bg-green-700 focus:ring-green-500',
  orange: 'bg-orange-600 hover:bg-orange-700 focus:ring-orange-500',
  blue: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
  gray: 'bg-gray-600 hover:bg-gray-700 focus:ring-gray-500',
  yellow: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500'
};

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  busy = false,
  confirmTone = 'blue',
  disableConfirm = false,
  bodyId,
  panelClassName,
  allowSkipToday = false,
  defaultSkipToday = false
}) => {
  const [skip, setSkip] = React.useState(defaultSkipToday);
  const confirmBtnClasses = `${toneMap[confirmTone] || toneMap.blue} px-5 py-2 text-sm rounded-md font-medium text-white focus:outline-none focus:ring-2 disabled:opacity-40 flex items-center gap-2`;
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className={panelClassName || 'w-full max-w-sm rounded-lg bg-white shadow-lg border border-gray-200 p-6 space-y-5'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby={bodyId}
      >
        <div className="space-y-2">
          <h2 id="confirm-modal-title" className="text-lg font-semibold text-gray-800">{title}</h2>
          {children && (
            <div id={bodyId} className="text-sm text-gray-600 leading-relaxed space-y-3">
              {children}
            </div>
          )}
        </div>
        {allowSkipToday && (
          <label className="flex items-center gap-2 text-xs text-gray-600 pt-1">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              checked={skip}
              onChange={e=>setSkip(e.target.checked)}
            />
            Don&apos;t ask me again today
          </label>
        )}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={() => { if (busy) return; onCancel(); }}
            className="px-4 py-2 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-40"
            disabled={busy}
          >{cancelLabel}</button>
          <button
            onClick={() => { if (busy || disableConfirm) return; onConfirm && onConfirm(skip); }}
            disabled={busy || disableConfirm}
            className={confirmBtnClasses}
          >
            {busy && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
