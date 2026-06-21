import type { SupabaseClient } from "@supabase/supabase-js";

type ChannelWithTopic = ReturnType<SupabaseClient["channel"]> & { topic?: string };

export function removeRealtimeChannelsByTopicPrefix(
  supabase: Pick<SupabaseClient, "getChannels" | "removeChannel">,
  topicPrefix: string,
) {
  const realtimePrefix = `realtime:${topicPrefix}`;
  for (const channel of supabase.getChannels() as ChannelWithTopic[]) {
    const topic = channel.topic ?? "";
    if (topic === realtimePrefix || topic.startsWith(`${realtimePrefix}:`)) {
      void supabase.removeChannel(channel);
    }
  }
}
