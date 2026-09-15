import React, { useEffect, useRef } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** id of the element (usually the heading) that names this dialog for assistive tech. */
  titleId: string;
  children: React.ReactNode;
}

/**
 * Shared dialog chrome for the app's three modals: backdrop, Escape-to-close,
 * initial focus on open, and the aria-labelledby/role wiring assistive tech
 * needs to announce it as a dialog rather than page content.
 */
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, titleId, children }) => {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    cardRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={cardRef}
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};
