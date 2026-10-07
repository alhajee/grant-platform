"use client";

import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { ExternalLinkIcon, EyeIcon, EyeOffIcon, LockKeyholeIcon, MailIcon } from "lucide-react";
import { LoginContours } from "@/components/login-artwork";
import { LoginPhotos } from "@/components/login-photos";
import { UbecLogo } from "@/components/ubec-logo";
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
        toast.error(payload.error ?? "Unable to sign in.");
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
    <main className="login-page">
      <section className="login-hero" aria-labelledby="beapms-title">
        <LoginPhotos />
        <div className="login-hero-sheen" aria-hidden="true" />
        <div className="login-hero-inner">
          <a className="login-agency" href="https://ubec.gov.ng" target="_blank" rel="noopener noreferrer" aria-label="Visit the UBEC website (opens in a new tab)">
            <UbecLogo size={58} />
            <span><strong>Universal Basic Education Commission</strong><small>Federal Republic of Nigeria</small></span>
            <ExternalLinkIcon className="login-agency-link-icon" aria-hidden="true" />
          </a>
          <div className="login-hero-copy">
            <h1 id="beapms-title">Basic Education Action Plan <span>Management System</span> <small>(BEAPMS)</small></h1>
            <p>Supporting UBEC and SUBEBs to strengthen financial allocation and management in the basic education sector.</p>
          </div>
          <div className="login-hero-footer" aria-hidden="true" />
        </div>
      </section>

      <section className="signin-panel" id="top" aria-labelledby="sign-in-title">
        <LoginContours />
        <div className="login-ambient login-ambient-one" aria-hidden="true" />
        <div className="login-ambient login-ambient-two" aria-hidden="true" />
        <Card className="signin-card">
          <CardHeader className="signin-heading">
            <div className="login-mobile-brand"><UbecLogo size={46}/><span><strong>BEAPMS Portal</strong><small>Universal Basic Education Commission</small></span></div>
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
                  <FieldLabel htmlFor="password">Password</FieldLabel>
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
        <p className="login-copyright">© 2026 Universal Basic Education Commission</p>
      </section>
    </main>
  );
}
