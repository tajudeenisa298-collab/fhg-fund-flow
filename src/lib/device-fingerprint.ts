// Lightweight, privacy-friendly device fingerprint for the login_devices table.
// Not a security boundary — just used to detect "first sign-in from this browser".

async function sha256(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getOrCreateClientId(): string {
  try {
    const key = "fhg_device_id";
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

export function deviceLabel(): string {
  const ua = navigator.userAgent;
  let os = "Unknown OS";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iOS/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";

  return `${browser} on ${os}`;
}

export async function deviceHash(): Promise<string> {
  const id = getOrCreateClientId();
  const parts = [
    id,
    navigator.userAgent,
    navigator.language,
    `${screen.width}x${screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join("|");
  return sha256(parts);
}
