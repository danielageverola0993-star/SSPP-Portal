"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import campusBuilding from "../../assets/acdbuilding.jpg";
import collegeLogo from "../../assets/acdlogo.jpg";
import { auth, db, isFirebaseConfigured } from "../../lib/firebase";

function signupErrorMessage(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === "auth/email-already-in-use") return "Naa nay account nga naggamit ani nga email.";
  if (code === "auth/weak-password") return "Himo og mas lig-on nga password nga adunay labing menos 6 ka karakter.";
  if (code === "auth/invalid-email") return "Susiha ang format sa imong email address.";
  if (code === "auth/operation-not-allowed") return "Wala pa ma-enable ang Email/Password sign-in sa Firebase Console.";
  return "Wala nahimo ang account. Susiha ang koneksyon ug sulayi pag-usab.";
}

export default function SignupPage() {
  const router = useRouter();
  const authActionInProgress = useRef(false);
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (user) => {
      if (user && !authActionInProgress.current) router.replace("/dashboard");
    });
  }, [router]);

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!auth || !db) {
      setMessage("Kulang o wala pa ma-fill ang Firebase config sa .env.local.");
      return;
    }
    if (password !== confirmation) {
      setMessage("Dili magkapareho ang password ug confirmation.");
      return;
    }

    setBusy(true);
    authActionInProgress.current = true;
    let accountCreated = false;
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      accountCreated = true;
      if (role === "staff") {
        await setDoc(doc(db, "staff", credential.user.uid), {
          uid: credential.user.uid,
          email: credential.user.email,
          role: "staff",
          createdAt: serverTimestamp(),
        });
        router.replace("/dashboard");
      } else {
        await setDoc(doc(db, "adminRequests", credential.user.uid), {
          uid: credential.user.uid,
          email: credential.user.email,
          role: "admin",
          status: "pending",
          createdAt: serverTimestamp(),
        });
        await signOut(auth);
        setMessage("Na-register ang imong Admin request. Makasulod ka isip Admin human ma-approve sa usa ka Admin.");
      }
    } catch (error) {
      if (accountCreated) {
        await signOut(auth);
        setMessage("Nahimo ang Firebase account pero wala ma-save ang role record sa Firestore. Susiha nga nahimo na ang Firestore database ug na-publish ang firestore.rules.");
      } else {
        setMessage(signupErrorMessage(error));
      }
    } finally {
      authActionInProgress.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="login-page signup-page">
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
          <div className="login-card signup-card">
            <div className="card-heading"><h1>Create Account for SSPP Portal</h1><p>Register with your school email address.</p></div>
            <form className="login-form" onSubmit={handleSignup}>
              <label htmlFor="role">Role</label>
              <div className="select-wrap"><select id="role" value={role} onChange={(event) => setRole(event.target.value as "staff" | "admin")}><option value="staff">Staff</option><option value="admin">Admin</option></select><span className="select-chevron" aria-hidden="true">▾</span></div>

              <label htmlFor="identity">Email</label>
              <div className="input-wrap"><span className="field-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" /></svg></span><input id="identity" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter your college email" autoComplete="email" required /></div>

              <label htmlFor="password">Password</label>
              <div className="input-wrap"><span className="field-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg></span><input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Create a password" autoComplete="new-password" minLength={6} required /><button className="password-toggle" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}><svg viewBox="0 0 24 24"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg></button></div>

              <label htmlFor="confirmPassword">Confirm Password</label>
              <div className="input-wrap"><span className="field-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg></span><input id="confirmPassword" type={showConfirmation ? "text" : "password"} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Re-enter your password" autoComplete="new-password" minLength={6} required /><button className="password-toggle" type="button" onClick={() => setShowConfirmation(!showConfirmation)} aria-label={showConfirmation ? "Hide password" : "Show password"}><svg viewBox="0 0 24 24"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg></button></div>

              <label className="terms-checkbox"><input id="terms" type="checkbox" required /> <span>I agree to the <a href="#terms">Terms and Service</a> and <a href="#privacy">Privacy Policy</a></span></label>
              {message && <p className="auth-message" role="status">{message}</p>}
              {!isFirebaseConfigured && <p className="auth-message" role="status">Ibutang una ang Firebase web config sa .env.local.</p>}
              <button className="login-button" type="submit" disabled={busy || !isFirebaseConfigured}>{busy ? "Creating account..." : <>Create Account <span aria-hidden="true">→</span></>}</button>
            </form>
            <div className="support-line"><span>Already have an account?</span> <Link href="/">Sign in here</Link><i /> <a href="#support">Contact IT Support</a></div>
          </div>
        </div>
      </section>
    </main>
  );
}
