import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { RANKS, isDirectorOrAbove } from "@/lib/ranks";

export async function generateInviteCodeServer(leaderId: string) {
  // Cryptographically secure random suffix (6 base36 chars)
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes)
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .toUpperCase()
    .slice(0, 6);
  const code = `FHG-${suffix}`;
  const expires_at = new Date(Date.now() + 2 * 60 * 1000).toISOString();

  const { error } = await supabaseAdmin
    .from("invite_codes")
    .insert({ code, leader_id: leaderId, expires_at });
  if (error) throw new Error("Could not create invite code");
  return { code, expires_at };
}


export async function validateInviteCodeServer(code: string) {
  const clean = code.trim().toUpperCase();
  if (!clean) return { valid: false, sponsor_name: null as string | null };

  const { data, error } = await supabaseAdmin
    .from("invite_codes")
    .select("leader_id")
    .eq("code", clean)
    .is("used_by", null)
    .eq("revoked", false)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) return { valid: false, sponsor_name: null as string | null };

  const { data: sponsor } = await supabaseAdmin
    .from("profiles")
    .select("full_name")
    .eq("id", data.leader_id)
    .maybeSingle();

  return { valid: true, sponsor_name: sponsor?.full_name ?? "Sponsor" };
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