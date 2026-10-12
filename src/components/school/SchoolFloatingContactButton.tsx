"use client";

import { useState, useRef, useEffect } from "react";
import { Phone, X, Headphones } from "lucide-react";

const WHATSAPP_URL = "https://wa.me/919344039068";
const PHONE_URL = "tel:+919344039068";

function WhatsAppIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.414-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.887 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.456 5.711 1.457h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 00-3.48-8.413Z" />
    </svg>
  );
}

export function SchoolFloatingContactButton() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key press
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-50 print:hidden"
    >
      {/* Popover Menu */}
      {isOpen && (
        <div
          role="menu"
          aria-label="Contact options"
          className="absolute bottom-full right-0 mb-3 w-56 sm:w-60 bg-white rounded-2xl shadow-xl border border-slate-200/90 p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150 focus:outline-hidden"
        >
          {/* Subtle Header */}
          <div className="px-3 py-2 border-b border-slate-100 mb-1">
            <p className="text-xs font-semibold text-slate-900 leading-tight">
              EVENVIBE Support
            </p>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              +91 93440 39068
            </p>
          </div>

          {/* WhatsApp Action */}
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-slate-800 hover:bg-emerald-50 hover:text-emerald-900 transition-colors focus:bg-emerald-50 focus:outline-hidden group"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-[#25D366] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <WhatsAppIcon className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-slate-900 leading-tight">WhatsApp</span>
              <span className="text-[11px] text-slate-500">Chat with support</span>
            </div>
          </a>

          {/* Phone Call Action */}
          <a
            href={PHONE_URL}
            role="menuitem"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-slate-800 hover:bg-slate-100 hover:text-slate-900 transition-colors focus:bg-slate-100 focus:outline-hidden group"
          >
            <div className="w-8 h-8 rounded-lg bg-evenvibe-light text-evenvibe-deep flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Phone className="w-4 h-4 text-evenvibe-primary" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-slate-900 leading-tight">Call Us</span>
              <span className="text-[11px] text-slate-500">Call +91 93440 39068</span>
            </div>
          </a>
        </div>
      )}

      {/* Floating Action Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={isOpen ? "Close contact menu" : "Contact EVENVIBE Support"}
        className="group relative flex items-center justify-center gap-2 h-11 w-11 sm:h-12 sm:w-auto sm:px-4 rounded-full bg-evenvibe-primary hover:bg-evenvibe-deep text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 border border-white/20 focus:outline-hidden focus:ring-2 focus:ring-evenvibe-primary/50 focus:ring-offset-2 cursor-pointer"
      >
        {isOpen ? (
          <X className="w-5 h-5 shrink-0 transition-transform duration-200 rotate-0" />
        ) : (
          <Headphones className="w-5 h-5 shrink-0 transition-transform duration-200 group-hover:rotate-12" />
        )}
        <span className="hidden sm:inline font-semibold text-sm tracking-wide">
          Contact
        </span>
      </button>
    </div>
  );
}
