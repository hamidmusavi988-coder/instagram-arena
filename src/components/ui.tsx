"use client";
import { useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { X, BadgeCheck, Sparkles } from "lucide-react";
import type { User } from "@/lib/types";

export function Logo() { return <div className="brand"><svg width="35" height="35" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="loop-logo" x2="1" y2="1"><stop stopColor="#fb9265"/><stop offset=".52" stopColor="#ed4985"/><stop offset="1" stopColor="#a455d7"/></linearGradient></defs><rect width="64" height="64" rx="20" fill="url(#loop-logo)"/><path d="M32 32c-11-18-28-3-18 7 8 8 16-2 18-7s10-15 18-7c10 10-7 25-18 7Z" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round"/></svg><span>loop<span className="brand-period">.</span></span></div>; }
export function Avatar({ user, size = 40, className = "", onClick }: { user: Pick<User, "name" | "avatar">; size?: number; className?: string; onClick?: () => void }) {
  const image = <img src={user.avatar} alt={user.name} width={size} height={size} className={`avatar ${className}`} style={{ width: size, height: size }} onError={(e) => { e.currentTarget.src = "/images/alex.jpg"; }} />;
  return onClick ? <button className="avatar-button" onClick={onClick} aria-label={`View ${user.name}'s profile`}>{image}</button> : image;
}
export function Verified() { return <BadgeCheck className="verified" size={15} fill="currentColor" strokeWidth={2.1}/>; }
export function IconButton({ label, children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} className={`icon-button ${className}`} {...props}>{children}</button>;
}
export function Modal({ title, children, onClose, className = "", wide = false }: { title?: string; children: ReactNode; onClose: () => void; className?: string; wide?: boolean }) {
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setMounted(true);
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && ref.current) {
        const list = Array.from(ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea, select, a[href], [tabindex="0"]')).filter((el) => el.offsetParent !== null);
        const first = list[0], last = list[list.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    const timer = setTimeout(() => ref.current?.querySelector<HTMLElement>('input, textarea, button')?.focus(), 50);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", key); clearTimeout(timer); previous?.focus(); };
  }, [onClose]);
  if (!mounted) return null;
  return createPortal(<div className={`modal-backdrop ${className}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} role="dialog" aria-modal="true" aria-label={title || "Loop dialog"} className={`modal ${wide ? "modal-wide" : ""}`}><div className="modal-header">{title ? <h2>{title}</h2> : <span/>}<IconButton label="Close dialog" onClick={onClose}><X size={21}/></IconButton></div>{children}</div></div>, document.body);
}
export function EmptyState({ title, text, icon, action }: { title: string; text: string; icon?: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon || <Sparkles size={28}/>}</div><h3>{title}</h3><p>{text}</p>{action}</div>;
}
export function timeAgo(value: string) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}
export function compact(n: number) { return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString("en-US"); }
