import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const cache = new Map<string, { url: string; expires: number }>();
const SIGN_FOR = 60 * 60 * 6; // 6 hours

async function getSignedUrl(path: string): Promise<string | null> {
  const now = Date.now();
  const cached = cache.get(path);
  if (cached && cached.expires > now + 60_000) return cached.url;
  const { data } = await supabase.storage.from("avatars").createSignedUrl(path, SIGN_FOR);
  if (!data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, expires: now + SIGN_FOR * 1000 });
  return data.signedUrl;
}

export function UserAvatar({
  name,
  avatarPath,
  className,
}: {
  name?: string | null;
  avatarPath?: string | null;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!avatarPath) {
      setUrl(null);
      return;
    }
    getSignedUrl(avatarPath).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [avatarPath]);

  const initials = (name ?? "?")
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Avatar className={cn(className)}>
      {url && <AvatarImage src={url} alt={name ?? "Avatar"} />}
      <AvatarFallback>{initials || "?"}</AvatarFallback>
    </Avatar>
  );
}
