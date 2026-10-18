"use client";

import { FormEvent, useState } from "react";
import { ArrowLeftIcon, MailCheckIcon, MailIcon } from "lucide-react";
import { LoginMobileBrand, LoginShell, signInHref } from "@/components/login-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";

/** "Forgot password": asks for the work email and sends a reset link (app/api/auth/password/forgot). */
export default function ForgotPasswordPage() {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ email: string; emailReady: boolean } | null>(null);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    setSending(true); setError("");
    try {
      const response = await fetch("/api/auth/password/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const result = await response.json().catch(() => ({})) as { error?: string; emailReady?: boolean };
      if (!response.ok) { setError(result.error ?? "The request could not be completed. Please try again."); return; }
      setSent({ email, emailReady: result.emailReady !== false });
    } catch {
      setError("Unable to reach the portal. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <LoginShell labelledBy="forgot-title">
      <Card className="signin-card">
        <CardHeader className="signin-heading">
          <LoginMobileBrand />
          <CardTitle id="forgot-title">Forgot your password?</CardTitle>
          {!sent && <p className="signin-intro">Enter your work email. We will send you a link to choose a new password.</p>}
        </CardHeader>
        <CardContent>
          {sent ? <div className="flex flex-col gap-4">
            {sent.emailReady
              ? <Alert><MailCheckIcon /><AlertTitle>Check your email</AlertTitle><AlertDescription>If an account uses {sent.email}, a link to reset its password is on its way. It works once and expires in an hour.</AlertDescription></Alert>
              : <Alert><MailIcon /><AlertTitle>Email is not set up yet</AlertTitle><AlertDescription>The portal cannot send email yet. Ask your Executive Chairman or the UBEC administrator to reset your password.</AlertDescription></Alert>}
            <Button type="button" variant="outline" onClick={() => setSent(null)}>Use a different email</Button>
          </div>
          : <form onSubmit={submit} noValidate={false}>
            <FieldGroup className="gap-5">
              <Field data-disabled={sending} data-invalid={!!error || undefined}>
                <FieldLabel htmlFor="email">Work email</FieldLabel>
                <InputGroup className="form-input-group">
                  <InputGroupAddon><MailIcon aria-hidden="true" /></InputGroupAddon>
                  <InputGroupInput id="email" name="email" type="email" autoComplete="email" placeholder="name@ubec.gov.ng" required disabled={sending} aria-invalid={!!error || undefined} />
                </InputGroup>
                {error && <FieldError>{error}</FieldError>}
              </Field>
            </FieldGroup>
            <Button type="submit" className="signin-button" disabled={sending} aria-busy={sending}>{sending && <Spinner data-icon="inline-start" />}{sending ? "Sending…" : "Send reset link"}</Button>
          </form>}
          <a href={signInHref} className="signin-back"><ArrowLeftIcon className="size-4" aria-hidden="true" />Back to sign in</a>
        </CardContent>
      </Card>
    </LoginShell>
  );
}
