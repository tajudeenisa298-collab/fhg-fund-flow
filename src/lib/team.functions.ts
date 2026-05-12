import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { promoteManagedMemberServer, validateInviteCodeServer } from "@/lib/team.server";

export const validateInviteCode = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ code: z.string().min(1).max(40) }).parse(data))
  .handler(async ({ data }) => validateInviteCodeServer(data.code));

export const promoteManagedMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        memberId: z.string().uuid(),
        newRank: z.string().min(2).max(80),
        grantFundHandler: z.boolean().default(false),
        note: z.string().max(500).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    promoteManagedMemberServer({
      callerId: context.userId,
      memberId: data.memberId,
      newRank: data.newRank,
      grantFundHandler: data.grantFundHandler,
      note: data.note,
    }),
  );