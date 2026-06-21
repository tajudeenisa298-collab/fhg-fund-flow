import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { RANKS, isDirectorOrAbove } from "@/lib/ranks";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

function createPublicServerSupabase() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing Supabase public environment variables");
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function generateInviteCodeServer(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase.rpc("generate_invite_code" as never);
  if (error) throw new Error(error.message || "Could not create invite code");

  const invite = Array.isArray(data) ? data[0] : data;
  if (!invite) throw new Error("Could not create invite code");
  return invite;
}

export async function validateInviteCodeServer(code: string) {
  const clean = code.trim().toUpperCase();
  if (!clean) return { valid: false, sponsor_name: null as string | null };

  const supabase = createPublicServerSupabase();
  const { data, error } = await supabase.rpc("validate_invite_code" as never, { _code: clean } as never);
  const invite = Array.isArray(data) ? data[0] : data;

  if (error || !invite) return { valid: false, sponsor_name: null as string | null };
  return { valid: true, sponsor_name: (invite as { leader_name?: string }).leader_name ?? "Sponsor" };
}

export async function promoteManagedMemberServer(input: {
  callerId: string;
  memberId: string;
  newRank: string;
  grantFundHandler: boolean;
  note?: string | null;
}) {
  if (!RANKS.includes(input.newRank as (typeof RANKS)[number])) {
    throw new Error("Invalid rank");
  }

  const [{ data: role }, { data: member }] = await Promise.all([
    supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", input.callerId)
      .eq("role", "leader")
      .maybeSingle(),
    supabaseAdmin.from("profiles").select("*").eq("id", input.memberId).maybeSingle(),
  ]);

  if (!role) throw new Error("Only team leaders can promote members");
  if (!member) throw new Error("Member not found");
  if (member.leader_id !== input.callerId) {
    throw new Error("Only the member's current team leader can promote them");
  }

  const canHandle = isDirectorOrAbove(input.newRank) || input.grantFundHandler;
  const { error: updateError } = await supabaseAdmin
    .from("profiles")
    .update({
      rank: input.newRank,
      can_handle_funds: canHandle ? true : member.can_handle_funds,
      leader_id: canHandle ? input.memberId : member.leader_id,
    })
    .eq("id", input.memberId);
  if (updateError) throw updateError;

  if (canHandle) {
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: input.memberId, role: "leader" }, { onConflict: "user_id,role" });
    if (roleError) throw roleError;
    await supabaseAdmin.rpc("recompute_fund_handlers", { _root: input.memberId });
  }

  await supabaseAdmin.rpc("notify_user", {
    _user_id: input.memberId,
    _title: "Rank updated",
    _body: `Your rank is now ${input.newRank}`,
    _kind: "generic",
    _link: "/dashboard",
  });

  return { ok: true };
}
