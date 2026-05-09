import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

interface PaystackBank {
  name: string;
  code: string;
  slug?: string;
  active?: boolean;
}

interface PaystackResolveData {
  account_number: string;
  account_name: string;
}

const PAYSTACK_BASE = "https://api.paystack.co";

const headers = () => ({
  Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY ?? ""}`,
  "Content-Type": "application/json",
});

export const listPaystackBanks = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ banks: PaystackBank[]; error: string | null }> => {
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return { banks: [], error: "Paystack not configured" };
    }
    try {
      const r = await fetch(
        `${PAYSTACK_BASE}/bank?country=nigeria&perPage=200`,
        { headers: headers() },
      );
      const j = (await r.json()) as { status: boolean; message: string; data: PaystackBank[] };
      if (!j.status) return { banks: [], error: j.message };
      const banks = j.data
        .filter((b) => b.active !== false)
        .map((b) => ({ name: b.name, code: b.code, slug: b.slug, active: true }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { banks, error: null };
    } catch (e) {
      console.error("[paystack] listBanks error", e);
      return { banks: [], error: "Failed to load banks" };
    }
  },
);

const resolveSchema = z.object({
  account_number: z.string().regex(/^\d{10}$/, "Account number must be 10 digits"),
  bank_code: z.string().min(2).max(20),
});

export const resolveBankAccount = createServerFn({ method: "POST" })
  .inputValidator((d) => resolveSchema.parse(d))
  .handler(
    async ({
      data,
    }): Promise<{ verified: boolean; account_name: string | null; error: string | null }> => {
      if (!process.env.PAYSTACK_SECRET_KEY) {
        return { verified: false, account_name: null, error: "Paystack not configured" };
      }
      try {
        const url = `${PAYSTACK_BASE}/bank/resolve?account_number=${encodeURIComponent(
          data.account_number,
        )}&bank_code=${encodeURIComponent(data.bank_code)}`;
        const r = await fetch(url, { headers: headers() });
        const j = (await r.json()) as {
          status: boolean;
          message: string;
          data?: PaystackResolveData;
        };
        if (!j.status || !j.data?.account_name) {
          return {
            verified: false,
            account_name: null,
            error: j.message || "Could not verify account",
          };
        }
        return { verified: true, account_name: j.data.account_name, error: null };
      } catch (e) {
        console.error("[paystack] resolve error", e);
        return { verified: false, account_name: null, error: "Verification service unavailable" };
      }
    },
  );
