"use client";

import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { EyeIcon, EyeOffIcon, LockKeyholeIcon, MailIcon } from "lucide-react";
import { LoginMobileBrand, LoginShell } from "@/components/login-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";

export default function Home() {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      const data = new FormData(event.currentTarget);
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) });
      const payload = await response.json() as { error?: string; destination?: string };
      if (!response.ok) {
        toast.error(payload.error ?? "Unable to sign in");
        return;
      }
      window.location.assign(payload.destination === '/admin' ? '/admin' : payload.destination === '/ubec' ? '/ubec' : '/dashboard');
    } catch {
      toast.error("Unable to reach the sign-in service. Please try again.");
    } finally {
      setIsSigningIn(false);
    }
  }

  return (
    <LoginShell labelledBy="sign-in-title">
      <Card className="signin-card">
        <CardHeader className="signin-heading">
          <LoginMobileBrand />
          <CardTitle id="sign-in-title">Welcome back</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup className="gap-5">
              <Field data-disabled={isSigningIn}>
                <FieldLabel htmlFor="email">Work email</FieldLabel>
                <InputGroup className="form-input-group">
                  <InputGroupAddon><MailIcon aria-hidden="true"/></InputGroupAddon>
                  <InputGroupInput id="email" name="email" type="email" autoComplete="email" placeholder="name@ubec.gov.ng" required disabled={isSigningIn} />
                </InputGroup>
              </Field>
              <Field data-disabled={isSigningIn}>
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <a href="/forgot-password" className="signin-forgot">Forgot password?</a>
                </div>
                <InputGroup className="form-input-group">
                  <InputGroupAddon><LockKeyholeIcon aria-hidden="true"/></InputGroupAddon>
                  <InputGroupInput id="password" name="password" type={showPassword?"text":"password"} autoComplete="current-password" placeholder="Enter your password" required disabled={isSigningIn} />
                  <InputGroupAddon align="inline-end"><InputGroupButton size="icon-xs" aria-label={showPassword?"Hide password":"Show password"} aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)}>{showPassword?<EyeOffIcon/>:<EyeIcon/>}</InputGroupButton></InputGroupAddon>
                </InputGroup>
              </Field>
            </FieldGroup>
            <Button type="submit" className="signin-button" disabled={isSigningIn} aria-busy={isSigningIn}>{isSigningIn && <Spinner data-icon="inline-start" />} {isSigningIn ? "Signing in…" : "Sign in to BEAPMS"}</Button>
          </form>
        </CardContent>
      </Card>
    </LoginShell>
  );
}
