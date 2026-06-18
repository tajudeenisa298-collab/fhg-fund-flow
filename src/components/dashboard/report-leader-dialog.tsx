import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { WhatsappInput, validateWhatsappDigits } from "@/components/whatsapp-input";

type LeaderOption = { id: string; full_name: string; rank: string };

const OFFENCES = [
  { value: "funds_mismanagement", label: "Funds mismanagement" },
  { value: "dating", label: "Dating" },
  { value: "sexual_harassment", label: "Sexual harassment" },
  { value: "custom", label: "Other (specify)" },
] as const;

export function ReportLeaderDialog() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [leaders, setLeaders] = useState<LeaderOption[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [leaderId, setLeaderId] = useState("");
  const [offence, setOffence] = useState<string>("");
  const [offenceCustom, setOffenceCustom] = useState("");
  const [description, setDescription] = useState("");
  const [name, setName] = useState(profile?.full_name ?? "");
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp_number ?? "");

  useEffect(() => {
    if (!open) return;
    setName(profile?.full_name ?? "");
    setWhatsapp(profile?.whatsapp_number ?? "");
    supabase
      .from("profiles")
      .select("id, full_name, rank")
      .eq("can_handle_funds", true)
      .is("terminated_at", null)
      .order("full_name")
      .then(({ data }) => setLeaders((data ?? []) as LeaderOption[]));
  }, [open, profile?.full_name, profile?.whatsapp_number]);

  function reset() {
    setLeaderId(""); setOffence(""); setOffenceCustom("");
    setDescription(""); setSubmitted(false);
  }

  async function submit() {
    if (!leaderId) return toast.error("Please select the leader you are reporting.");
    if (!offence) return toast.error("Please choose an offence category.");
    if (offence === "custom" && offenceCustom.trim().length < 3)
      return toast.error("Please name the custom offence.");
    if (description.trim().length < 10)
      return toast.error("Please describe what happened (at least 10 characters).");
    if (name.trim().length < 2) return toast.error("Your name is required.");
    const nsn = whatsapp.trim().replace(/^\+\d{1,4}/, "");
    const waErr = validateWhatsappDigits(nsn);
    if (waErr) return toast.error(waErr);

    const selected = leaders.find((l) => l.id === leaderId);
    setSubmitting(true);
    const { error } = await supabase.rpc("submit_leader_report", {
      _reported_leader_id: leaderId,
      _reported_rank: selected?.rank ?? "",
      _offence: offence,
      _offence_custom: offence === "custom" ? offenceCustom.trim() : "",
      _description: description.trim(),
      _reporter_name: name.trim(),
      _reporter_whatsapp: whatsapp.trim(),
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    setSubmitted(true);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ShieldAlert className="size-4" /> Report a leader
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {submitted ? (
          <>
            <DialogHeader>
              <DialogTitle>Report submitted</DialogTitle>
              <DialogDescription>
                Senior leaders have been notified privately. Someone will reach out to you
                on WhatsApp within the next 24 hours.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
              The person you reported will <span className="font-medium text-foreground">not</span>{" "}
              be notified or shown your identity. This case will be handled off-platform.
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Report a leader confidentially</DialogTitle>
              <DialogDescription>
                Your report goes only to the top senior leaders above the person you are reporting.
                The reported person will not see this or know who filed it. A leader will contact
                you on WhatsApp within 24 hours.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Leader you are reporting</Label>
                <Select value={leaderId} onValueChange={setLeaderId}>
                  <SelectTrigger><SelectValue placeholder="Choose a fund-handling leader" /></SelectTrigger>
                  <SelectContent>
                    {leaders
                      .filter((l) => l.id !== profile?.id)
                      .map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.full_name} — {l.rank}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Their current rank/status</Label>
                <Input
                  value={leaders.find((l) => l.id === leaderId)?.rank ?? ""}
                  readOnly
                  placeholder="Select a leader first"
                />
              </div>

              <div className="space-y-1">
                <Label>Offence</Label>
                <Select value={offence} onValueChange={setOffence}>
                  <SelectTrigger><SelectValue placeholder="Choose offence type" /></SelectTrigger>
                  <SelectContent>
                    {OFFENCES.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {offence === "custom" && (
                <div className="space-y-1">
                  <Label>Specify offence</Label>
                  <Input
                    value={offenceCustom}
                    onChange={(e) => setOffenceCustom(e.target.value)}
                    placeholder="e.g. Verbal abuse"
                    maxLength={120}
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label>What happened?</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what happened, when, and any context the senior leader needs to follow up."
                  rows={5}
                  maxLength={4000}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Your name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Your WhatsApp number</Label>
                  <WhatsappInput value={whatsapp} onChange={setWhatsapp} />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Your name and number are shared <span className="font-medium text-foreground">only</span>{" "}
                with the senior leaders who will contact you — never with the reported person.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={submitting}>
                {submitting ? "Submitting…" : "Submit report"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
