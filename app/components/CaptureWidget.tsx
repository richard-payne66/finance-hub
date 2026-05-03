"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { heicTo, isHeic } from "heic-to";

type Phase =
  | "idle"
  | "converting"
  | "uploading"
  | "done"
  | "dupe"
  | "error";

export default function CaptureWidget() {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function processFile(file: File) {
    try {
      let uploadFile: File = file;

      if (await isHeic(file)) {
        setPhase("converting");
        const blob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.88 });
        uploadFile = new File([blob], file.name.replace(/\.heic$/i, ".jpg"), {
          type: "image/jpeg",
        });
      }

      setPhase("uploading");

      const source = uploadFile === file ? "upload" : "photo";
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("source", source);

      const res = await fetch("/api/process-receipt", { method: "POST", body: form });
      const json = await res.json();

      if (res.status === 409) { setPhase("dupe"); return; }
      if (!res.ok) { setErrorMsg(json.error ?? "Upload failed."); setPhase("error"); return; }

      setPhase("done");
      // Refresh the server component so the new receipt appears in the queue
      setTimeout(() => { router.refresh(); setPhase("idle"); }, 1500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setPhase("error");
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }

  const busy = phase === "converting" || phase === "uploading";

  return (
    <div className="bg-surface border border-white/8 rounded-xl p-4 sm:p-5 mb-8">
      <p className="text-[9px] text-muted uppercase tracking-widest font-bold mb-3">
        Capture new receipt
      </p>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFileChange} />
      <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={onFileChange} />

      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
          className="flex-1 text-[10px] font-bold uppercase tracking-widest py-3 rounded-xl border border-primary/40 text-primary bg-primary/5 hover:bg-primary/15 hover:border-primary/70 transition-all disabled:opacity-30 disabled:cursor-default"
          style={{ fontSize: "16px" }}
        >
          📷 Photo
        </button>
        <button
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="flex-1 text-[10px] font-bold uppercase tracking-widest py-3 rounded-xl border border-white/10 text-muted hover:border-white/20 hover:text-foreground transition-all disabled:opacity-30 disabled:cursor-default"
          style={{ fontSize: "16px" }}
        >
          Upload
        </button>
      </div>

      {phase === "converting" && (
        <p className="text-xs text-muted/60 mt-3 animate-pulse">Converting HEIC…</p>
      )}
      {phase === "uploading" && (
        <p className="text-xs text-muted/60 mt-3 animate-pulse">Extracting with Claude…</p>
      )}
      {phase === "done" && (
        <p className="text-xs text-emerald-400 font-bold uppercase tracking-widest mt-3">
          ✓ Captured — updating queue…
        </p>
      )}
      {phase === "dupe" && (
        <div className="mt-3 bg-yellow-500/8 border border-yellow-500/20 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
          <p className="text-xs text-yellow-400 font-bold">Already captured</p>
          <button
            onClick={() => setPhase("idle")}
            className="text-[10px] text-muted/50 hover:text-muted transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}
      {phase === "error" && (
        <div className="mt-3 bg-red-500/8 border border-red-500/20 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
          <p className="text-xs text-red-400">{errorMsg}</p>
          <button
            onClick={() => setPhase("idle")}
            className="text-[10px] text-muted/50 hover:text-muted transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
