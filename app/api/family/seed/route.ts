import { NextResponse } from "next/server";
import { errorResponse } from "@/app/lib/api-helpers";
import { countExpenses, createExpenses, type ExpenseInput } from "@/app/lib/family";

// ─────────────────────────────────────────────────────────────────────────────
// Expenses — sourced from Richard & Catrin's "Outgoings calc" Google Sheet
// (Jan 26 tab: https://docs.google.com/spreadsheets/d/1BbcvR2Jn3JRdZREOKjs-34ldXJDHkeM0w02dKME3-M4)
// Cross-referenced against Nationwide joint account direct debits where amounts
// differ (statement actuals in parentheses).
// ─────────────────────────────────────────────────────────────────────────────
const EXPENSES: ExpenseInput[] = [
  // Joint household — sheet total £5,137.41
  { name: "Mortgage",                  amount: 2576,   category: "joint",        notes: "Barclays — 2yr tracker from June 2026 (statement: £2,576.58)" },
  { name: "Council tax",               amount: 297,    category: "joint",        notes: "MSDC (statement shows £312 — may include arrears)" },
  { name: "House insurance",           amount: 56.70,  category: "joint",        notes: "The AA — renewed £688 annual, 7th of month" },
  { name: "Life insurance",            amount: 35.03,  category: "joint",        notes: "Legal & General" },
  { name: "Decreasing life insurance", amount: 9.68,   category: "joint",        notes: "Legal & General" },
  { name: "Income protection (Rich)",  amount: 16.70,  category: "joint",        notes: "Legal & General" },
  { name: "Water",                     amount: 74,     category: "joint",        notes: "On a meter (statement shows £100 — check if correct)" },
  { name: "Gas & electricity",         amount: 271,    category: "joint",        notes: "Octopus (statement shows £303.71 — may reflect winter)" },
  { name: "Car tax",                   amount: 17.06,  category: "joint",        notes: "Due Oct 1st — WO14JUK" },
  { name: "Car insurance",             amount: 46,     category: "joint",        notes: "Go Skippy — renewed £394 annual from 9 Oct" },
  { name: "Cleaning",                  amount: 320,    category: "joint" },
  { name: "Food",                      amount: 1200,   category: "joint" },
  { name: "Petrol",                    amount: 100,    category: "joint" },
  { name: "Tesco delivery",            amount: 7.99,   category: "joint" },
  { name: "TV subs",                   amount: 15,     category: "joint",        notes: "Disney & Amazon" },
  { name: "Coffee",                    amount: 36,     category: "joint" },
  { name: "Borde Hill",                amount: 9.25,   category: "joint" },
  { name: "Xmas sink fund",            amount: 50,     category: "joint" },

  // Kids — sheet total £881.68
  { name: "The Den",                   amount: 350,    category: "kids" },
  { name: "Art club",                  amount: 35,     category: "kids" },
  { name: "Swimming",                  amount: 60,     category: "kids" },
  { name: "ISA savings (kids)",        amount: 200,    category: "kids",         notes: "HL regular savings (statement: £100 — check split)" },
  { name: "Uniform / trips",           amount: 30,     category: "kids" },
  { name: "Acro",                      amount: 31.68,  category: "kids",         notes: "GoCardless" },
  { name: "Babysitting",               amount: 75,     category: "kids" },
  { name: "Air Acro",                  amount: 100,    category: "kids" },

  // Cat personal — sheet total £409
  { name: "Haircut (Cat)",             amount: 50,     category: "cat_personal" },
  { name: "Train (Cat)",               amount: 200,    category: "cat_personal" },
  { name: "Taxi (Cat)",                amount: 40,     category: "cat_personal" },
  { name: "Phone (Cat)",               amount: 20,     category: "cat_personal" },
  { name: "Madisons",                  amount: 60,     category: "cat_personal" },
  { name: "Peloton",                   amount: 39,     category: "cat_personal" },

  // Joint fun — amounts unknown, seeded as £0 placeholders
  { name: "Take outs",                 amount: 0,      category: "joint_fun" },
  { name: "Pub / Meals",               amount: 0,      category: "joint_fun" },
  { name: "Coffee / Cake",             amount: 0,      category: "joint_fun" },
  { name: "Days out",                  amount: 0,      category: "joint_fun" },
];

export async function POST() {
  try {
    const existing = await countExpenses();
    if (existing > 0) {
      return NextResponse.json({ ok: true, seeded: 0, message: `Skipped — ${existing} expenses already exist.` });
    }
    const expenses = await createExpenses(EXPENSES);
    return NextResponse.json({ ok: true, seeded: expenses.length, expenses });
  } catch (err) {
    return errorResponse(err);
  }
}
