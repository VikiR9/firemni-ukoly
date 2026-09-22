"use client";
import { useEffect, useRef } from "react";
import s from "./CompletionCelebration.module.css";
export default function CompletionCelebration({
  onEnd,
}: {
  onEnd: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.showPopover?.();
    const timer = setTimeout(onEnd, 2400);
    return () => clearTimeout(timer);
  }, [onEnd]);
  return (
    <div
      ref={ref}
      popover="manual"
      className={s.overlay}
      role="status"
      aria-label="Hotovo! Dobrá práce."
    >
      <div className={s.toast}>
        <svg viewBox="0 0 200 140" width="200" height="140" aria-hidden="true">
          <g className={s.left}>
            <path
              d="M50 20h30v43c0 26-30 26-30 0z"
              fill="#fff9e7"
              stroke="#546d66"
              strokeWidth="3"
            />
            <path d="M53 41h24v22c0 22-24 22-24 0z" fill="#edbf52" />
            <path
              d="M65 82v30m-16 1h32"
              fill="none"
              stroke="#546d66"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="60" cy="53" r="2" fill="white" />
            <circle cx="69" cy="64" r="2" fill="white" />
          </g>
          <g className={s.right}>
            <path
              d="M120 20h30v43c0 26-30 26-30 0z"
              fill="#fff9e7"
              stroke="#546d66"
              strokeWidth="3"
            />
            <path d="M123 41h24v22c0 22-24 22-24 0z" fill="#edbf52" />
            <path
              d="M135 82v30m-16 1h32"
              fill="none"
              stroke="#546d66"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="130" cy="56" r="2" fill="white" />
            <circle cx="138" cy="66" r="2" fill="white" />
          </g>
          <g
            className={s.spark}
            stroke="#d6a837"
            strokeWidth="3"
            strokeLinecap="round"
          >
            <path d="M100 10v-6m-12 12-5-5m29 5 5-5" />
          </g>
        </svg>
        <strong>Hotovo! Dobrá práce.</strong>
      </div>
    </div>
  );
}
