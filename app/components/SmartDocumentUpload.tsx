"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Phase = "idle" | "uploading" | "done" | "error";
type Result = {
  classification: { category: string; year: string | null; title: string; confidence: number };
};

export default function SmartDocumentUpload() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [lastResult, setLastResult] = useState<Result | null>(null);

  async function upload(file: File) {
    setPhase("uploading");
    setErrorMsg("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/documents/smart-upload", { method: "POST", body: form });

      let detail = "";
      try {
        const j = await res.json();
        if (res.ok) {
          setLastResult(j as Result);
          setPhase("done");
          setTimeout(() => { router.refresh(); }, 800);
          return;
        }
        detail = j.error ?? JSON.stringify(j);
      } catch {
        try { detail = (await res.text()).slice(0, 400); } catch { detail = ""; }
      }
      setErrorMsg(`HTTP ${res.status}: ${detail || "unknown"}`);
      setPhase("error");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) upload(f);
    e.target.value = "";
  }

  const busy = phase === "uploading";

  return (
    <div className="bg-surface border border-white/8 rounded-2xl p-5">
      <p className="text-[9px] uppercase tracking-widest font-bold text-muted mb-1">
        📄 Drop in any document
      </p>
      <p className="text-[10px] text-muted/60 mb-3 leading-relaxed">
        PDF, image, anything from your accountant or HMRC. Claude reads it,
        figures out what it is (CT600, accounts, P60, statement…) and files
        it in the right place automatically.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        onChange={onChange}
      />

      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="w-full text-[10px] font-bold uppercase tracking-widest py-4 rounded-xl border border-primary/40 text-primary bg-primary/5 hover:bg-primary/15 hover:border-primary/70 transition-all disabled:opacity-30"
        style={{ fontSize: "16px" }}
      >
        {busy ? "Reading & classifying…" : "Choose file"}
      </button>

      {phase === "done" && lastResult && (
        <div className="mt-3 bg-primary/5 border border-primary/20 rounded-lg p-3">
          <p className="text-[10px] text-primary font-bold uppercase tracking-widest mb-1">
            ✓ Filed as
          </p>
          <p className="text-sm text-foreground">{lastResult.classification.title}</p>
          <p className="text-[10px] text-muted/60 mt-1">
            Category: {lastResult.classification.category}
            {lastResult.classification.year && ` · Year: ${lastResult.classification.year}`}
            {" "}· {Math.round(lastResult.classification.confidence * 100)}% confident
          </p>
        </div>
      )}

      {phase === "error" && (
        <div className="mt-3 bg-rose-500/5 border border-rose-500/30 rounded-lg p-3 flex items-center justify-between gap-3">
          <p className="text-xs text-rose-400 break-words">{errorMsg}</p>
          <button onClick={() => setPhase("idle")} className="text-[10px] text-muted/50 hover:text-muted shrink-0">
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
