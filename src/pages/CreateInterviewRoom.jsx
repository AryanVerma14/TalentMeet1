
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";

function CreateInterviewRoom() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [title, setTitle] = useState("");
  const [loadingUser, setLoadingUser] = useState(true);
  const [creating, setCreating] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [inviteId, setInviteId] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [processingId, setProcessingId] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoadingUser(false);
    });

    return () => unsubscribe();
  }, []);

  // Restore the host's invitation after a page refresh.
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const restoreInvite = async () => {
      try {
        const savedInviteId = sessionStorage.getItem(
          `talentmeetInvite_${user.uid}`
        );

        if (!savedInviteId) return;

        const inviteRef = doc(db, "interviewInvites", savedInviteId);
        const inviteSnap = await getDoc(inviteRef);

        if (
          cancelled ||
          !inviteSnap.exists() ||
          inviteSnap.data().createdBy !== user.uid
        ) {
          return;
        }

        setInviteId(savedInviteId);
        setTitle(inviteSnap.data().title || "");
        setInviteLink(
          `${window.location.origin}/join/${savedInviteId}`
        );
      } catch (err) {
        console.error("Could not restore invitation:", err);
      }
    };

    restoreInvite();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Listen for join requests for this invitation.
  useEffect(() => {
    if (!user || !inviteId) {
      setRequests([]);
      return;
    }

    let unsubscribeRequests = null;
    let cancelled = false;

    const startListening = async () => {
      setLoadingRequests(true);
      setError("");

      try {
        const inviteSnap = await getDoc(
          doc(db, "interviewInvites", inviteId)
        );

        if (cancelled) return;

        if (
          !inviteSnap.exists() ||
          inviteSnap.data().createdBy !== user.uid
        ) {
          setError("You do not have permission to manage this room.");
          setLoadingRequests(false);
          return;
        }

        const requestsRef = collection(
          db,
          "interviewInvites",
          inviteId,
          "requests"
        );

        const requestsQuery = query(
          requestsRef,
          where("status", "==", "pending")
        );

        unsubscribeRequests = onSnapshot(
          requestsQuery,
          (snapshot) => {
            setRequests(
              snapshot.docs.map((requestDoc) => ({
                id: requestDoc.id,
                ...requestDoc.data(),
              }))
            );
            setLoadingRequests(false);
          },
          (err) => {
            console.error("Could not load join requests:", err);
            setError(
              "Could not load requests. Check your Firestore rules and connection."
            );
            setLoadingRequests(false);
          }
        );
      } catch (err) {
        console.error("Could not start request listener:", err);
        if (!cancelled) {
          setError(err.message || "Could not load join requests.");
          setLoadingRequests(false);
        }
      }
    };

    startListening();

    return () => {
      cancelled = true;
      if (unsubscribeRequests) unsubscribeRequests();
    };
  }, [user, inviteId]);

  const handleCreateRoom = async (event) => {
    event.preventDefault();

    if (!user) {
      navigate("/login");
      return;
    }

    if (!title.trim()) {
      setError("Please enter an interview room name.");
      return;
    }

    setCreating(true);
    setError("");
    setNotice("");
    setInviteLink("");
    setInviteId("");
    setCopied(false);
    setRequests([]);

    try {
      const inviteRef = await addDoc(
        collection(db, "interviewInvites"),
        {
          title: title.trim(),
          createdBy: user.uid,
          hostName: user.displayName || user.email || "Host",
          status: "open",
          createdAt: serverTimestamp(),
        }
      );

      const link = `${window.location.origin}/join/${inviteRef.id}`;

      setInviteId(inviteRef.id);
      setInviteLink(link);

      sessionStorage.setItem(
        `talentmeetInvite_${user.uid}`,
        inviteRef.id
      );
    } catch (err) {
      console.error("Could not create interview room:", err);
      setError(
        err.message || "Could not create the room. Please try again."
      );
    } finally {
      setCreating(false);
    }
  };

  const handleCopyLink = async () => {
    if (!inviteLink) return;

    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setNotice("Invitation link copied.");
    } catch (err) {
      console.error("Could not copy invitation link:", err);
      setError(
        "Copy failed. Select and copy the invitation link manually."
      );
    }
  };

  const handleRequestDecision = async (requesterId, decision) => {
    if (!user || !inviteId || processingId) return;

    setProcessingId(requesterId);
    setError("");
    setNotice("");

    try {
      const inviteRef = doc(db, "interviewInvites", inviteId);
      const inviteSnap = await getDoc(inviteRef);

      if (
        !inviteSnap.exists() ||
        inviteSnap.data().createdBy !== user.uid
      ) {
        throw new Error("Only the room host can review requests.");
      }

      const requestRef = doc(
        db,
        "interviewInvites",
        inviteId,
        "requests",
        requesterId
      );

      const requestSnap = await getDoc(requestRef);

      if (!requestSnap.exists()) {
        throw new Error("This join request no longer exists.");
      }

      if (requestSnap.data().status !== "pending") {
        throw new Error("This request has already been reviewed.");
      }

      await updateDoc(requestRef, {
        status: decision,
        reviewedAt: serverTimestamp(),
        reviewedBy: user.uid,
      });

      setNotice(
        decision === "approved"
          ? "Guest approved. Room entry still needs to be connected."
          : "Guest request rejected."
      );
    } catch (err) {
      console.error("Could not review join request:", err);
      setError(err.message || "Could not update the request.");
    } finally {
      setProcessingId("");
    }
  };

  if (loadingUser) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
        <p className="text-gray-400">Checking your account...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
          <h1 className="text-2xl font-bold">Sign in required</h1>
          <p className="text-gray-400 mt-3">
            Sign in to TalentMeet before creating an interview room.
          </p>
          <button
            onClick={() => navigate("/login")}
            className="mt-6 w-full rounded-lg bg-blue-600 hover:bg-blue-700 px-5 py-3 font-semibold"
          >
            Sign In
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate("/interviews")}
          className="text-gray-400 hover:text-white mb-8"
        >
          ← Back to Interviews
        </button>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8">
          <p className="text-blue-400 text-sm font-semibold">
            TALENTMEET
          </p>

          <h1 className="text-3xl font-bold mt-2">
            Create an Interview Room
          </h1>

          <p className="text-gray-400 mt-3">
            Create an invitation link and manage requests from registered
            TalentMeet users.
          </p>

          {!inviteLink && (
            <form onSubmit={handleCreateRoom} className="mt-8 space-y-5">
              <div>
                <label
                  htmlFor="roomTitle"
                  className="block text-sm font-medium mb-2"
                >
                  Interview Room Name
                </label>

                <input
                  id="roomTitle"
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. React Technical Interview"
                  maxLength={100}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={creating || !title.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg px-5 py-3 font-semibold transition"
              >
                {creating ? "Creating Room..." : "Create Room & Generate Link"}
              </button>
            </form>
          )}

          {error && (
            <p className="mt-5 text-red-400 text-sm break-words">
              {error}
            </p>
          )}

          {notice && (
            <p className="mt-4 text-green-400 text-sm">{notice}</p>
          )}

          {inviteLink && (
            <div className="mt-8 border border-green-800 bg-green-950/30 rounded-xl p-5">
              <h2 className="text-xl font-semibold text-green-400">
                Invitation Link Created
              </h2>

              <p className="text-gray-300 text-sm mt-2">
                Share this link with the registered TalentMeet user you want
                to invite.
              </p>

              <div className="mt-4 flex flex-col sm:flex-row gap-3">
                <input
                  aria-label="Interview invitation link"
                  readOnly
                  value={inviteLink}
                  onFocus={(event) => event.target.select()}
                  className="min-w-0 flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-3 text-sm"
                />

                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="bg-green-600 hover:bg-green-700 rounded-lg px-5 py-3 font-semibold"
                >
                  {copied ? "Copied!" : "Copy Link"}
                </button>
              </div>

              <p className="text-xs text-gray-400 mt-3">
                Room: {title}
              </p>
            </div>
          )}
        </div>

        {inviteId && (
          <section className="mt-8 bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">Join Requests</h2>
                <p className="text-gray-400 text-sm mt-1">
                  Review users asking to join this room.
                </p>
              </div>

              <span className="rounded-full bg-yellow-500/10 text-yellow-300 px-3 py-1 text-sm">
                {requests.length} pending
              </span>
            </div>

            {loadingRequests ? (
              <p className="text-gray-400 mt-6">Loading requests...</p>
            ) : requests.length === 0 ? (
              <div className="mt-6 rounded-xl border border-gray-800 p-5 text-gray-400">
                No pending requests right now. New requests will appear here
                automatically.
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {requests.map((request) => (
                  <div
                    key={request.id}
                    className="rounded-xl border border-gray-800 bg-gray-950 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <h3 className="font-semibold break-words">
                        {request.userName || "TalentMeet User"}
                      </h3>
                      <p className="text-gray-400 text-sm break-all mt-1">
                        {request.userEmail || "No email provided"}
                      </p>
                      <p className="text-yellow-300 text-xs mt-2">
                        Waiting for your decision
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        disabled={Boolean(processingId)}
                        onClick={() =>
                          handleRequestDecision(request.id, "approved")
                        }
                        className="flex-1 sm:flex-none rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 px-4 py-2 font-semibold"
                      >
                        {processingId === request.id
                          ? "Please wait..."
                          : "Approve"}
                      </button>

                      <button
                        type="button"
                        disabled={Boolean(processingId)}
                        onClick={() =>
                          handleRequestDecision(request.id, "rejected")
                        }
                        className="flex-1 sm:flex-none rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 px-4 py-2 font-semibold"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-yellow-300 text-sm mt-6">
              Approval currently records the host's decision. The protected
              room entry and WebRTC connection are the next implementation
              step.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

export default CreateInterviewRoom;