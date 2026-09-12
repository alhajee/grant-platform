"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="google-mark" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M21.8 12.23c0-.72-.06-1.42-.19-2.09H12v3.96h5.49a4.69 4.69 0 0 1-2.03 3.08v2.57h3.31c1.94-1.79 3.03-4.42 3.03-7.52Z" />
      <path fill="#34A853" d="M12 22c2.75 0 5.05-.91 6.77-2.25l-3.31-2.57c-.92.62-2.09.98-3.46.98-2.66 0-4.92-1.8-5.73-4.21H2.85v2.65A10.23 10.23 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.27 13.95a6.14 6.14 0 0 1 0-3.9V7.4H2.85a10.1 10.1 0 0 0 0 9.2l3.42-2.65Z" />
      <path fill="#EA4335" d="M12 5.84c1.49 0 2.83.51 3.88 1.51l2.91-2.91C17.05 2.81 14.75 2 12 2a10.23 10.23 0 0 0-9.15 5.4l3.42 2.65C7.08 7.64 9.34 5.84 12 5.84Z" />
    </svg>
  );
}

export default function Home() {
  const [notice, setNotice] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("Sign-in details submitted.");
  }

  return (
    <main className="login-page">
      <section className="brand-panel" aria-label="Uigeek introduction">
        <div className="honeycomb honeycomb-left" aria-hidden="true" />
        <div className="honeycomb honeycomb-bottom" aria-hidden="true" />
        <div className="brand-content">
          <a className="wordmark" href="#top" aria-label="Uigeek home">
            <span className="wordmark-symbol" aria-hidden="true" />
            <span>igeek</span>
          </a>
          <div className="brand-copy">
            <h1>The platform where businesses buy from and sell to other businesses.</h1>
            <p>The trusted choice of the world’s most innovative companies,</p>
          </div>
          <p className="copyright">Copyright © 2026 Uigeek Holdings, Inc. All rights reserved</p>
        </div>
      </section>

      <section className="signin-panel" id="top" aria-labelledby="sign-in-title">
        <div className="contour contour-one" aria-hidden="true" />
        <div className="contour contour-two" aria-hidden="true" />
        <div className="signin-card">
          <header className="signin-heading">
            <h2 id="sign-in-title">Welcome back!</h2>
            <p>Sign in to your account to continue</p>
          </header>
          <Button type="button" variant="outline" className="google-button" onClick={() => setNotice("Google sign-in is ready to connect.")}>
            <GoogleMark />
            Continue with Google
          </Button>
          <div className="divider"><span>or</span></div>
          <form onSubmit={handleSubmit}>
            <div className="field-group">
              <label htmlFor="email">Email Address</label>
              <Input id="email" type="email" autoComplete="email" placeholder="your email address" required className="form-input" />
            </div>
            <div className="field-group">
              <label htmlFor="password">Password</label>
              <Input id="password" type="password" autoComplete="current-password" placeholder="your password" required className="form-input" />
            </div>
            <Button type="submit" className="signin-button">Sign In</Button>
          </form>
          <p className="signup-copy">Don&apos;t have an account? <a href="#signup">Sign up</a></p>
          {notice && <p className="form-notice" role="status">{notice}</p>}
        </div>
      </section>
    </main>
  );
}
