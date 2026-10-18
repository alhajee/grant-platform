"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeftIcon, CircleCheckIcon, EyeIcon, EyeOffIcon, LockKeyholeIcon, TriangleAlertIcon } from "lucide-react";
import { LoginMobileBrand, LoginShell, signInHref } from "@/components/login-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { minPasswordLength, newPasswordProblem } from "@/lib/password-policy";

type Stage = "checking" | "invalid" | "form" | "done";

/** Where the reset email's link lands: checks the link, then sets the new password (app/api/auth/password/reset). */
export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [stage, setStage] = useState<Stage>("checking");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token") ?? "";
    const check: Promise<Stage> = value
      ? fetch(`/api/auth/password/reset?token=${encodeURIComponent(value)}`, { cache: "no-store" }).then(response => response.json() as Promise<{ valid?: boolean }>).then(result => result.valid ? "form" : "invalid", () => "form")
      : Promise.resolve("invalid");
    void check.then(next => { setToken(value); setStage(next); });
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget), password = String(data.get("password") ?? ""), confirm = String(data.get("confirm") ?? "");
    const problem = newPasswordProblem(password);
    if (problem || password !== confirm) { setErrors({ password: problem ?? undefined, confirm: !problem && password !== confirm ? "The passwords do not match" : undefined }); return; }
    setSaving(true); setErrors({});
    try {
      const response = await fetch("/api/auth/password/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (response.ok) { setStage("done"); return; }
      if (/expired|already used/i.test(result.error ?? "")) setStage("invalid");
      else setErrors({ password: result.error ?? "The password could not be changed. Please try again." });
    } catch {
      setErrors({ form: "Unable to reach the portal. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  const toggle = <InputGroupAddon align="inline-end"><InputGroupButton size="icon-xs" aria-label={show ? "Hide passwords" : "Show passwords"} aria-pressed={show} onClick={() => setShow(value => !value)}>{show ? <EyeOffIcon /> : <EyeIcon />}</InputGroupButton></InputGroupAddon>;
  return (
    <LoginShell labelledBy="reset-title">
      <Card className="signin-card">
        <CardHeader className="signin-heading">
          <LoginMobileBrand />
          <CardTitle id="reset-title">{stage === "done" ? "Password changed" : stage === "invalid" ? "Link no longer works" : "Choose a new password"}</CardTitle>
        </CardHeader>
        <CardContent>
          {stage === "checking" && <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-4 w-40" /><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></div>}
          {stage === "invalid" && <div className="flex flex-col gap-4">
            <Alert><TriangleAlertIcon /><AlertTitle>This reset link has expired or was already used</AlertTitle><AlertDescription>Links work once and for an hour. Ask for a new one.</AlertDescription></Alert>
            <Button asChild><a href="/forgot-password">Send a new link</a></Button>
          </div>}
          {stage === "done" && <div className="flex flex-col gap-4">
            <Alert><CircleCheckIcon /><AlertTitle>Your new password is set</AlertTitle><AlertDescription>You have been signed out everywhere. Sign in with your new password.</AlertDescription></Alert>
            <Button asChild className="signin-button mt-0"><a href={signInHref}>Sign in to BEAPMS</a></Button>
          </div>}
          {stage === "form" && <form onSubmit={submit} noValidate>
            <FieldGroup className="gap-5">
              <Field data-disabled={saving} data-invalid={!!errors.password || undefined}>
                <FieldLabel htmlFor="password">New password</FieldLabel>
                <InputGroup className="form-input-group">
                  <InputGroupAddon><LockKeyholeIcon aria-hidden="true" /></InputGroupAddon>
                  <InputGroupInput id="password" name="password" type={show ? "text" : "password"} autoComplete="new-password" required minLength={minPasswordLength} disabled={saving} aria-invalid={!!errors.password || undefined} aria-describedby="password-rules" />
                  {toggle}
                </InputGroup>
                {errors.password ? <FieldError>{errors.password}</FieldError> : <FieldDescription id="password-rules">At least {minPasswordLength} characters, with a letter and a number</FieldDescription>}
              </Field>
              <Field data-disabled={saving} data-invalid={!!errors.confirm || undefined}>
                <FieldLabel htmlFor="confirm">Confirm new password</FieldLabel>
                <InputGroup className="form-input-group">
                  <InputGroupAddon><LockKeyholeIcon aria-hidden="true" /></InputGroupAddon>
                  <InputGroupInput id="confirm" name="confirm" type={show ? "text" : "password"} autoComplete="new-password" required disabled={saving} aria-invalid={!!errors.confirm || undefined} />
                </InputGroup>
                {errors.confirm && <FieldError>{errors.confirm}</FieldError>}
              </Field>
              {errors.form && <Alert variant="destructive"><AlertDescription>{errors.form}</AlertDescription></Alert>}
            </FieldGroup>
            <Button type="submit" className="signin-button" disabled={saving} aria-busy={saving}>{saving && <Spinner data-icon="inline-start" />}{saving ? "Saving…" : "Set new password"}</Button>
          </form>}
          {stage !== "done" && <a href={signInHref} className="signin-back"><ArrowLeftIcon className="size-4" aria-hidden="true" />Back to sign in</a>}
        </CardContent>
      </Card>
    </LoginShell>
  );
}
