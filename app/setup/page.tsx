import BankStatementsChecklist from "@/app/components/BankStatementsChecklist";
import DocumentChecklist from "@/app/components/DocumentChecklist";
import ShareLink from "@/app/components/ShareLink";

export default function SetupPage() {
  return (
    <main className="min-h-screen px-4 sm:px-8 py-6 max-w-4xl mx-auto">
      <header className="flex items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">SETUP</h1>
          <p className="text-xs text-muted/70 mt-1">Documents and records for Richard Payne LTD</p>
        </div>
      </header>

      <div className="flex flex-col gap-10">
        <ShareLink />
        <BankStatementsChecklist />
        <DocumentChecklist />
      </div>
    </main>
  );
}
