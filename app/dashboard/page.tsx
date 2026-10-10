"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { auth, db } from "../../lib/firebase";
import collegeLogo from "../../assets/acdlogo.jpg";

type Role = "staff" | "admin";
type BookingStatus = "pending" | "approved" | "rejected";
type Booking = {
  id: string;
  staffUid: string;
  staffEmail?: string;
  requestType?: "facility" | "vehicle";
  resourceName?: string;
  startDateTime?: Timestamp;
  endDateTime?: Timestamp;
  customerName?: string;
  contactNumber?: string;
  bookingDate?: Timestamp;
  purpose: string;
  venue?: string;
  notes?: string;
  status: BookingStatus;
  createdAt?: Timestamp | null;
};
type AdminRequest = {
  uid: string;
  email: string;
  role: "admin";
  status: "pending" | "approved" | "rejected";
  createdAt?: Timestamp | null;
};

const CALENDAR_FALLBACK_MONTH = new Date(2000, 0, 1);

function formatDate(value?: Timestamp | null) {
  return value?.toDate().toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }) ?? "—";
}

function bookingStart(booking: Booking) {
  return booking.startDateTime ?? booking.bookingDate;
}

function calendarDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function bookingIncludesDate(booking: Booking, dateKey: string) {
  const start = bookingStart(booking)?.toDate();
  if (!start) return false;
  const end = booking.endDateTime?.toDate() ?? start;
  return dateKey >= calendarDateKey(start) && dateKey <= calendarDateKey(end);
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
  const [activeStaffNav, setActiveStaffNav] = useState("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [calendarMonth, setCalendarMonth] = useState<Date | null>(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState("");
  const [todayCalendarDate, setTodayCalendarDate] = useState("");
  const [requestType, setRequestType] = useState<"facility" | "vehicle">("facility");
  const [startDateTime, setStartDateTime] = useState("");
  const pendingBookings = bookings.filter((booking) => booking.status === "pending");
  const approvedBookings = bookings
    .filter((booking) => booking.status === "approved")
    .sort((first, second) => (bookingStart(first)?.toMillis() ?? 0) - (bookingStart(second)?.toMillis() ?? 0));
  const visibleCalendarMonth = calendarMonth ?? CALENDAR_FALLBACK_MONTH;
  const calendarOffset = new Date(visibleCalendarMonth.getFullYear(), visibleCalendarMonth.getMonth(), 1).getDay();
  const calendarGridStart = new Date(visibleCalendarMonth.getFullYear(), visibleCalendarMonth.getMonth(), 1 - calendarOffset);
  const calendarDays = Array.from({ length: 42 }, (_, index) => new Date(calendarGridStart.getFullYear(), calendarGridStart.getMonth(), calendarGridStart.getDate() + index));
  const selectedDayBookings = approvedBookings.filter((booking) => bookingIncludesDate(booking, selectedCalendarDate));

  useEffect(() => {
    const today = new Date();
    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedCalendarDate(calendarDateKey(today));
    setTodayCalendarDate(calendarDateKey(today));
  }, []);

  useEffect(() => {
    const firebaseAuth = auth;
    const firestore = db;
    if (!firebaseAuth || !firestore) {
      router.replace("/");
      return;
    }

    return onAuthStateChanged(firebaseAuth, async (currentUser) => {
      if (!currentUser) {
        router.replace("/");
        return;
      }
      try {
        const adminProfile = await getDoc(doc(firestore, "admins", currentUser.uid));
        if (adminProfile.exists()) {
          setRole("admin");
          setUser(currentUser);
          setCheckingSession(false);
          return;
        }

        const staffProfile = await getDoc(doc(firestore, "staff", currentUser.uid));
        if (staffProfile.exists()) {
          setRole("staff");
          setUser(currentUser);
          setCheckingSession(false);
          return;
        }

        await signOut(firebaseAuth);
        router.replace("/");
      } catch {
        await signOut(firebaseAuth);
        router.replace("/");
      }
    });
  }, [router]);

  const loadBookings = useCallback(async () => {
    if (!db || !user || role !== "admin") return;
    setLoadingBookings(true);
    setMessage("");
    try {
      const bookingsRef = collection(db, "bookings");
      const [bookingSnapshot, requestSnapshot] = await Promise.all([
        getDocs(bookingsRef),
        getDocs(collection(db, "adminRequests")),
      ]);
      setAdminRequests(requestSnapshot.docs.map((requestDoc) => ({
        ...requestDoc.data(),
      })) as AdminRequest[]);
      const rows = bookingSnapshot.docs.map((bookingDoc) => ({
        id: bookingDoc.id,
        ...bookingDoc.data(),
      })) as Booking[];
      rows.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
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

  useEffect(() => {
    if (role !== "staff" || !db || !user) return;
    setLoadingBookings(true);
    const staffBookings = query(collection(db, "bookings"), where("staffUid", "==", user.uid));
    return onSnapshot(staffBookings, (snapshot) => {
      const rows = snapshot.docs.map((bookingDoc) => ({
        id: bookingDoc.id,
        ...bookingDoc.data(),
      })) as Booking[];
      rows.sort((first, second) => (second.createdAt?.toMillis() ?? 0) - (first.createdAt?.toMillis() ?? 0));
      setBookings(rows);
      setLoadingBookings(false);
    }, () => {
      setMessage("Dili makuha ang bookings. Susiha nga na-publish ang Firestore rules.");
      setLoadingBookings(false);
    });
  }, [role, user]);

  async function handleCreateBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !user || role !== "staff") return;

    const form = event.currentTarget;
    const values = new FormData(form);
    const selectedType = String(values.get("requestType"));
    const resourceName = String(values.get("resourceName"));
    const start = new Date(String(values.get("startDateTime")));
    const end = new Date(String(values.get("endDateTime")));
    const allowedResources = selectedType === "facility"
      ? ["GYM", "AUDITORIUM", "AVR1", "AVR2"]
      : ["HINO", "HI-ACE", "BUS1", "BUS2", "TRAVIZ"];
    if (!allowedResources.includes(resourceName)) {
      setMessage("Palihog pagpili og valid nga facility o vehicle.");
      return;
    }
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setMessage("Siguroa nga valid ang start ug end date/time, ug mas ulahi ang end kaysa start.");
      return;
    }
    const purpose = String(values.get("purpose")).trim();
    if (!purpose) {
      setMessage("Palihog isulat ang purpose o notes sa request.");
      return;
    }

    setSavingBooking(true);
    setMessage("");
    try {
      await addDoc(collection(db, "bookings"), {
        staffUid: user.uid,
        staffEmail: user.email ?? "",
        requestType: selectedType,
        resourceName,
        startDateTime: Timestamp.fromDate(start),
        endDateTime: Timestamp.fromDate(end),
        purpose,
        notes: purpose,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      form.reset();
      setStartDateTime("");
      setRequestType("facility");
      setMessage("Naipasa na ang booking. Hulata ang approval sa Admin.");
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

  const requestTable = (
    <section className="staff-recent-requests" aria-labelledby="recent-requests-title">
      <div className="staff-table-heading"><h2 id="recent-requests-title">{activeStaffNav === "Dashboard" ? "Recent Request Table" : "Request Status"}</h2><span className="live-update-label">Live updates</span></div>
      <div className="staff-table-scroll">
        <table className="staff-request-table">
          <thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Date</th><th scope="col">Status</th></tr></thead>
          <tbody>
            {bookings.slice(0, 10).map((booking) => (
              <tr key={booking.id}>
                <td>{booking.staffEmail ?? booking.customerName ?? "Staff"}</td><td>{booking.resourceName ?? booking.purpose}</td><td>{formatDate(bookingStart(booking))}</td>
                <td><span className={`booking-status status-${booking.status}`}>{booking.status}</span></td>
              </tr>
            ))}
            {loadingBookings && bookings.length === 0 && <tr><td colSpan={4} className="staff-table-empty">Loading requests...</td></tr>}
            {!loadingBookings && bookings.length === 0 && <tr><td colSpan={4} className="staff-table-empty">Wala pa kay na-submit nga request.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );

  const scheduleView = (
    <section className="staff-schedule-section" aria-labelledby="staff-schedule-title">
      <div className="staff-calendar-header">
        <div><p className="dashboard-eyebrow">APPROVED BOOKINGS</p><h2 id="staff-schedule-title">Calendar/Schedule</h2></div>
        <div className="staff-calendar-controls">
          <button type="button" aria-label="Previous month" onClick={() => setCalendarMonth((month) => { const current = month ?? CALENDAR_FALLBACK_MONTH; return new Date(current.getFullYear(), current.getMonth() - 1, 1); })}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></button>
          <strong>{calendarMonth?.toLocaleDateString("en-PH", { month: "long", year: "numeric" }) ?? "Loading calendar..."}</strong>
          <button type="button" aria-label="Next month" onClick={() => setCalendarMonth((month) => { const current = month ?? CALENDAR_FALLBACK_MONTH; return new Date(current.getFullYear(), current.getMonth() + 1, 1); })}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg></button>
          <button className="calendar-today-button" type="button" onClick={() => { const today = new Date(); setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedCalendarDate(calendarDateKey(today)); setTodayCalendarDate(calendarDateKey(today)); }}>Today</button>
        </div>
      </div>

      <div className="staff-calendar-layout">
        <div className="staff-calendar-grid" aria-label={visibleCalendarMonth.toLocaleDateString("en-PH", { month: "long", year: "numeric" })}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => <div className="staff-calendar-weekday" key={weekday}>{weekday}</div>)}
          {calendarDays.map((date) => {
            const dateKey = calendarDateKey(date);
            const dayBookings = approvedBookings.filter((booking) => bookingIncludesDate(booking, dateKey));
            const isCurrentMonth = date.getMonth() === visibleCalendarMonth.getMonth();
            const isToday = dateKey === todayCalendarDate;
            return <button type="button" aria-pressed={dateKey === selectedCalendarDate} aria-label={`${date.toLocaleDateString("en-PH", { dateStyle: "full" })}${dayBookings.length ? `, ${dayBookings.length} approved booking${dayBookings.length === 1 ? "" : "s"}` : ""}`} className={`staff-calendar-day${isCurrentMonth ? "" : " outside-month"}${dateKey === selectedCalendarDate ? " selected" : ""}${isToday ? " today" : ""}${dayBookings.length ? " has-bookings" : ""}`} key={dateKey} onClick={() => { setSelectedCalendarDate(dateKey); if (!isCurrentMonth) setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1)); }}>
              <span>{date.getDate()}</span>{dayBookings.length > 0 && <i aria-hidden="true">{dayBookings.length}</i>}
            </button>;
          })}
        </div>

        <aside className="staff-calendar-day-panel" aria-live="polite">
          <p className="dashboard-eyebrow">SELECTED DATE</p>
          <h3>{selectedCalendarDate ? new Date(`${selectedCalendarDate}T12:00:00`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" }) : "Select a date"}</h3>
          {selectedDayBookings.length === 0 ? <p className="calendar-no-bookings">Walay approved booking ani nga adlaw.</p> : (
            <div className="calendar-booking-list">{selectedDayBookings.map((booking) => <article className="calendar-booking-item" key={booking.id}>
              <span className="booking-status status-approved">Approved</span>
              <strong>{booking.resourceName ?? booking.customerName ?? "Booking"}</strong>
              <span>{booking.purpose}</span>
              <time>{bookingStart(booking)?.toDate().toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}{booking.endDateTime ? ` – ${booking.endDateTime.toDate().toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}` : ""}</time>
            </article>)}</div>
          )}
        </aside>
      </div>
      <div className="staff-calendar-legend"><span><i /> Approved booking</span><span>{approvedBookings.length} approved total</span></div>
    </section>
  );

  const submitRequestView = (
    <section className="booking-panel staff-submit-panel" aria-labelledby="new-booking-title">
      <h2 className="staff-recent-details-title" id="new-booking-title">Recent Details</h2>
      <form className="staff-request-form" onSubmit={handleCreateBooking}>
        <fieldset className="request-type-fieldset">
          <legend>Request Type</legend>
          <label><input type="radio" name="requestType" value="facility" checked={requestType === "facility"} onChange={() => setRequestType("facility")} /> Facility</label>
          <label><input type="radio" name="requestType" value="vehicle" checked={requestType === "vehicle"} onChange={() => setRequestType("vehicle")} /> Vehicle</label>
        </fieldset>

        <label className="resource-selection">Facility/Vehicle Selection
          <select key={requestType} name="resourceName" required defaultValue="">
            <option value="" disabled>Select {requestType === "facility" ? "a facility" : "a vehicle"}</option>
            {(requestType === "facility" ? ["GYM", "AUDITORIUM", "AVR1", "AVR2"] : ["HINO", "HI-ACE", "BUS1", "BUS2", "TRAVIZ"]).map((resource) => <option key={resource} value={resource}>{resource}</option>)}
          </select>
        </label>

        <h3 className="reservation-heading">Reservation Date &amp; Time</h3>
        <div className="reservation-datetime-grid">
          <label>Start Date &amp; Time<input name="startDateTime" type="datetime-local" required value={startDateTime} onChange={(event) => setStartDateTime(event.target.value)} /></label>
          <label>End Date &amp; Time<input name="endDateTime" type="datetime-local" required min={startDateTime || undefined} /></label>
        </div>

        <label className="purpose-notes-label">Purpose / Notes<textarea name="purpose" rows={3} placeholder="Purpose details of request..." required /></label>
        <div className="staff-form-actions">
          <button className="cancel-request-button" type="button" onClick={() => { setMessage(""); setActiveStaffNav("Dashboard"); }}>Cancel</button>
          <button className="done-request-button" type="submit" disabled={savingBooking}>{savingBooking ? "Saving..." : "Done"}</button>
        </div>
      </form>
    </section>
  );

  if (checkingSession || !user || !role) {
    return <main className="dashboard-loading" aria-live="polite">Checking your sign-in...</main>;
  }

  return (
    <main className={`dashboard-page${role === "staff" ? ` staff-dashboard-page${sidebarOpen ? "" : " staff-sidebar-collapsed"}${activeStaffNav === "Submit Request" ? " staff-submit-view" : ""}` : ""}`}>
      {role === "staff" && (
        <aside className={`staff-sidebar${sidebarOpen ? "" : " is-hidden"}`} id="staff-sidebar">
          <button className="staff-sidebar-brand" type="button" onClick={() => setActiveStaffNav("Dashboard")}>
            <Image src={collegeLogo} alt="" width={40} height={40} />
            <span>SSPP Portal</span>
          </button>
          <nav className="staff-sidebar-nav" aria-label="Staff menu">
            {[
              { label: "Dashboard", icon: <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-7h6v7"/></> },
              { label: "Submit Request", icon: <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8"/></> },
              { label: "Calendar/Schedule", icon: <><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7 3v4M17 3v4M4 10h16"/></> },
              { label: "Request Status", icon: <><rect x="4" y="11" width="4" height="9" rx="1"/><rect x="10" y="5" width="4" height="15" rx="1"/><rect x="16" y="2" width="4" height="18" rx="1"/></> },
            ].map((item) => (
              <button key={item.label} type="button" className={`staff-nav-link${activeStaffNav === item.label ? " active" : ""}`} aria-current={activeStaffNav === item.label ? "page" : undefined} onClick={() => setActiveStaffNav(item.label)}>
                <svg viewBox="0 0 24 24" aria-hidden="true">{item.icon}</svg><span>{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>
      )}
      <div className="dashboard-shell">
        <header className="dashboard-header" id={role === "staff" ? "staff-dashboard" : undefined}>
          <div className="dashboard-title-group">
            {role === "staff" && <button className="sidebar-toggle" type="button" onClick={() => setSidebarOpen((open) => !open)} aria-expanded={sidebarOpen} aria-controls="staff-sidebar" aria-label={sidebarOpen ? "Hide staff sidebar" : "Show staff sidebar"} title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>}
            <div><span className="dashboard-eyebrow">ASSUMPTION COLLEGE OF DAVAO</span><h1>{role === "admin" ? "Admin Dashboard" : activeStaffNav === "Dashboard" ? "Staff Dashboard" : activeStaffNav}</h1></div>
          </div>
          <div className="dashboard-account"><span title={user.email ?? "Signed-in user"}>{user.email}</span><button type="button" onClick={handleSignOut} disabled={signingOut}>{signingOut ? "Signing out..." : "Sign out"}</button></div>
        </header>

        {message && (role === "admin" || !message.startsWith("Dili makuha ang bookings.")) && <p className="dashboard-message" role="status">{message}</p>}

        {role === "staff" ? (
          <div className="staff-dashboard-content">
            {activeStaffNav === "Dashboard" && <>
              <div className="staff-overview">
              <section className="staff-stat-grid" aria-label="Request totals">
                <article className="staff-stat-card total-stat"><span>Total Requests</span><strong>{bookings.length}</strong><span className="staff-stat-icon" aria-hidden="true">✎</span></article>
                <article className="staff-stat-card pending-stat"><span>Pending</span><strong>{pendingBookings.length}</strong><span className="staff-stat-icon" aria-hidden="true">⌛</span></article>
                <article className="staff-stat-card approved-stat"><span>Approved</span><strong>{approvedBookings.length}</strong><span className="staff-stat-icon" aria-hidden="true">●</span></article>
              </section>
              <section className="staff-quick-actions" aria-labelledby="quick-actions-title">
                <h2 id="quick-actions-title">Quick Actions</h2>
                <button type="button" onClick={() => setActiveStaffNav("Submit Request")}><span aria-hidden="true">＋</span> Submit New Request</button>
                <button type="button" onClick={() => setActiveStaffNav("Calendar/Schedule")}><span aria-hidden="true">▣</span> Check Schedule</button>
              </section>
              </div>
              {requestTable}
            </>}
            {activeStaffNav === "Request Status" && requestTable}
            {activeStaffNav === "Calendar/Schedule" && scheduleView}
            {activeStaffNav === "Submit Request" && submitRequestView}
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
                  <div className="booking-card-top"><h3>{booking.resourceName ? `${booking.requestType === "vehicle" ? "Vehicle" : "Facility"}: ${booking.resourceName}` : booking.customerName ?? "Booking request"}</h3><span className={`booking-status status-${booking.status}`}>{booking.status}</span></div>
                  <p>{booking.purpose}{booking.venue ? ` · ${booking.venue}` : ""}</p>
                  <p className="booking-meta">Requested by {booking.staffEmail ?? booking.staffUid}</p>
                  <p className="booking-meta">{formatDate(bookingStart(booking))}{booking.endDateTime ? ` – ${formatDate(booking.endDateTime)}` : ""}{booking.contactNumber ? ` · ${booking.contactNumber}` : ""}</p>
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
