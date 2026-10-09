"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "../../lib/firebase";

type Role = "staff" | "admin";
type BookingStatus = "pending" | "approved" | "rejected";
type Booking = {
  id: string;
  staffUid: string;
  customerName: string;
  contactNumber: string;
  bookingDate: Timestamp;
  purpose: string;
  venue?: string;
  notes?: string;
  status: BookingStatus;
  createdAt: Timestamp;
};
type AdminRequest = {
  uid: string;
  email: string;
  role: "admin";
  status: "pending" | "approved" | "rejected";
  createdAt: Timestamp;
};

function formatDate(value?: Timestamp) {
  return value?.toDate().toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }) ?? "—";
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [adminRequests, setAdminRequests] = useState<AdminRequest[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [savingBooking, setSavingBooking] = useState(false);
  const [reviewingId, setReviewingId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!auth || !db) {
      router.replace("/");
      return;
    }

    return onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace("/");
        return;
      }
      try {
        const adminProfile = await getDoc(doc(db, "admins", currentUser.uid));
        if (adminProfile.exists()) {
          setRole("admin");
          setUser(currentUser);
          setCheckingSession(false);
          return;
        }

        const staffProfile = await getDoc(doc(db, "staff", currentUser.uid));
        if (staffProfile.exists()) {
          setRole("staff");
          setUser(currentUser);
          setCheckingSession(false);
          return;
        }

        await signOut(auth);
        router.replace("/");
      } catch {
        await signOut(auth);
        router.replace("/");
      }
    });
  }, [router]);

  const loadBookings = useCallback(async () => {
    if (!db || !user || !role) return;
    setLoadingBookings(true);
    setMessage("");
    try {
      const bookingsRef = collection(db, "bookings");
      let result;
      if (role === "admin") {
        const [bookingSnapshot, requestSnapshot] = await Promise.all([
          getDocs(bookingsRef),
          getDocs(collection(db, "adminRequests")),
        ]);
        result = bookingSnapshot;
        setAdminRequests(requestSnapshot.docs.map((requestDoc) => ({
          ...requestDoc.data(),
        })) as AdminRequest[]);
      } else {
        result = await getDocs(query(bookingsRef, where("staffUid", "==", user.uid)));
        setAdminRequests([]);
      }
      const rows = result.docs.map((bookingDoc) => ({
        id: bookingDoc.id,
        ...bookingDoc.data(),
      })) as Booking[];
      rows.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
      setBookings(rows);
    } catch {
      setMessage("Dili makuha ang bookings. Susiha nga na-publish ang Firestore rules.");
    } finally {
      setLoadingBookings(false);
    }
  }, [role, user]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  async function handleCreateBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !user || role !== "staff") return;

    const form = event.currentTarget;
    const values = new FormData(form);
    const bookingDate = new Date(String(values.get("bookingDate")));
    if (Number.isNaN(bookingDate.getTime())) {
      setMessage("Palihog pagpili og valid nga booking date ug time.");
      return;
    }

    setSavingBooking(true);
    setMessage("");
    try {
      await addDoc(collection(db, "bookings"), {
        staffUid: user.uid,
        customerName: String(values.get("customerName")).trim(),
        contactNumber: String(values.get("contactNumber")).trim(),
        bookingDate: Timestamp.fromDate(bookingDate),
        purpose: String(values.get("purpose")).trim(),
        venue: String(values.get("venue")).trim(),
        notes: String(values.get("notes")).trim(),
        status: "pending",
        createdAt: serverTimestamp(),
      });
      form.reset();
      setMessage("Naipasa na ang booking. Hulata ang approval sa Admin.");
      await loadBookings();
    } catch {
      setMessage("Wala naipasa ang booking. Susiha nga na-create ang Firestore database ug na-publish ang firestore.rules.");
    } finally {
      setSavingBooking(false);
    }
  }

  async function handleReview(booking: Booking, status: Exclude<BookingStatus, "pending">) {
    if (!db || !user || role !== "admin") return;
    setReviewingId(`booking:${booking.id}`);
    setMessage("");
    try {
      await updateDoc(doc(db, "bookings", booking.id), {
        status,
        reviewedBy: user.uid,
        reviewedAt: serverTimestamp(),
        reviewNote: "",
      });
      await loadBookings();
    } catch {
      setMessage("Wala ma-update ang booking status. Susiha ang Firestore rules ug Admin profile.");
    } finally {
      setReviewingId("");
    }
  }

  async function handleAdminRequest(request: AdminRequest, approve: boolean) {
    if (!db || !user || role !== "admin") return;
    setReviewingId(`request:${request.uid}`);
    setMessage("");
    try {
      const batch = writeBatch(db);
      const nextStatus = approve ? "approved" : "rejected";
      if (approve) {
        batch.set(doc(db, "admins", request.uid), {
          uid: request.uid,
          email: request.email,
          role: "admin",
          createdAt: serverTimestamp(),
        });
      }
      batch.update(doc(db, "adminRequests", request.uid), {
        status: nextStatus,
        reviewedBy: user.uid,
        reviewedAt: serverTimestamp(),
      });
      await batch.commit();
      await loadBookings();
    } catch {
      setMessage("Wala ma-update ang Admin request. Susiha nga Admin gyud ang imong Firestore profile ug updated ang rules.");
    } finally {
      setReviewingId("");
    }
  }

  async function handleSignOut() {
    if (!auth) return;
    setSigningOut(true);
    try {
      await signOut(auth);
      router.replace("/");
    } finally {
      setSigningOut(false);
    }
  }

  if (checkingSession || !user || !role) {
    return <main className="dashboard-loading" aria-live="polite">Checking your sign-in...</main>;
  }

  return (
    <main className="dashboard-page">
      <div className="dashboard-shell">
        <header className="dashboard-header">
          <div><span className="dashboard-eyebrow">ASSUMPTION COLLEGE OF DAVAO</span><h1>{role === "admin" ? "Admin Dashboard" : "Staff Dashboard"}</h1></div>
          <div className="dashboard-account"><span title={user.email ?? "Signed-in user"}>{user.email}</span><button type="button" onClick={handleSignOut} disabled={signingOut}>{signingOut ? "Signing out..." : "Sign out"}</button></div>
        </header>

        {message && <p className="dashboard-message" role="status">{message}</p>}

        {role === "staff" ? (
          <div className="dashboard-content">
            <section className="booking-panel" aria-labelledby="new-booking-title">
              <div className="booking-section-heading"><div><p className="dashboard-eyebrow">STAFF</p><h2 id="new-booking-title">Submit a booking</h2></div></div>
              <form className="booking-form" onSubmit={handleCreateBooking}>
                <label>Customer name<input name="customerName" autoComplete="name" required /></label>
                <label>Contact number<input name="contactNumber" type="tel" autoComplete="tel" required /></label>
                <label>Booking date and time<input name="bookingDate" type="datetime-local" required /></label>
                <label>Purpose<input name="purpose" required /></label>
                <label>Venue <span>(optional)</span><input name="venue" /></label>
                <label className="booking-notes">Notes <span>(optional)</span><textarea name="notes" rows={3} /></label>
                <button className="booking-submit" type="submit" disabled={savingBooking}>{savingBooking ? "Submitting..." : "Submit for approval"}</button>
              </form>
            </section>

            <section className="booking-list-panel" aria-labelledby="staff-bookings-title">
              <div className="booking-section-heading"><div><p className="dashboard-eyebrow">YOUR REQUESTS</p><h2 id="staff-bookings-title">My bookings</h2></div><button className="refresh-button" type="button" onClick={() => void loadBookings()} disabled={loadingBookings}>{loadingBookings ? "Loading..." : "Refresh"}</button></div>
              {loadingBookings && bookings.length === 0 ? <p className="booking-empty">Loading bookings...</p> : bookings.length === 0 ? <p className="booking-empty">Wala pa kay na-submit nga booking.</p> : (
                <div className="booking-cards">{bookings.map((booking) => <article className="booking-card" key={booking.id}>
                  <div className="booking-card-top"><h3>{booking.customerName}</h3><span className={`booking-status status-${booking.status}`}>{booking.status}</span></div>
                  <p>{booking.purpose}{booking.venue ? ` · ${booking.venue}` : ""}</p>
                  <p className="booking-meta">{formatDate(booking.bookingDate)} · {booking.contactNumber}</p>
                </article>)}</div>
              )}
            </section>
          </div>
        ) : (
          <>
            <section className="booking-list-panel admin-bookings" aria-labelledby="admin-requests-title">
              <div className="booking-section-heading"><div><p className="dashboard-eyebrow">ACCOUNT ACCESS</p><h2 id="admin-requests-title">Admin signup requests</h2></div><button className="refresh-button" type="button" onClick={() => void loadBookings()} disabled={loadingBookings}>{loadingBookings ? "Loading..." : "Refresh"}</button></div>
              {adminRequests.filter((request) => request.status === "pending").length === 0 ? <p className="booking-empty">Walay pending Admin signup requests.</p> : (
                <div className="booking-cards">{adminRequests.filter((request) => request.status === "pending").map((request) => <article className="booking-card" key={request.uid}>
                  <div className="booking-card-top"><h3>{request.email}</h3><span className="booking-status status-pending">pending</span></div>
                  <p className="booking-meta">Requested {formatDate(request.createdAt)}</p>
                  <div className="booking-actions"><button type="button" className="approve-button" onClick={() => void handleAdminRequest(request, true)} disabled={reviewingId === `request:${request.uid}`}>{reviewingId === `request:${request.uid}` ? "Saving..." : "Approve Admin"}</button><button type="button" className="reject-button" onClick={() => void handleAdminRequest(request, false)} disabled={reviewingId === `request:${request.uid}`}>Reject</button></div>
                </article>)}</div>
              )}
            </section>

            <section className="booking-list-panel admin-bookings" aria-labelledby="admin-bookings-title">
              <div className="booking-section-heading"><div><p className="dashboard-eyebrow">REVIEW QUEUE</p><h2 id="admin-bookings-title">Booking requests</h2></div><button className="refresh-button" type="button" onClick={() => void loadBookings()} disabled={loadingBookings}>{loadingBookings ? "Loading..." : "Refresh"}</button></div>
              {loadingBookings && bookings.length === 0 ? <p className="booking-empty">Loading bookings...</p> : bookings.length === 0 ? <p className="booking-empty">Walay booking requests karon.</p> : (
                <div className="booking-cards">{bookings.map((booking) => <article className="booking-card" key={booking.id}>
                  <div className="booking-card-top"><h3>{booking.customerName}</h3><span className={`booking-status status-${booking.status}`}>{booking.status}</span></div>
                  <p>{booking.purpose}{booking.venue ? ` · ${booking.venue}` : ""}</p>
                  <p className="booking-meta">{formatDate(booking.bookingDate)} · {booking.contactNumber}</p>
                  {booking.notes && <p className="booking-notes-text">{booking.notes}</p>}
                  <p className="booking-meta">Submitted by staff account {booking.staffUid}</p>
                  {booking.status === "pending" && <div className="booking-actions"><button type="button" className="approve-button" onClick={() => void handleReview(booking, "approved")} disabled={reviewingId === `booking:${booking.id}`}>{reviewingId === `booking:${booking.id}` ? "Saving..." : "Approve"}</button><button type="button" className="reject-button" onClick={() => void handleReview(booking, "rejected")} disabled={reviewingId === `booking:${booking.id}`}>{reviewingId === `booking:${booking.id}` ? "Saving..." : "Reject"}</button></div>}
                </article>)}</div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
