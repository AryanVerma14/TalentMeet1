
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

function PreJoin() {
  const { interviewId } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [user, setUser] = useState(null);
  const [interview, setInterview] = useState(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [permissionError, setPermissionError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user || !interviewId) return;

    let cancelled = false;

    async function loadInterview() {
      try {
        const snapshot = await getDoc(doc(db, "interviews", interviewId));

        if (cancelled) return;

        if (!snapshot.exists()) {
          setPermissionError("This interview could not be found.");
        } else {
          const data = snapshot.data();

          if (
            data.createdBy !== user.uid &&
            data.participantId !== user.uid
          ) {
            setPermissionError("You are not a participant in this interview.");
          } else {
            setInterview(data);
          }
        }
      } catch (error) {
        console.error("Could not load interview:", error);
        if (!cancelled) {
          setPermissionError("Could not load interview details.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadInterview();

    return () => {
      cancelled = true;
    };
  }, [user, interviewId]);

  useEffect(() => {
    let cancelled = false;

    async function startPreview() {
      try {
        setPermissionError("");

        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        stream.getVideoTracks().forEach((track) => {
          track.enabled = cameraOn;
        });

        stream.getAudioTracks().forEach((track) => {
          track.enabled = micOn;
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      } catch (error) {
        console.error("Media permission error:", error);

        if (!cancelled) {
          setPermissionError(
            "Camera or microphone access was denied or is unavailable. Check your browser permissions."
          );
        }
      }
    }

    startPreview();

    return () => {
      cancelled = true;

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!streamRef.current) return;

    streamRef.current.getVideoTracks().forEach((track) => {
      track.enabled = cameraOn;
    });
  }, [cameraOn]);

  useEffect(() => {
    if (!streamRef.current) return;

    streamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = micOn;
    });
  }, [micOn]);

  const handleJoin = () => {
    if (!interview) return;

    // Stop the preview stream before the interview room requests media.
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    navigate(`/interview/${interviewId}`);
  };

  if (!user || loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <p className="text-slate-400">Preparing your interview...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white px-4 py-8 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <p className="text-sm tracking-[0.25em] text-cyan-300 font-semibold">
            TALENTMEET
          </p>
          <h1 className="mt-3 text-3xl sm:text-4xl font-bold">
            Get ready for your interview
          </h1>
          <p className="mt-2 text-slate-400">
            Check your camera and microphone before joining.
          </p>
        </header>

        {permissionError && (
          <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            {permissionError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div>
                <h2 className="font-semibold">Camera preview</h2>
                <p className="text-sm text-slate-500 mt-1">
                  This is how you will appear to the other participant.
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs ${
                  permissionError
                    ? "bg-amber-400/10 text-amber-300"
                    : "bg-emerald-400/10 text-emerald-300"
                }`}
              >
                {permissionError ? "Check permissions" : "Preview"}
              </span>
            </div>

            <div className="relative aspect-video bg-black">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={`h-full w-full object-cover ${
                  cameraOn ? "" : "hidden"
                }`}
              />

              {!cameraOn && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-5xl mb-3">📷</div>
                    <p className="text-slate-300">Your camera is off</p>
                  </div>
                </div>
              )}

              <div className="absolute bottom-4 left-4 rounded-lg bg-black/60 px-3 py-2 text-sm">
                {user.displayName || user.email || "You"}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 p-5">
              <button
                onClick={() => setMicOn((value) => !value)}
                className={`rounded-xl px-4 py-3 font-medium ${
                  micOn
                    ? "bg-slate-800 border border-slate-700 hover:bg-slate-700"
                    : "bg-red-500/15 border border-red-500/30 text-red-300"
                }`}
              >
                {micOn ? "🎤 Microphone On" : "🔇 Microphone Off"}
              </button>

              <button
                onClick={() => setCameraOn((value) => !value)}
                className={`rounded-xl px-4 py-3 font-medium ${
                  cameraOn
                    ? "bg-slate-800 border border-slate-700 hover:bg-slate-700"
                    : "bg-red-500/15 border border-red-500/30 text-red-300"
                }`}
              >
                {cameraOn ? "📹 Camera On" : "📷 Camera Off"}
              </button>
            </div>
          </section>

          <aside className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
            <h2 className="text-xl font-semibold">Interview details</h2>

            <div className="mt-5 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Interview
                </p>
                <p className="mt-1 font-medium">
                  {interview?.title || "Live interview"}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Your name
                </p>
                <p className="mt-1 font-medium">
                  {user.displayName || "TalentMeet member"}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Date
                </p>
                <p className="mt-1 font-medium">
                  {interview?.date || "Not specified"}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Time
                </p>
                <p className="mt-1 font-medium">
                  {interview?.time || "Not specified"}
                </p>
              </div>
            </div>

            <div className="mt-7 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="font-medium">Before you join</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-400">
                <li>✓ Check your camera</li>
                <li>✓ Check your microphone</li>
                <li>✓ Find a quiet place</li>
                <li>✓ Make sure your internet is stable</li>
              </ul>
            </div>

            <button
              onClick={handleJoin}
              disabled={!interview}
              className="mt-6 w-full rounded-xl bg-cyan-400 px-5 py-3 font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Join Interview →
            </button>

            <button
              onClick={() => navigate("/interviews")}
              className="mt-3 w-full rounded-xl border border-slate-700 px-5 py-3 font-medium text-slate-300 transition hover:bg-slate-800"
            >
              Back to Interviews
            </button>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default PreJoin;