'use client';
import { useEffect, useRef, useId, type ReactNode } from 'react';
import { X, LoaderCircle } from 'lucide-react';
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-title">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Schliessen">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Loading() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={24} />
      <p>Studio wird geladen …</p>
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export const statusText: Record<string, string> = {
  queued: 'In Warteschlange',
  submitting: 'Wird übermittelt',
  unknown: 'Status wird geklärt',
  running: 'In Arbeit',
  persisting: 'Wird gesichert',
  succeeded: 'Abgeschlossen',
  failed: 'Fehlgeschlagen',
  ready: 'Bereit',
  training: 'Training läuft',
  draft: 'Entwurf',
};
export function Status({ value }: { value: string }) {
  return <span className={`status status-${value}`}>{statusText[value] || value}</span>;
}
