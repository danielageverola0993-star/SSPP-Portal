"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import campusBuilding from "../assets/acdbuilding.jpg";
import collegeLogo from "../assets/acdlogo.jpg";
import { auth, db, isFirebaseConfigured } from "../lib/firebase";

function authErrorMessage(error: unknown) {
  const code = (error as { code?: string })?.code;

  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Dili sakto ang email o password. Palihog sulayi pag-usab.";
  }
  if (code === "auth/too-many-requests") {
    return "Daghan na kaayong pagsulay. Pahuway sa kadiyot unya sulayi pag-usab.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Wala pa ma-enable ang Email/Password sign-in sa Firebase Console.";
  }
  if (code === "permission-denied") {
    return "Naka-login ang account pero gi-block sa Firestore. I-publish ang firestore.rules ug siguroa nga naa ang staff/{uid} o admins/{uid} profile.";
  }
  if (code === "unavailable") {
    return "Dili maabot ang Firestore. Susiha kung nahimo na ang database ug naa kay internet connection.";
  }
  return "Wala naka-sign in. Susiha ang koneksyon ug sulayi pag-usab.";
}

export default function Home() {
  const router = useRouter();
  const authActionInProgress = useRef(false);
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (user) => {
      if (user && !authActionInProgress.current) router.replace("/dashboard");
    });
  }, [router]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!auth || !db) {
      setMessage("Kulang o wala pa ma-fill ang Firebase config sa .env.local.");
      return;
    }

    setBusy(true);
    authActionInProgress.current = true;
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const profile = await getDoc(doc(db, role === "admin" ? "admins" : "staff", credential.user.uid));
      if (!profile.exists()) {
        const request = role === "admin"
          ? await getDoc(doc(db, "adminRequests", credential.user.uid))
          : null;
        await signOut(auth);
        if (role === "admin") {
          if (request?.exists() && request.data().status === "pending") {
            setMessage("Pending pa ang imong Admin request. Kinahanglan i-approve sa usa ka Admin.");
            return;
          }
          if (request?.exists() && request.data().status === "rejected") {
            setMessage("Gi-reject ang imong Admin request. Kontaka ang portal administrator kung kinahanglan nimo og access.");
            return;
          }
        }
        setMessage(`Walay ${role === "admin" ? "Admin" : "Staff"} profile para ani nga account. Susiha ang gipiling role o kontaka ang portal administrator.`);
        return;
      }
      router.replace("/dashboard");
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if ((code === "permission-denied" || code === "unavailable") && auth.currentUser) {
        await signOut(auth);
      }
      setMessage(authErrorMessage(error));
    } finally {
      authActionInProgress.current = false;
      setBusy(false);
    }
  }

  async function handlePasswordReset() {
    setMessage("");
    if (!auth) {
      setMessage("Kulang o wala pa ma-fill ang Firebase config sa .env.local.");
      return;
    }
    if (!email.trim()) {
      setMessage("Ibutang una ang imong email para makapadala mi og reset link.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage("Naipadala na ang password reset link sa imong email.");
    } catch (error) {
      setMessage(authErrorMessage(error));
    }
  }

  return (
    <main className="login-page">
      <section
        className="campus-panel"
        aria-label="Assumption College campus"
        style={{ backgroundImage: `linear-gradient(180deg, rgba(16,76,98,.03) 38%, rgba(11,37,43,.45)), url(${campusBuilding.src})` }}
      >
        <div className="campus-wash" />
        <div className="campus-caption"><span>ASSUMPTION COLLEGE OF DAVAO</span><strong>Faith. Solidarity. Service.</strong></div>
      </section>
      <section className="login-panel">
        <div className="login-inner">
          <Image className="college-mark" src={collegeLogo} alt="Assumption College of Davao logo" priority />
          <div className="login-card">
            <div className="card-heading"><span className="eyebrow">WELCOME BACK</span><h1>Login to SSPP Portal</h1><p>Access your school account securely.</p></div>
            <form className="login-form" onSubmit={handleSignIn}>
              <label htmlFor="role">Role</label>
              <div className="select-wrap"><select id="role" value={role} onChange={(event) => setRole(event.target.value as "staff" | "admin")}><option value="staff">Staff</option><option value="admin">Admin</option></select><span className="select-chevron" aria-hidden="true">▾</span></div>

              <label htmlFor="identity">Email</label>
              <div className="input-wrap"><span className="field-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" /></svg></span><input id="identity" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter your college email" autoComplete="username" required /></div>

              <div className="password-label"><label htmlFor="password">Password</label><button className="text-button" type="button" onClick={handlePasswordReset}>Forgot Password?</button></div>
              <div className="input-wrap"><span className="field-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg></span><input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" required /><button className="password-toggle" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}><svg viewBox="0 0 24 24"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg></button></div>

              {message && <p className="auth-message" role="status">{message}</p>}
              {!isFirebaseConfigured && <p className="auth-message" role="status">Ibutang una ang Firebase web config sa .env.local.</p>}
              <button className="login-button" type="submit" disabled={busy || !isFirebaseConfigured}>{busy ? "Signing in..." : <>Sign In <span aria-hidden="true">→</span></>}</button>
            </form>
            <div className="support-line"><span>Need help?</span> <a href="#support">Contact IT Support</a><i /> <span>New user?</span> <Link href="/signup">Sign up</Link></div>
          </div>
          <p className="copyright">&copy; 2025 Assumption College of Davao</p>
        </div>
      </section>
    </main>
  );
}
