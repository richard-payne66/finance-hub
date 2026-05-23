import { NextResponse } from "next/server";
import { api, isConnected, type MonzoApiError } from "@/app/lib/monzo";
import { errorResponse } from "@/app/lib/api-helpers";

type MonzoAccount = {
  id: string;
  closed: boolean;
  description: string;
  type: string;
  owners?: Array<{ user_id: string; preferred_name: string }>;
};

type MonzoBalance = {
  balance: number; // pence
  total_balance: number; // pence — current account + all pots
  currency: string;
};

type MonzoPot = {
  id: string;
  name: string;
  style: string;
  balance: number; // pence
  currency: string;
  deleted: boolean;
};

export type PotsSummary = {
  connected: boolean;
  sca_required: boolean;       // user needs to tap push in Monzo app
  accounts: Array<{
    id: string;
    description: string;
    type: string;
    balance: number;            // £ (current account, no pots)
    total_balance: number;      // £ (incl. pots)
    pots: Array<{
      id: string;
      name: string;
      balance: number;          // £
    }>;
  }>;
  error?: string;
  updated_at: string;
};

const toGbp = (pence: number) => pence / 100;

export async function GET() {
  try {
    if (!(await isConnected())) {
      return NextResponse.json<PotsSummary>({
        connected: false,
        sca_required: false,
        accounts: [],
        updated_at: new Date().toISOString(),
      });
    }

    let accounts: MonzoAccount[];
    try {
      const r = await api<{ accounts: MonzoAccount[] }>("/accounts");
      accounts = r.accounts.filter((a) => !a.closed);
    } catch (err) {
      if ((err as MonzoApiError)?.code === "sca_required") {
        return NextResponse.json<PotsSummary>({
          connected: true,
          sca_required: true,
          accounts: [],
          error: "Approve Finance Hub in your Monzo app, then refresh.",
          updated_at: new Date().toISOString(),
        });
      }
      throw err;
    }

    const result: PotsSummary["accounts"] = await Promise.all(
      accounts.map(async (a) => {
        // Balance + pots for this account, in parallel
        const [bal, potsRes] = await Promise.all([
          api<MonzoBalance>(`/balance?account_id=${a.id}`),
          api<{ pots: MonzoPot[] }>(`/pots?current_account_id=${a.id}`).catch(() => ({ pots: [] as MonzoPot[] })),
        ]);
        return {
          id: a.id,
          description: a.description,
          type: a.type,
          balance: toGbp(bal.balance),
          total_balance: toGbp(bal.total_balance),
          pots: (potsRes.pots ?? [])
            .filter((p) => !p.deleted)
            .map((p) => ({ id: p.id, name: p.name, balance: toGbp(p.balance) })),
        };
      })
    );

    return NextResponse.json<PotsSummary>({
      connected: true,
      sca_required: false,
      accounts: result,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    return errorResponse(err, 500, "Could not load Monzo data.");
  }
}
