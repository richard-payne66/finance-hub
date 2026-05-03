"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { heicTo, isHeic } from "heic-to";

type UploadState =
  | { phase: "idle" }
  | { phase: "converting" }
  | { phase: "uploading" }
  | { phase: "done"; receiptId: string }
  | { phase: "dupe"; receiptId: string | null }
  | { phase: "error"; message: string };

export default function CapturePage() {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ phase: "idle" });

  async function processFile(file: File) {
    try {
      let uploadFile: File = file;

      // Convert HEIC → JPEG client-side before upload
      if (await isHeic(file)) {
        setState({ phase: "converting" });
        const blob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.88 });
        uploadFile = new File([blob], file.name.replace(/\.heic$/i, ".jpg"), {
          type: "image/jpeg",
        });
      }

      setState({ phase: "uploading" });

      const source = file === uploadFile ? "upload" : "photo";
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("source", source);

      const res = await fetch("/api/process-receipt", { method: "POST", body: form });
      const json = await res.json();

      if (res.status === 409) {
        setState({ phase: "dupe", receiptId: json.receipt_id ?? null });
        return;
      }

      if (!res.ok) {
        setState({ phase: "error", message: json.error ?? "Upload failed." });
        return;
      }

      setState({ phase: "done", receiptId: json.receipt.id });
      setTimeout(() => router.push("/receipts"), 1200);
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = ""; // allow re-selecting same file
  }

  const busy =
    state.phase === "converting" || state.phase === "uploading";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
      <p className="text-[9px] font-bold uppercase tracking-widest text-muted/60 mb-2">
        Capture
      </p>
      <h1 className="text-3xl font-black tracking-tight mb-1">Snap a receipt</h1>
      <p className="text-xs text-muted/60 mb-10">
        Photo or PDF — Claude extracts all the fields automatically.
      </p>

      {/* Hidden inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFileChange}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={onFileChange}
      />

      {/* Buttons */}
      <div className="w-full max-w-sm flex flex-col gap-3">
        <button
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
          className="w-full bg-primary/10 border border-primary/40 hover:bg-primary/20 hover:border-primary/70 text-primary rounded-2xl py-8 text-sm font-bold uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ fontSize: "16px" }}
        >
          📷 Take Photo
        </button>
        <button
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="w-full border border-white/10 hover:border-white/30 text-muted hover:text-foreground rounded-2xl py-8 text-sm font-bold uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ fontSize: "16px" }}
        >
          Upload File
        </button>
      </div>

      {/* Status */}
      <div className="mt-8 w-full max-w-sm text-center">
        {state.phase === "converting" && (
          <p className="text-xs text-muted animate-pulse">Converting HEIC…</p>
        )}
        {state.phase === "uploading" && (
          <p className="text-xs text-muted animate-pulse">
            Uploading &amp; extracting with Claude…
          </p>
        )}
        {state.phase === "done" && (
          <p className="text-xs text-emerald-400 font-bold uppercase tracking-widest">
            ✓ Captured — redirecting…
          </p>
        )}
        {state.phase === "dupe" && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
            <p className="text-xs text-yellow-400 font-bold uppercase tracking-widest mb-1">
              Already captured
            </p>
            <p className="text-[11px] text-muted/70">
              This receipt was already processed.{" "}
              <button
                className="underline"
                onClick={() => router.push("/receipts")}
              >
                View in queue →
              </button>
            </p>
          </div>
        )}
        {state.phase === "error" && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
            <p className="text-xs text-red-400 font-bold uppercase tracking-widest mb-1">
              Error
            </p>
            <p className="text-[11px] text-muted/70">{state.message}</p>
            <button
              className="mt-3 text-[10px] text-muted underline"
              onClick={() => setState({ phase: "idle" })}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
