"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type Msg = { role: "user" | "assistant"; content: string };

// Open the butler from anywhere — optionally pre-asking a question.
// e.g. openButler("Can I take £3,000 out this month?")
export function openButler(question?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("butler:open", { detail: { question } }));
}

const SUGGESTIONS = [
  "Can I take £3,000 out this month?",
  "What if I take £20,000 as a dividend this year?",
  "Dividend or pension for my next £10k?",
  "Am I set aside enough for my next tax bill?",
  "How much have I spent on software this year?",
];

// Render a single line of "butler" output: turn [text](/path) into a real
// <Link>, leave **bold** bold, leave the rest as plain text.
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) parts.push(text.slice(cursor, m.index));
    if (m[1]) {
      const linkMatch = m[1].match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        parts.push(
          href.startsWith("/") ? (
            <Link
              key={idx++}
              href={href}
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              {label}
            </Link>
          ) : (
            <a
              key={idx++}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              {label}
            </a>
          ),
        );
      } else {
        parts.push(m[1]);
      }
    } else if (m[2]) {
      parts.push(
        <strong key={idx++} className="font-bold text-foreground/95">
          {m[2].slice(2, -2)}
        </strong>,
      );
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

function renderMessage(text: string): React.ReactNode {
  return text.split("\n").map((line, i) => (
    <p key={i} className="leading-relaxed mb-1.5 last:mb-0">
      {renderInline(line).length ? renderInline(line) : " "}
    </p>
  ));
}

export default function ButlerChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Refs so the stable sendText/event-listener always see current state.
  const messagesRef = useRef<Msg[]>([]);
  const busyRef = useRef(false);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { busyRef.current = busy; }, [busy]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy]);

  const sendText = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || busyRef.current) return;
    const newMessages: Msg[] = [...messagesRef.current, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.detail ?? j.error ?? `HTTP ${res.status}`);
      setMessages([...newMessages, { role: "assistant", content: j.reply }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  // Listen for openButler() calls from elsewhere in the app.
  useEffect(() => {
    function onOpen(e: Event) {
      setOpen(true);
      const q = (e as CustomEvent).detail?.question;
      if (typeof q === "string" && q.trim()) {
        // small delay so the panel is mounted before we fire
        setTimeout(() => sendText(q), 60);
      }
    }
    window.addEventListener("butler:open", onOpen);
    return () => window.removeEventListener("butler:open", onOpen);
  }, [sendText]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendText(input);
    }
  }

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full bg-primary text-background font-bold shadow-lg hover:scale-105 transition-transform"
          title="Ask the butler"
          aria-label="Open chat"
        >
          ?
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-4 right-4 z-50 w-[min(420px,calc(100vw-2rem))] h-[min(600px,calc(100vh-2rem))] bg-surface border border-white/15 rounded-2xl shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary">
                Butler
              </p>
              <p className="text-[10px] text-muted/50 leading-tight">
                Ask me anything — money, tax, receipts, decisions.
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-muted/60 hover:text-foreground text-lg leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-[13px]">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-muted/50 text-[12px] italic leading-relaxed">
                  Tap a question, or type your own:
                </p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendText(s)}
                    className="block w-full text-left text-[12.5px] text-foreground/80 px-3 py-2 rounded-xl border border-white/8 bg-white/[0.03] hover:border-primary/30 hover:bg-primary/5 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-6 px-3 py-2 rounded-2xl rounded-tr-sm bg-primary/15 text-foreground"
                    : "mr-6 px-3 py-2 rounded-2xl rounded-tl-sm bg-white/3 border border-white/8 text-foreground/90"
                }
              >
                {renderMessage(m.content)}
              </div>
            ))}
            {busy && (
              <div className="mr-6 px-3 py-2 rounded-2xl rounded-tl-sm bg-white/3 border border-white/8 text-muted/60 italic animate-pulse">
                Thinking…
              </div>
            )}
            {err && (
              <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[12px] text-red-300">
                {err}
              </div>
            )}
          </div>

          <div className="border-t border-white/10 p-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={busy}
              placeholder="Ask anything…"
              rows={2}
              className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-white/30 resize-none disabled:opacity-40"
              style={{ fontSize: "14px" }}
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-[9px] text-muted/40 uppercase tracking-widest">
                ⌘/Ctrl + Enter to send
              </p>
              <button
                onClick={() => sendText(input)}
                disabled={busy || !input.trim()}
                className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-primary text-background hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
