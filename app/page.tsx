"use client";

import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { LoginContours } from "@/components/login-artwork";
import { UbecLogo } from "@/components/ubec-logo";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export default function Home() {
  const [isSigningIn, setIsSigningIn] = useState(false);

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
      <section className="brand-panel" aria-label="UBEC Grant Portal introduction">
        <div className="login-classroom" aria-hidden="true" />
        <div className="brand-content">
          <a className="wordmark" href="#top" aria-label="UBEC Grant Portal home">
            <UbecLogo size={64} />
            <span>UBEC Grant Portal</span>
          </a>
          <p className="copyright">Copyright © 2026 Universal Basic Education Commission. All rights reserved</p>
        </div>
      </section>

      <section className="signin-panel" id="top" aria-labelledby="sign-in-title">
        <LoginContours />
        <div className="signin-card">
          <div className="portal-brand login-mobile-brand"><UbecLogo /><span><strong>Grant Portal</strong><small>Yobe State SUBEB</small></span></div>
          <header className="signin-heading">
            <h1 id="sign-in-title">Welcome back</h1>
            <p>Sign in to your UBEC workspace.</p>
          </header>
          <form onSubmit={handleSubmit}>
            <FieldGroup className="gap-5">
              <Field data-disabled={isSigningIn}>
                <FieldLabel htmlFor="email">Work email</FieldLabel>
                <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required className="form-input" disabled={isSigningIn} />
              </Field>
              <Field data-disabled={isSigningIn}>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input id="password" name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required className="form-input" disabled={isSigningIn} />
              </Field>
            </FieldGroup>
            <Button type="submit" className="signin-button" disabled={isSigningIn} aria-busy={isSigningIn}>{isSigningIn && <Spinner data-icon="inline-start" />} {isSigningIn ? "Signing in…" : "Sign In"}</Button>
          </form>
        </div>
      </section>
    </main>
  );
}
