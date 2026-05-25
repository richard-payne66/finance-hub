"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { heicTo, isHeic } from "heic-to";

type Phase =
  | "idle"
  | "converting"
  | "compressing"
  | "uploading"
  | "done"
  | "dupe"
  | "error";

// Max long edge for the on-device JPEG. 1600px is plenty for Claude
// to read a receipt; keeps file under Vercel's 4.5MB request limit.
const MAX_LONG_EDGE = 1600;
const JPEG_QUALITY = 0.85;
const MAX_REASONABLE_BYTES = 3 * 1024 * 1024; // 3MB — under Vercel's edge limit

// Compress an image File to a JPEG of bounded size. Returns the input
// unchanged if it's already small enough OR if compression isn't possible
// (PDF / unknown type).
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size < MAX_REASONABLE_BYTES) return file;

  return new Promise<File>((resolve, reject) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const longEdge = Math.max(img.width, img.height);
        const scale = longEdge > MAX_LONG_EDGE ? MAX_LONG_EDGE / longEdge : 1;
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not get canvas context");
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objUrl);
            if (!blob) return reject(new Error("Canvas toBlob returned null"));
            const newName = file.name.replace(/\.[^.]+$/, ".jpg");
            resolve(new File([blob], newName, { type: "image/jpeg" }));
          },
          "image/jpeg",
          JPEG_QUALITY
        );
      } catch (err) {
        URL.revokeObjectURL(objUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      reject(new Error("Could not load image for compression"));
    };
    img.src = objUrl;
  });
}

export default function CaptureWidget({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [note, setNote] = useState("");

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

      // Compress big images so we don't hit Vercel's 4.5MB request limit.
      if (uploadFile.size > MAX_REASONABLE_BYTES) {
        setPhase("compressing");
        try {
          const compressed = await compressImage(uploadFile);
          uploadFile = compressed;
        } catch (e) {
          // If compression fails (eg PDF mistyped as image), just try the upload as-is.
          console.warn("Compression skipped:", e);
        }
      }

      setPhase("uploading");

      // Final size check — error early with a clear message if still too big
      if (uploadFile.size > 4 * 1024 * 1024) {
        setErrorMsg(`File too large after compression: ${(uploadFile.size / 1024 / 1024).toFixed(1)}MB. Try a smaller image.`);
        setPhase("error");
        return;
      }

      const source = uploadFile === file ? "upload" : "photo";
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("source", source);
      if (note.trim()) form.append("note", note.trim());

      const res = await fetch("/api/process-receipt", { method: "POST", body: form });

      if (res.status === 409) { setPhase("dupe"); return; }

      // Try to parse JSON; fall back to text so we can see what's broken
      let detail = "";
      let underlying = "";
      try {
        const j = await res.json();
        detail = j.error ?? j.message ?? JSON.stringify(j);
        underlying = j.detail ?? "";
      } catch {
        try { detail = (await res.text()).slice(0, 400); }
        catch { detail = "(no body)"; }
      }

      if (!res.ok) {
        const combined = underlying ? `${detail} — ${underlying}` : detail;
        setErrorMsg(`HTTP ${res.status}: ${combined}`);
        setPhase("error");
        return;
      }

      setPhase("done");
      setNote(""); // clear note so next capture starts fresh
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

  const busy = phase === "converting" || phase === "compressing" || phase === "uploading";

  return (
    <div className={compact
      ? "bg-surface border border-white/8 rounded-2xl p-5 mb-4"
      : "bg-surface border border-white/8 rounded-xl p-4 sm:p-5 mb-8"
    }>
      {!compact && (
        <p className="text-[9px] text-muted uppercase tracking-widest font-bold mb-3">
          Capture new receipt
        </p>
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFileChange} />
      <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={onFileChange} />

      {/* Optional note — what was this for? */}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={busy}
        placeholder="Optional note — what was this for?"
        rows={compact ? 2 : 2}
        className="w-full mb-3 bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-white/30 transition-colors disabled:opacity-40 resize-none"
        style={{ fontSize: "16px" }} // prevent iOS zoom on focus
      />

      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
          className="flex-1 text-[10px] font-bold uppercase tracking-widest py-4 rounded-xl border border-primary/40 text-primary bg-primary/5 hover:bg-primary/15 hover:border-primary/70 transition-all disabled:opacity-30 disabled:cursor-default"
          style={{ fontSize: "16px" }}
        >
          📷 Photo
        </button>
        <button
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="flex-1 text-[10px] font-bold uppercase tracking-widest py-4 rounded-xl border border-white/10 text-muted hover:border-white/20 hover:text-foreground transition-all disabled:opacity-30 disabled:cursor-default"
          style={{ fontSize: "16px" }}
        >
          Upload
        </button>
      </div>

      {phase === "converting" && (
        <p className="text-xs text-muted/60 mt-3 animate-pulse">Converting HEIC…</p>
      )}
      {phase === "compressing" && (
        <p className="text-xs text-muted/60 mt-3 animate-pulse">Shrinking image…</p>
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
