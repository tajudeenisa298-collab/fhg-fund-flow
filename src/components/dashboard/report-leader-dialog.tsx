import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, LockKeyhole, MessageCircle, ShieldAlert, Upload } from "lucide-react";
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

const UNKNOWN_LEADER = "__unknown__";

const STATUSES = [
  "Member",
  "Distributor",
  "Manager",
  "Senior Manager",
  "Executive Manager",
  "Director",
  "Emerald Director",
  "Sapphire Director",
  "Ruby Director",
  "Diamond Director",
] as const;

const OFFENCES = [
  { value: "funds_mismanagement", label: "Funds mismanagement" },
  { value: "sexual_assault", label: "Sexual assault" },
  { value: "sexual_harassment", label: "Sexual harassment" },
  { value: "abuse_or_harassment", label: "Abuse or harassment" },
  { value: "threats_or_intimidation", label: "Threats or intimidation" },
  { value: "fraud_or_scam", label: "Fraud, scam, or deception" },
  { value: "discrimination", label: "Discrimination" },
  { value: "privacy_breach", label: "Privacy breach" },
  { value: "dating", label: "Dating or relationship pressure" },
  { value: "policy_violation", label: "Other policy violation" },
  { value: "custom", label: "Custom offence" },
] as const;

function proofExtension(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext || "bin";
}

export function ReportLeaderDialog({
  compact = false,
  featured = false,
}: {
  compact?: boolean;
  featured?: boolean;
}) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [leaders, setLeaders] = useState<LeaderOption[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [leaderId, setLeaderId] = useState("");
  const [reportedName, setReportedName] = useState("");
  const [reportedStatus, setReportedStatus] = useState("");
  const [reportedNickname, setReportedNickname] = useState("");
  const [offence, setOffence] = useState<string>("");
  const [offenceCustom, setOffenceCustom] = useState("");
  const [description, setDescription] = useState("");
  const [proof, setProof] = useState<File | null>(null);
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
    setLeaderId("");
    setReportedName("");
    setReportedStatus("");
    setReportedNickname("");
    setOffence("");
    setOffenceCustom("");
    setDescription("");
    setProof(null);
    setSubmitted(false);
  }

  function selectLeader(value: string) {
    setLeaderId(value);
    if (value === UNKNOWN_LEADER) {
      setReportedName("");
      setReportedStatus("");
      return;
    }

    const selected = leaders.find((l) => l.id === value);
    setReportedName(selected?.full_name ?? "");
    setReportedStatus(selected?.rank ?? "");
  }

  async function uploadProof() {
    if (!proof) return null;
    if (!profile?.id) throw new Error("Please sign in again before uploading proof.");
    if (proof.size > 10 * 1024 * 1024) throw new Error("Proof must be under 10 MB.");

    const path = `${profile.id}/${crypto.randomUUID()}.${proofExtension(proof.name)}`;
    const { error } = await supabase.storage
      .from("leader-report-proofs")
      .upload(path, proof, { contentType: proof.type || "application/octet-stream", upsert: false });
    if (error) throw new Error(`Proof upload failed: ${error.message}`);
    return path;
  }

  async function submit() {
    if (!leaderId) return toast.error("Choose the person, or choose that you only know their details.");
    if (!reportedStatus.trim()) return toast.error("Please select the person's status.");
    if (reportedName.trim().length < 2 && reportedNickname.trim().length < 2) {
      return toast.error("Enter their full name, nickname, or enough detail to identify them.");
    }
    if (!offence) return toast.error("Please choose an offence category.");
    if (offence === "custom" && offenceCustom.trim().length < 3) {
      return toast.error("Please name the custom offence.");
    }
    if (description.trim().length < 10) {
      return toast.error("Please describe what happened (at least 10 characters).");
    }
    if (name.trim().length < 2) return toast.error("Your name is required.");
    const nsn = whatsapp.trim().replace(/^\+\d{1,4}/, "");
    const waErr = validateWhatsappDigits(nsn);
    if (waErr) return toast.error(waErr);

    setSubmitting(true);
    let proofPath: string | null = null;
    try {
      proofPath = await uploadProof();
      const { error } = await supabase.rpc("submit_leader_report", {
        _reported_leader_id: leaderId === UNKNOWN_LEADER ? null : leaderId,
        _reported_status: reportedStatus.trim(),
        _reported_name: reportedName.trim(),
        _reported_nickname: reportedNickname.trim(),
        _offence: offence,
        _offence_custom: offence === "custom" ? offenceCustom.trim() : "",
        _description: description.trim(),
        _reporter_name: name.trim(),
        _reporter_whatsapp: whatsapp.trim(),
        _proof_path: proofPath ?? "",
      });

      if (error) {
        if (proofPath) await supabase.storage.from("leader-report-proofs").remove([proofPath]);
        throw new Error(error.message);
      }

      setSubmitted(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Report could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant={featured ? "default" : "outline"}
          size={compact ? "sm" : "sm"}
          className={`gap-2 ${featured ? "shadow-elegant" : ""}`}
        >
          <ShieldAlert className="size-4" />
          {compact ? "Report" : "Report a leader"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        {submitted ? (
          <>
            <DialogHeader>
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/15">
                <CheckCircle2 className="size-6 text-success" />
              </div>
              <DialogTitle className="text-center">Report submitted</DialogTitle>
              <DialogDescription>
                Thank you. You will be contacted within 24 hours through the WhatsApp details
                you provided.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
              The person you reported will <span className="font-medium text-foreground">not</span>{" "}
              be notified. This report only goes to the leaders above them who are meant to handle it.
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
                The reported person will not be told. The alert is sent privately to the two
                appropriate leaders above them, and someone will contact you within 24 hours.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2 rounded-xl border bg-primary/5 p-3 text-sm sm:grid-cols-3">
              <div className="flex items-start gap-2">
                <LockKeyhole className="mt-0.5 size-4 text-primary" />
                <span>Private to the right leaders</span>
              </div>
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 size-4 text-primary" />
                <span>Reported person is not notified</span>
              </div>
              <div className="flex items-start gap-2">
                <MessageCircle className="mt-0.5 size-4 text-primary" />
                <span>Follow-up within 24 hours</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Person you are reporting</Label>
                <Select value={leaderId} onValueChange={selectLeader}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a leader or use manual details" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNKNOWN_LEADER}>I only know their name/status/nickname</SelectItem>
                    {leaders
                      .filter((l) => l.id !== profile?.id)
                      .map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.full_name} - {l.rank}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Their status</Label>
                  <Select value={reportedStatus} onValueChange={setReportedStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Full name, if known</Label>
                  <Input
                    value={reportedName}
                    onChange={(e) => setReportedName(e.target.value)}
                    placeholder="e.g. Tunde Ade"
                    maxLength={120}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Nickname or identifying detail, if you do not know their name</Label>
                <Input
                  value={reportedNickname}
                  onChange={(e) => setReportedNickname(e.target.value)}
                  placeholder="e.g. Brother T, Lagos office, tall manager"
                  maxLength={180}
                />
              </div>

              <div className="space-y-1">
                <Label>Offence</Label>
                <Select value={offence} onValueChange={setOffence}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose offence type" />
                  </SelectTrigger>
                  <SelectContent>
                    {OFFENCES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {offence === "custom" && (
                <div className="space-y-1">
                  <Label>Custom offence</Label>
                  <Input
                    value={offenceCustom}
                    onChange={(e) => setOffenceCustom(e.target.value)}
                    placeholder="Name the offence"
                    maxLength={120}
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label>What happened?</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what happened, when it happened, where it happened, and who was involved."
                  rows={5}
                  maxLength={4000}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="leader-report-proof">Proof upload (optional)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="leader-report-proof"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    onChange={(e) => setProof(e.target.files?.[0] ?? null)}
                  />
                  <Upload className="hidden size-4 text-muted-foreground sm:block" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Images or PDF only, up to 10 MB.
                </p>
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
                Your name, WhatsApp number, description, and proof are shared only with the leaders
                who receive this confidential report.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={submitting}>
                {submitting ? "Submitting..." : "Submit report"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
