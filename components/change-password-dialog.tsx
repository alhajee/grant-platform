"use client";

import { FormEvent, useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { minPasswordLength, newPasswordProblem } from "@/lib/password-policy";

type Errors = { currentPassword?: string; newPassword?: string; confirm?: string };

/** Account menu "Change password": current password, then the new one twice (app/api/auth/password/change). */
export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [saving, setSaving] = useState(false);
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    const currentPassword = String(data.get("currentPassword") ?? ""), newPassword = String(data.get("newPassword") ?? ""), confirm = String(data.get("confirm") ?? "");
    const next: Errors = {
      currentPassword: currentPassword ? undefined : "Enter your current password",
      newPassword: newPasswordProblem(newPassword) ?? undefined,
      confirm: newPassword && newPassword !== confirm ? "The passwords do not match" : undefined,
    };
    if (next.currentPassword || next.newPassword || next.confirm) { setErrors(next); return; }
    setSaving(true); setErrors({});
    try {
      const response = await fetch("/api/auth/password/change", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const result = await response.json().catch(() => ({})) as { error?: string; field?: keyof Errors };
      if (!response.ok) { setErrors({ [result.field ?? "newPassword"]: result.error ?? "Your password could not be changed. Please try again." }); return; }
      toast.success("Password changed. Other devices have been signed out.");
      onOpenChange(false);
    } catch {
      setErrors({ newPassword: "Unable to reach the portal. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  const field = (name: keyof Errors, label: string, autoComplete: string, description?: string) => <Field data-invalid={!!errors[name] || undefined} data-disabled={saving}>
    <FieldLabel htmlFor={`change-${name}`}>{label}</FieldLabel>
    <InputGroup>
      <InputGroupInput id={`change-${name}`} name={name} type={show ? "text" : "password"} autoComplete={autoComplete} required disabled={saving} aria-invalid={!!errors[name] || undefined} />
      {name === "currentPassword" && <InputGroupAddon align="inline-end"><InputGroupButton size="icon-xs" aria-label={show ? "Hide passwords" : "Show passwords"} aria-pressed={show} onClick={() => setShow(value => !value)}>{show ? <EyeOffIcon /> : <EyeIcon />}</InputGroupButton></InputGroupAddon>}
    </InputGroup>
    {errors[name] ? <FieldError>{errors[name]}</FieldError> : description && <FieldDescription>{description}</FieldDescription>}
  </Field>;

  return <Dialog open={open} onOpenChange={next => { if (!saving) { onOpenChange(next); if (!next) { setErrors({}); setShow(false); } } }}>
    <DialogContent className="sm:max-w-md" showCloseButton={!saving}>
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>You stay signed in here; other devices are signed out</DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-4">
          {field("currentPassword", "Current password", "current-password")}
          {field("newPassword", "New password", "new-password", `At least ${minPasswordLength} characters, with a letter and a number`)}
          {field("confirm", "Confirm new password", "new-password")}
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving && <Spinner data-icon="inline-start" />}Change password</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
