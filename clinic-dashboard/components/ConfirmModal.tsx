import React from 'react';
import Button, { type ButtonProps } from './ui/Button';

type ConfirmTone = 'red' | 'green' | 'orange' | 'blue' | 'gray' | 'yellow';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  children?: React.ReactNode; // body content (description, inputs, etc.)
  confirmLabel: string;
  cancelLabel?: string;
  onCancel: () => void;
  busy?: boolean;
  confirmTone?: ConfirmTone;
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
  // Map legacy tone prop to Button variant
  const toneToVariant: Record<ConfirmTone, ButtonProps['variant']> = {
    red: 'danger',
    green: 'secondary',
    yellow: 'outline',
    orange: 'outline',
    blue: 'accent',
    gray: 'ghost',
  };
  const confirmVariant = toneToVariant[confirmTone] ?? 'accent';
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
          <Button
            onClick={() => {
              if (busy) return;
              onCancel();
            }}
            disabled={busy}
            variant="ghost"
            size="sm"
          >{cancelLabel}</Button>
          <Button
            onClick={() => {
              if (busy || disableConfirm) return;
              if (onConfirm) onConfirm(skip);
            }}
            disabled={busy || disableConfirm}
            variant={confirmVariant}
            size="sm"
            loading={busy}
          >{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
