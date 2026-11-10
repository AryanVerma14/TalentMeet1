import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { Link, useNavigate, useParams } from "react-router-dom";
import { auth, db } from "../firebase";

function JoinInterviewInvite() {
  const { inviteId } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [invite, setInvite] = useState(null);
  const [requestStatus, setRequestStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady) return;

    if (!user) {
      setLoading(false);
      return;
    }

    let unsubscribeRequest = null;
    let cancelled = false;

    async function loadInvitation() {
      setLoading(true);
      setError("");
      setInvite(null);
      setRequestStatus("");

      try {
        const inviteRef = doc(db, "interviewInvites", inviteId);
        const inviteSnapshot = await getDoc(inviteRef);

        if (cancelled) return;

        if (!inviteSnapshot.exists()) {
          throw new Error("This invitation does not exist.");
        }

        const inviteData = {
          id: inviteSnapshot.id,
          ...inviteSnapshot.data(),
        };

        setInvite(inviteData);

        if (inviteData.createdBy === user.uid) {
          setRequestStatus("host");
        } else {
          const requestRef = doc(
            db,
            "interviewInvites",
            inviteId,
            "requests",
            user.uid
          );

          unsubscribeRequest = onSnapshot(
            requestRef,
            (snapshot) => {
              if (cancelled) return;

              if (snapshot.exists()) {
                setRequestStatus(snapshot.data().status || "");
              } else {
                setRequestStatus("");
              }
            },
            (snapshotError) => {
              console.error("Could not listen for approval:", snapshotError);
              setError(
                "Could not check your request status. Please refresh the page."
              );
            }
          );
        }
      } catch (err) {
        console.error("Could not load invitation:", err);

        if (!cancelled) {
          setError(err.message || "Could not load this invitation.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadInvitation();

    return () => {
      cancelled = true;

      if (unsubscribeRequest) {
        unsubscribeRequest();
      }
    };
  }, [authReady, user, inviteId]);

  async function requestToJoin() {
    if (!user || !invite) return;

    setRequesting(true);
    setError("");

    try {
      if (invite.status !== "open") {
        throw new Error("This invitation is no longer open.");
      }

      const requestRef = doc(
        db,
        "interviewInvites",
        inviteId,
        "requests",
        user.uid
      );

      await setDoc(requestRef, {
        userId: user.uid,
        userName: user.displayName || "TalentMeet User",
        userEmail: user.email || "",
        status: "pending",
        requestedAt: serverTimestamp(),
      });

      setRequestStatus("pending");
    } catch (err) {
      console.error("Could not request to join:", err);
      setError(err.message || "Could not send your request.");
    } finally {
      setRequesting(false);
    }
  }

  if (!authReady || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950 p-6 text-white">
        <p className="text-gray-400">Loading interview invitation...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950 px-4 py-10 text-white">
        <section className="w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-900 p-8">
          <p className="text-sm font-semibold text-blue-400">TALENTMEET</p>
          <h1 className="mt-3 text-2xl font-bold">Interview Invitation</h1>
          <p className="mt-3 text-gray-400">
            Sign in to your registered TalentMeet account to request access to
            this interview.
          </p>

          <Link
            to="/login"
            className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-700"
          >
            Sign In
          </Link>

          <p className="mt-4 text-sm text-gray-400">
            New to TalentMeet?{" "}
            <Link to="/signup" className="text-blue-400 hover:underline">
              Create an account
            </Link>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-2xl">
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6 sm:p-8">
          <p className="text-sm font-semibold tracking-wider text-blue-400">
            TALENTMEET
          </p>

          <h1 className="mt-3 text-3xl font-bold">
            Interview Invitation
          </h1>

          {error && (
            <div className="mt-5 rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">
              {error}
            </div>
          )}

          {invite ? (
            <>
              <div className="mt-6">
                <p className="text-sm text-gray-400">Room name</p>
                <h2 className="mt-1 text-xl font-semibold">{invite.title}</h2>
              </div>

              <div className="mt-5">
                <p className="text-sm text-gray-400">Hosted by</p>
                <p className="mt-1 font-medium">{invite.hostName}</p>
              </div>

              {requestStatus === "host" ? (
                <div className="mt-8 rounded-xl border border-blue-800 bg-blue-950/30 p-5">
                  <h2 className="font-semibold text-blue-300">
                    You are the host
                  </h2>
                  <p className="mt-2 text-sm text-gray-300">
                    Open your interview room to prepare for your approved
                    guest.
                  </p>

                  <button
                    onClick={() =>
                      navigate(`/instant-room/${inviteId}`)
                    }
                    className="mt-5 rounded-lg bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-700"
                  >
                    Open Interview Room
                  </button>

                  <button
                    onClick={() => navigate("/create-room")}
                    className="ml-3 mt-5 rounded-lg border border-gray-700 px-5 py-3 font-semibold hover:bg-gray-800"
                  >
                    Manage Invitations
                  </button>
                </div>
              ) : requestStatus === "approved" ? (
                <div className="mt-8 rounded-xl border border-green-800 bg-green-950/30 p-5">
                  <h2 className="font-semibold text-green-300">
                    Your request has been approved!
                  </h2>

                  <p className="mt-2 text-sm text-gray-300">
                    The host approved your request. You can now proceed to
                    the protected interview room.
                  </p>

                  <button
                    onClick={() =>
                      navigate(`/instant-room/${inviteId}`)
                    }
                    className="mt-5 rounded-lg bg-green-600 px-5 py-3 font-semibold hover:bg-green-700"
                  >
                    Join Room
                  </button>
                </div>
              ) : requestStatus === "pending" ? (
                <div className="mt-8 rounded-xl border border-yellow-800 bg-yellow-950/30 p-5">
                  <h2 className="font-semibold text-yellow-300">
                    Request pending
                  </h2>
                  <p className="mt-2 text-sm text-gray-300">
                    Your request has been sent. Wait for the host to approve
                    it. This page will update automatically.
                  </p>
                </div>
              ) : requestStatus === "rejected" ? (
                <div className="mt-8 rounded-xl border border-red-800 bg-red-950/30 p-5">
                  <h2 className="font-semibold text-red-300">
                    Request not approved
                  </h2>
                  <p className="mt-2 text-sm text-gray-300">
                    The host did not approve this request.
                  </p>
                </div>
              ) : invite.status === "open" ? (
                <div className="mt-8 rounded-xl border border-gray-700 bg-gray-950 p-5">
                  <p className="text-gray-300">
                    Request access to join this interview. Only registered
                    TalentMeet users can join.
                  </p>

                  <button
                    onClick={requestToJoin}
                    disabled={requesting}
                    className="mt-5 rounded-lg bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {requesting ? "Sending Request..." : "Request to Join"}
                  </button>
                </div>
              ) : (
                <div className="mt-8 rounded-xl border border-gray-700 bg-gray-950 p-5">
                  <h2 className="font-semibold">Invitation closed</h2>
                  <p className="mt-2 text-sm text-gray-400">
                    This invitation is no longer accepting new requests.
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="mt-6 text-gray-400">
              {error || "The invitation could not be found."}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

export default JoinInterviewInvite;