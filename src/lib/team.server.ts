import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { RANKS, isDirectorOrAbove } from "@/lib/ranks";

export async function validateInviteCodeServer(code: string) {
  const clean = code.trim().toUpperCase();
  if (!clean) return { valid: false, sponsor_name: null as string | null };

  const { data, error } = await supabaseAdmin
    .from("invite_codes")
    .select("leader_id, profiles!inner(full_name)")
    .eq("code", clean)
    .is("used_by", null)
    .eq("revoked", false)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) return { valid: false, sponsor_name: null as string | null };
  const profile = data.profiles as unknown as { full_name?: string };
  return { valid: true, sponsor_name: profile.full_name ?? "Sponsor" };
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