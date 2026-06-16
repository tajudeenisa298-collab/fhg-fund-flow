import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export function AvatarUpload() {
  const { profile, refresh } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (!profile?.avatar_url) {
      setPreviewUrl(null);
      return;
    }
    supabase.storage
      .from("avatars")
      .createSignedUrl(profile.avatar_url, 60 * 60)
      .then(({ data }) => {
        if (active) setPreviewUrl(data?.signedUrl ?? null);
      });
    return () => {
      active = false;
    };
  }, [profile?.avatar_url]);

  const initials = (profile?.full_name ?? "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !profile) return;
    if (!ALLOWED.includes(file.type)) return toast.error("Use a JPG, PNG, or WebP image");
    if (file.size > MAX_BYTES) return toast.error("Image must be 3 MB or smaller");

    setBusy(true);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setBusy(false);
      return toast.error(upErr.message);
    }
    // Best-effort remove old file
    if (profile.avatar_url && profile.avatar_url !== path) {
      await supabase.storage.from("avatars").remove([profile.avatar_url]);
    }
    const { error: updErr } = await supabase
      .from("profiles")
      .update({ avatar_url: path })
      .eq("id", profile.id);
    setBusy(false);
    if (updErr) return toast.error(updErr.message);
    toast.success("Profile picture updated");
    await refresh();
  };

  const remove = async () => {
    if (!profile?.avatar_url) return;
    setBusy(true);
    await supabase.storage.from("avatars").remove([profile.avatar_url]);
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", profile.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Profile picture removed");
    await refresh();
  };

  return (
    <div className="flex items-center gap-4">
      <Avatar className="h-20 w-20">
        {previewUrl && <AvatarImage src={previewUrl} alt={profile?.full_name ?? "Avatar"} />}
        <AvatarFallback className="text-lg">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={onPick}
        />
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Camera className="mr-1 size-4" />}
          {profile?.avatar_url ? "Replace photo" : "Upload photo"}
        </Button>
        {profile?.avatar_url && (
          <Button variant="ghost" size="sm" onClick={remove} disabled={busy}>
            <Trash2 className="mr-1 size-4" /> Remove
          </Button>
        )}
        <p className="basis-full text-xs text-muted-foreground">JPG, PNG, or WebP · up to 3 MB</p>
      </div>
    </div>
  );
}
