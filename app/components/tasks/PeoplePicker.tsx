"use client";
import { useEffect, useId, useRef, useState } from "react";
import { getAllUsers } from "@/lib/auth";
import s from "./Board.module.css";

export default function PeoplePicker({
  value,
  onChange,
  disabled = false,
  inline = false,
}: {
  value: string[];
  onChange: (names: string[]) => void;
  disabled?: boolean;
  inline?: boolean;
}) {
  const optionsId = useId();
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  const root = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    if (!window.matchMedia("(max-width: 760px)").matches)
      input.current?.focus();
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const normalize = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const people = getAllUsers().filter((u) =>
    normalize(u.displayName).includes(normalize(search)),
  );
  if (inline)
    return (
      <div className={s.inlinePeople} role="group" aria-label="Řešitelé úkolu">
        {people.map((u) => (
          <label key={u.username} data-selected={value.includes(u.displayName)}>
            <input
              type="checkbox"
              checked={value.includes(u.displayName)}
              disabled={disabled}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, u.displayName]
                    : value.filter((n) => n !== u.displayName),
                )
              }
            />
            <span className={s.personAvatar} aria-hidden="true">
              {u.displayName[0]}
            </span>
            <span>{u.displayName}</span>
          </label>
        ))}
      </div>
    );
  return (
    <div
      ref={root}
      className={s.peoplePicker}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          root.current?.querySelector<HTMLButtonElement>("button")?.focus();
        }
      }}
    >
      <button
        className={s.peopleTrigger}
        disabled={disabled}
        type="button"
        aria-expanded={open}
        aria-controls={optionsId}
        onClick={() => {
          setSearch("");
          setOpen(!open);
        }}
      >
        <span>
          {value.length
            ? value.slice(0, 2).join(", ") +
              (value.length > 2 ? ` +${value.length - 2}` : "")
            : "Vybrat kolegy"}
        </span>
        <span aria-hidden>⌄</span>
      </button>
      {open && (
        <div id={optionsId} className={s.peoplePopover}>
          <input
            ref={input}
            className={s.peopleSearch}
            aria-label="Hledat kolegu"
            placeholder="Hledat kolegu…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div
            className={s.peopleOptions}
            role="group"
            aria-label="Řešitelé úkolu"
          >
            {people.map((u) => (
              <label key={u.username}>
                <input
                  type="checkbox"
                  checked={value.includes(u.displayName)}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...value, u.displayName]
                        : value.filter((v) => v !== u.displayName),
                    )
                  }
                />
                <span className={s.personAvatar}>{u.displayName[0]}</span>
                <span>{u.displayName}</span>
              </label>
            ))}
            {!people.length && <p>Nikdo neodpovídá hledání.</p>}
          </div>
          <div className={s.peopleBottom}>
            <small>Vybráno {value.length}</small>
            <button type="button" onClick={() => setOpen(false)}>
              Hotovo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
