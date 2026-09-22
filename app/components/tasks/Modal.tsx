"use client";
import { useEffect, useRef, type ReactNode } from "react";
import s from "./Workspace.module.css";

export default function Modal({
  title,
  children,
  onClose,
  busy = false,
  wide = false,
  footer,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    // Opening a task should not immediately cover the phone with its keyboard.
    if (window.matchMedia("(max-width: 760px)").matches)
      dialog?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    else dialog?.querySelector<HTMLElement>("[autofocus]")?.focus();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`${s.modal} ${wide ? s.wide : ""}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className={s.modalHeader}>
        <div>
          <span className={s.eyebrow}>LIMMIT · ÚKOLY</span>
          <h2 tabIndex={-1}>{title}</h2>
        </div>
        <button
          type="button"
          className={s.iconButton}
          onClick={onClose}
          disabled={busy}
          aria-label="Zavřít"
        >
          ✕
        </button>
      </div>
      <div className={s.modalBody}>{children}</div>
      {footer && <div className={s.modalFooter}>{footer}</div>}
    </dialog>
  );
}
