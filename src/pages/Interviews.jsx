
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase";

function Interviews() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [description, setDescription] = useState("");
  const [participantId, setParticipantId] = useState("");

  const [connections, setConnections] = useState([]);
  const [connectionProfiles, setConnectionProfiles] = useState({});
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [completingId, setCompletingId] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setConnections([]);
      setConnectionProfiles({});
      return;
    }

    const loadConnections = async () => {
      setLoadingConnections(true);

      try {
        const sentQuery = query(
          collection(db, "connections"),
          where("senderId", "==", user.uid),
          where("status", "==", "accepted")
        );

        const receivedQuery = query(
          collection(db, "connections"),
          where("receiverId", "==", user.uid),
          where("status", "==", "accepted")
        );

        const [sentSnapshot, receivedSnapshot] = await Promise.all([
          getDocs(sentQuery),
          getDocs(receivedQuery),
        ]);

        const allConnections = [
          ...sentSnapshot.docs.map((document) => ({
            id: document.id,
            ...document.data(),
          })),
          ...receivedSnapshot.docs.map((document) => ({
            id: document.id,
            ...document.data(),
          })),
        ];

        setConnections(allConnections);

        const profiles = {};

        await Promise.all(
          allConnections.map(async (connection) => {
            const otherUserId =
              connection.senderId === user.uid
                ? connection.receiverId
                : connection.senderId;

            const profileSnapshot = await getDoc(
              doc(db, "publicProfiles", otherUserId)
            );

            if (profileSnapshot.exists()) {
              profiles[otherUserId] = profileSnapshot.data();
            }
          })
        );

        setConnectionProfiles(profiles);
      } catch (error) {
        console.error("Error loading connections:", error);
        alert(error.message);
      } finally {
        setLoadingConnections(false);
      }
    };

    loadConnections();
  }, [user]);

  const loadInterviews = async (currentUser) => {
    if (!currentUser) {
      setInterviews([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const createdByQuery = query(
        collection(db, "interviews"),
        where("createdBy", "==", currentUser.uid)
      );

      const participantQuery = query(
        collection(db, "interviews"),
        where("participantId", "==", currentUser.uid)
      );

      const [createdSnapshot, participantSnapshot] = await Promise.all([
        getDocs(createdByQuery),
        getDocs(participantQuery),
      ]);

      const interviewMap = new Map();

      [...createdSnapshot.docs, ...participantSnapshot.docs].forEach(
        (document) => {
          interviewMap.set(document.id, {
            id: document.id,
            ...document.data(),
          });
        }
      );

      setInterviews(Array.from(interviewMap.values()));
    } catch (error) {
      console.error("Error loading interviews:", error);
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInterviews(user);
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user) {
      alert("Please login first.");
      return;
    }

    if (!participantId) {
      alert("Please select a connection.");
      return;
    }

    try {
      await addDoc(collection(db, "interviews"), {
        title: title.trim(),
        date,
        time,
        description: description.trim(),
        createdBy: user.uid,
        participantId,
        status: "scheduled",
        createdAt: serverTimestamp(),
      });

      alert("Interview scheduled successfully!");

      setTitle("");
      setDate("");
      setTime("");
      setDescription("");
      setParticipantId("");
      setShowForm(false);

      await loadInterviews(user);
    } catch (error) {
      console.error("Error scheduling interview:", error);
      alert(error.message);
    }
  };

  const handleAccept = async (interviewId) => {
    try {
      await updateDoc(doc(db, "interviews", interviewId), {
        status: "accepted",
      });

      setInterviews((current) =>
        current.map((interview) =>
          interview.id === interviewId
            ? { ...interview, status: "accepted" }
            : interview
        )
      );

      alert("Interview accepted!");
    } catch (error) {
      console.error("Error accepting interview:", error);
      alert(error.message);
    }
  };

  const handleDecline = async (interviewId) => {
    if (
      !window.confirm("Are you sure you want to decline this interview?")
    ) {
      return;
    }

    try {
      await updateDoc(doc(db, "interviews", interviewId), {
        status: "declined",
      });

      setInterviews((current) =>
        current.map((interview) =>
          interview.id === interviewId
            ? { ...interview, status: "declined" }
            : interview
        )
      );

      alert("Interview declined.");
    } catch (error) {
      console.error("Error declining interview:", error);
      alert(error.message);
    }
  };

  const handleComplete = async (interviewId) => {
    if (
      !window.confirm(
        "Mark this interview as completed? This will move it to Past Interviews."
      )
    ) {
      return;
    }

    setCompletingId(interviewId);

    try {
      await updateDoc(doc(db, "interviews", interviewId), {
        status: "completed",
        completedAt: serverTimestamp(),
        completedBy: user.uid,
      });

      setInterviews((current) =>
        current.map((interview) =>
          interview.id === interviewId
            ? {
                ...interview,
                status: "completed",
                completedBy: user.uid,
              }
            : interview
        )
      );

      alert("Interview moved to Past Interviews.");
    } catch (error) {
      console.error("Error completing interview:", error);
      alert(error.message);
    } finally {
      setCompletingId(null);
    }
  };

  const handleJoinInterview = (interviewId) => {
    navigate(`/interview/${interviewId}/prejoin`);
  };

  const upcomingInterviews = interviews.filter(
    (interview) => interview.status !== "completed"
  );

  const pastInterviews = interviews.filter(
    (interview) => interview.status === "completed"
  );

  const renderInterviewCard = (interview, isPast = false) => {
    const isCreator = interview.createdBy === user?.uid;

    const otherUserId = isCreator
      ? interview.participantId
      : interview.createdBy;

    const otherUserProfile = connectionProfiles[otherUserId];

    const statusClasses =
      interview.status === "accepted"
        ? "bg-green-500/15 text-green-400"
        : interview.status === "completed"
        ? "bg-purple-500/15 text-purple-400"
        : interview.status === "declined"
        ? "bg-red-500/15 text-red-400"
        : "bg-yellow-500/15 text-yellow-400";

    return (
      <article
        key={interview.id}
        className="bg-gray-900 border border-gray-800 rounded-xl p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <h3 className="text-xl sm:text-2xl font-semibold break-words">
            {interview.title || "Untitled Interview"}
          </h3>

          <span
            className={`w-fit rounded-full px-3 py-1 text-sm capitalize ${statusClasses}`}
          >
            {interview.status || "pending"}
          </span>
        </div>

        <p className="text-purple-400 mt-3">
          👤 With: {otherUserProfile?.name || "Connected User"}
        </p>

        <p className="text-blue-400 mt-3">
          📅 {interview.date || "Date not set"}
        </p>

        <p className="text-blue-400 mt-1">
          ⏰ {interview.time || "Time not set"}
        </p>

        <p className="text-gray-400 mt-3 whitespace-pre-wrap">
          {interview.description || "No description provided."}
        </p>

        {!isPast && (
          <>
            {!isCreator && interview.status === "scheduled" && (
              <div className="flex flex-wrap gap-3 mt-5">
                <button
                  onClick={() => handleAccept(interview.id)}
                  className="bg-green-600 hover:bg-green-700 px-5 py-2 rounded-lg font-semibold transition"
                >
                  Accept
                </button>

                <button
                  onClick={() => handleDecline(interview.id)}
                  className="bg-red-600 hover:bg-red-700 px-5 py-2 rounded-lg font-semibold transition"
                >
                  Decline
                </button>
              </div>
            )}

            {interview.status === "accepted" && (
              <div className="flex flex-wrap gap-3 mt-5">
                <button
                  onClick={() => handleJoinInterview(interview.id)}
                  className="bg-blue-600 hover:bg-blue-700 px-5 py-3 rounded-lg font-semibold transition"
                >
                  Check Camera & Join →
                </button>

                <button
                  onClick={() => handleComplete(interview.id)}
                  disabled={completingId === interview.id}
                  className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-5 py-3 rounded-lg font-semibold transition"
                >
                  {completingId === interview.id
                    ? "Updating..."
                    : "Mark as Completed"}
                </button>
              </div>
            )}
          </>
        )}

        {isPast && (
          <p className="text-purple-300 text-sm mt-5">
            ✓ This interview has been marked as completed.
          </p>
        )}

        <p className="text-gray-500 text-sm mt-4">
          {isCreator
            ? "You scheduled this interview."
            : "This interview was scheduled for you."}
        </p>
      </article>
    );
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 sm:px-6 py-10 sm:py-12">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5 mb-10">
          <div>
            <p className="text-sm text-blue-400 font-semibold mb-2">
              TALENTMEET
            </p>

            <h1 className="text-4xl font-bold">Interviews</h1>

            <p className="text-gray-400 mt-2">
              Schedule and manage your interviews.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => navigate("/create-room")}
              className="w-full sm:w-auto bg-green-600 hover:bg-green-700 px-5 py-3 rounded-lg font-semibold transition"
            >
              + Create Instant Interview Room
            </button>

            <button
              onClick={() => setShowForm(true)}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 px-5 py-3 rounded-lg font-semibold transition"
            >
              + Schedule Interview
            </button>
          </div>
        </div>

        {showForm && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 sm:p-6 mb-10">
            <div className="flex items-center justify-between mb-6 gap-3">
              <h2 className="text-2xl font-semibold">
                Schedule Interview
              </h2>

              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-white text-xl"
                aria-label="Close schedule form"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Interview With
                </label>

                {loadingConnections ? (
                  <p className="text-gray-400">Loading connections...</p>
                ) : connections.length === 0 ? (
                  <p className="text-yellow-400">
                    You don't have any accepted connections yet.
                  </p>
                ) : (
                  <select
                    value={participantId}
                    onChange={(e) => setParticipantId(e.target.value)}
                    required
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 outline-none focus:border-blue-500"
                  >
                    <option value="">Select a connection</option>

                    {connections.map((connection) => {
                      const otherUserId =
                        connection.senderId === user?.uid
                          ? connection.receiverId
                          : connection.senderId;

                      const profile = connectionProfiles[otherUserId];

                      return (
                        <option key={connection.id} value={otherUserId}>
                          {profile?.name || "Connected User"}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Interview Title
                </label>

                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. React Interview"
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Date
                </label>

                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={new Date().toLocaleDateString("en-CA")}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Time
                </label>

                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Description
                </label>

                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What will this interview be about?"
                  rows={4}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex flex-col sm:flex-row flex-wrap gap-3 pt-2">
                <button
                  type="submit"
                  disabled={connections.length === 0 || !participantId}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-6 py-3 rounded-lg font-semibold transition"
                >
                  Schedule Interview
                </button>

                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="bg-gray-700 hover:bg-gray-600 px-6 py-3 rounded-lg font-semibold transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <section>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-2xl font-semibold">
              Upcoming Interviews
            </h2>

            <span className="text-sm text-gray-400">
              {upcomingInterviews.length} total
            </span>
          </div>

          {loading ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <p className="text-gray-400">Loading interviews...</p>
            </div>
          ) : upcomingInterviews.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <p className="text-gray-400">No upcoming interviews.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {upcomingInterviews.map((interview) =>
                renderInterviewCard(interview)
              )}
            </div>
          )}
        </section>

        <section className="mt-10">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-2xl font-semibold">Past Interviews</h2>

            <span className="text-sm text-gray-400">
              {pastInterviews.length} completed
            </span>
          </div>

          {loading ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <p className="text-gray-400">Loading interview history...</p>
            </div>
          ) : pastInterviews.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <p className="text-gray-400">
                No completed interviews yet. Completed interviews will appear
                here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pastInterviews.map((interview) =>
                renderInterviewCard(interview, true)
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default Interviews;