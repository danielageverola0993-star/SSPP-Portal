"use client";

import { useState } from "react";
import Image from "next/image";
import campusBuilding from "../assets/acdbuilding.jpg";
import collegeLogo from "../assets/acdlogo.jpg";

export default function Home() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="login-page">
      <section className="campus-panel" aria-label="Assumption College campus" style={{ backgroundImage: `linear-gradient(180deg, rgba(16,76,98,.03) 38%, rgba(11,37,43,.45)), url(${campusBuilding.src})` }}>
        <div className="campus-wash" />
        <div className="campus-caption"><span>ASSUMPTION COLLEGE OF DAVAO</span><strong>Faith. Solidarity. Service.</strong></div>
      </section>
      <section className="login-panel">
        <div className="login-inner">
          <Image className="college-mark" src={collegeLogo} alt="Assumption College of Davao logo" priority />
          <div className="login-card">
            <div className="card-heading"><span className="eyebrow">WELCOME BACK</span><h1>Login to SSPP Portal</h1><p>Access your school account securely.</p></div>
            <form className="login-form" onSubmit={(event) => event.preventDefault()}>
              <label htmlFor="role">Role</label>
              <div className="select-wrap"><select id="role" defaultValue="" required><option value="" disabled>Log in as...</option><option value="staff">Staff</option><option value="admin">Admin</option></select><span className="select-chevron">▼</span></div>

              <label htmlFor="identity">Username / Email</label>
              <div className="input-wrap"><span className="field-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" /></svg></span><input id="identity" type="text" placeholder="Enter your username or college email" autoComplete="username" required /></div>

              <div className="password-label"><label htmlFor="password">Password</label><a href="#forgot">Forgot Password?</a></div>
              <div className="input-wrap"><span className="field-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg></span><input id="password" type={showPassword ? "text" : "password"} placeholder="Enter your password" autoComplete="current-password" required /><button className="password-toggle" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}><svg viewBox="0 0 24 24"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg></button></div>

              <button className="login-button" type="submit">Login <span aria-hidden="true">→</span></button>
            </form>
            <div className="support-line"><span>Need help?</span> <a href="#support">Contact IT Support</a><i /> <span>New user?</span> <a href="/signup">Sign up</a></div>
          </div>
          <p className="copyright">&copy; 2025 Assumption College of Davao</p>
        </div>
      </section>
    </main>
  );
}
