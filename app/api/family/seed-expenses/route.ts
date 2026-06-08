import { NextResponse } from "next/server";
import { errorResponse } from "@/app/lib/api-helpers";
import { countExpenses, createExpenses, type ExpenseInput } from "@/app/lib/family";

// Seed data lifted from Richard & Catrin's "Outgoings calc" sheet (Jan 26 tab).
// All monthly. Blank-amount "fun" lines are seeded at 0 as editable placeholders.
const SEED: ExpenseInput[] = [
  // Joint outgoings
  { name: "Mortgage", amount: 2576, category: "joint", notes: "Barclays from June 2026 - 2yr tracker" },
  { name: "Council tax", amount: 297, category: "joint" },
  { name: "House insurance", amount: 56.7, category: "joint", notes: "The AA" },
  { name: "Life insurance", amount: 35.03, category: "joint", notes: "Legal & General" },
  { name: "Decreasing life insurance", amount: 9.68, category: "joint", notes: "Legal & General" },
  { name: "Rich income protection", amount: 16.7, category: "joint", notes: "Legal & General" },
  { name: "Water", amount: 74, category: "joint", notes: "On a meter" },
  { name: "Gas & electric", amount: 271, category: "joint", notes: "Octopus" },
  { name: "Car tax", amount: 17.06, category: "joint" },
  { name: "Car insurance", amount: 46, category: "joint", notes: "Go Skippy" },
  { name: "Cleaning", amount: 320, category: "joint" },
  { name: "Food", amount: 1200, category: "joint" },
  { name: "Petrol", amount: 100, category: "joint" },
  { name: "Tesco delivery", amount: 7.99, category: "joint" },
  { name: "TV subs", amount: 15, category: "joint", notes: "Disney & Amazon" },
  { name: "Coffee", amount: 36, category: "joint" },
  { name: "Borde Hill", amount: 9.25, category: "joint" },
  { name: "Xmas sink fund", amount: 50, category: "joint" },
  // Kids
  { name: "The Den", amount: 350, category: "kids" },
  { name: "Art club", amount: 35, category: "kids" },
  { name: "Swimming", amount: 60, category: "kids" },
  { name: "ISA savings", amount: 200, category: "kids" },
  { name: "Uniform / trips", amount: 30, category: "kids" },
  { name: "Acro", amount: 31.68, category: "kids" },
  { name: "Babysitting", amount: 75, category: "kids" },
  { name: "Air Acro", amount: 100, category: "kids" },
  // Cat personal
  { name: "Haircut", amount: 50, category: "cat_personal" },
  { name: "Train", amount: 200, category: "cat_personal" },
  { name: "Taxi", amount: 40, category: "cat_personal" },
  { name: "Phone", amount: 20, category: "cat_personal" },
  { name: "Madisons", amount: 60, category: "cat_personal" },
  { name: "Peloton", amount: 39, category: "cat_personal" },
  // Joint fun (placeholders — fill in amounts)
  { name: "Take outs", amount: 0, category: "joint_fun" },
  { name: "Pub / Meals", amount: 0, category: "joint_fun" },
  { name: "Coffee / Cake", amount: 0, category: "joint_fun" },
  { name: "Days out", amount: 0, category: "joint_fun" },
];

export async function POST() {
  try {
    const existing = await countExpenses();
    if (existing > 0) {
      return NextResponse.json({ seeded: 0, skipped: true, message: "Expenses already exist — not seeding." });
    }
    const created = await createExpenses(SEED);
    return NextResponse.json({ seeded: created.length, expenses: created });
  } catch (err) {
    return errorResponse(err);
  }
}
