
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase";

function InterviewRoom() {
  const { interviewId } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [interview, setInterview] = useState(null);
  const [otherParticipantName, setOtherParticipantName] = useState(
    "Other Participant"
  );
  const [isHost, setIsHost] = useState(false);
  const [status, setStatus] = useState("Loading interview...");
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [remoteMuted, setRemoteMuted] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [connected, setConnected] = useState(false);
  const [ending, setEnding] = useState(false);
  const [interviewEnded, setInterviewEnded] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const roomUnsubscribeRef = useRef(null);
  const sessionCleanupRef = useRef(null);
  const sessionStartTokenRef = useRef(0);
  const activeSessionIdRef = useRef(null);

  // Authentication
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return unsubscribe;
  }, []);

  // Load the other participant's public profile
  useEffect(() => {
    if (!user || !interviewId) return;

    let cancelled = false;

    async function loadParticipantName() {
      try {
        const interviewRef = doc(db, "interviews", interviewId);
        const interviewSnapshot = await getDoc(interviewRef);

        if (!interviewSnapshot.exists() || cancelled) return;

        const interviewData = interviewSnapshot.data();

        const otherUserId =
          interviewData.createdBy === user.uid
            ? interviewData.participantId
            : interviewData.createdBy;

        if (!otherUserId) return;

        const profileRef = doc(db, "publicProfiles", otherUserId);
        const profileSnapshot = await getDoc(profileRef);

        if (!profileSnapshot.exists() || cancelled) return;

        const profile = profileSnapshot.data();

        setOtherParticipantName(
          profile.name ||
            profile.displayName ||
            profile.fullName ||
            "Other Participant"
        );
      } catch (error) {
        console.error("Could not load participant profile:", error);
      }
    }

    loadParticipantName();

    return () => {
      cancelled = true;
    };
  }, [user, interviewId]);

  // Clean up the local WebRTC session and stop camera/microphone
  const cleanupSession = () => {
    if (sessionCleanupRef.current) {
      const cleanup = sessionCleanupRef.current;
      sessionCleanupRef.current = null;
      cleanup();
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.oniceconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  };

  // Listen for either participant completing the interview
  useEffect(() => {
    if (!user || !interviewId) return;

    const interviewRef = doc(db, "interviews", interviewId);

    const unsubscribe = onSnapshot(
      interviewRef,
      (snapshot) => {
        if (!snapshot.exists()) return;

        const data = snapshot.data();

        if (data.status === "completed") {
          setInterviewEnded(true);
          setConnected(false);
          setStatus("Interview ended by a participant.");

          sessionStartTokenRef.current += 1;

          if (roomUnsubscribeRef.current) {
            roomUnsubscribeRef.current();
            roomUnsubscribeRef.current = null;
          }

          activeSessionIdRef.current = null;
          cleanupSession();

          navigate("/interviews", { replace: true });
        }
      },
      (error) => {
        console.error("Interview completion listener error:", error);
      }
    );

    return unsubscribe;
  }, [user, interviewId, navigate]);

  // Interview duration timer
  useEffect(() => {
    if (!connected || interviewEnded) return;

    const interval = setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [connected, interviewEnded]);

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    return [hours, minutes, remainingSeconds]
      .map((value) => String(value).padStart(2, "0"))
      .join(":");
  };

  // WebRTC interview session
  useEffect(() => {
    if (!user || !interviewId) return;

    let cancelled = false;

    const startInterview = async () => {
      try {
        setStatus("Loading interview...");

        const interviewRef = doc(db, "interviews", interviewId);
        const interviewSnapshot = await getDoc(interviewRef);

        if (cancelled) return;

        if (!interviewSnapshot.exists()) {
          setStatus("Interview not found.");
          return;
        }

        const interviewData = interviewSnapshot.data();
        setInterview(interviewData);

        if (interviewData.status === "completed") {
          setInterviewEnded(true);
          setStatus("This interview has already been completed.");
          navigate("/interviews", { replace: true });
          return;
        }

        const currentUserIsHost = interviewData.createdBy === user.uid;
        const currentUserIsParticipant =
          interviewData.participantId === user.uid;

        if (!currentUserIsHost && !currentUserIsParticipant) {
          setStatus("You are not part of this interview.");
          return;
        }

        setIsHost(currentUserIsHost);

        const roomRef = doc(db, "interviewRooms", interviewId);

        const startSession = async (sessionId, host) => {
          if (
            cancelled ||
            interviewEnded ||
            activeSessionIdRef.current === sessionId
          ) {
            return;
          }

          const token = ++sessionStartTokenRef.current;

          cleanupSession();
          activeSessionIdRef.current = sessionId;
          setConnected(false);
          setElapsedSeconds(0);

          let disposed = false;
          let unsubscribeCandidates = null;
          let unsubscribeOffer = null;
          let unsubscribeAnswer = null;

          const pendingCandidates = [];

          const sessionRef = doc(
            db,
            "interviewRooms",
            interviewId,
            "sessions",
            sessionId
          );

          const offerRef = doc(sessionRef, "offer", "main");
          const answerRef = doc(sessionRef, "answer", "main");
          const candidatesRef = collection(sessionRef, "candidates");

          const isCurrentSession = () =>
            !cancelled &&
            !disposed &&
            token === sessionStartTokenRef.current;

          const stopThisSession = () => {
            disposed = true;
            unsubscribeCandidates?.();
            unsubscribeOffer?.();
            unsubscribeAnswer?.();
          };

          sessionCleanupRef.current = stopThisSession;

          setStatus(
            host
              ? "Starting camera and microphone..."
              : "Connecting to interview host..."
          );

          let localStream;

          try {
            localStream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true,
            });
          } catch (error) {
            console.error("Camera/microphone error:", error);

            if (isCurrentSession()) {
              setStatus(
                "Camera or microphone unavailable. Check browser permissions."
              );
            }

            stopThisSession();
            return;
          }

          if (!isCurrentSession()) {
            localStream.getTracks().forEach((track) => track.stop());
            return;
          }

          localStreamRef.current = localStream;

          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStream;
            localVideoRef.current.play().catch(() => {});
          }

          const pc = new RTCPeerConnection({
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:stun1.l.google.com:19302" },
            ],
          });

          peerConnectionRef.current = pc;

          localStream.getTracks().forEach((track) => {
            pc.addTrack(track, localStream);
          });

          const flushPendingCandidates = async () => {
            if (!pc.remoteDescription || !isCurrentSession()) return;

            while (pendingCandidates.length > 0) {
              const candidate = pendingCandidates.shift();

              try {
                await pc.addIceCandidate(candidate);
              } catch (error) {
                console.error("Could not add queued ICE candidate:", error);
              }
            }
          };

          pc.ontrack = (event) => {
            if (!isCurrentSession()) return;

            const remoteStream = event.streams?.[0];
            const video = remoteVideoRef.current;

            if (!remoteStream || !video) return;

            if (video.srcObject !== remoteStream) {
              video.srcObject = remoteStream;
            }

            video.autoplay = true;
            video.playsInline = true;
            video.muted = remoteMuted;

            video.play().catch((error) => {
              console.warn("Remote video autoplay:", error.message);
            });
          };

          pc.onicecandidate = async (event) => {
            if (!event.candidate || !isCurrentSession()) return;

            try {
              await addDoc(candidatesRef, {
                senderId: user.uid,
                candidate: event.candidate.toJSON(),
                createdAt: serverTimestamp(),
              });
            } catch (error) {
              console.error("Could not save ICE candidate:", error);
            }
          };

          pc.onconnectionstatechange = () => {
            if (!isCurrentSession()) return;

            if (pc.connectionState === "connected") {
              setConnected(true);
              setStatus("Connected to participant.");
              remoteVideoRef.current?.play().catch(() => {});
            } else if (pc.connectionState === "connecting") {
              setConnected(false);
              setStatus("Connecting to participant...");
            } else if (pc.connectionState === "disconnected") {
              setConnected(false);
              setStatus("Participant disconnected. Waiting to reconnect...");
            } else if (pc.connectionState === "failed") {
              setConnected(false);
              setStatus("Connection failed. Please re-enter the interview.");
            } else if (pc.connectionState === "closed") {
              setConnected(false);
            }
          };

          pc.oniceconnectionstatechange = () => {
            if (isCurrentSession()) {
              console.log("ICE state:", pc.iceConnectionState);
            }
          };

          unsubscribeCandidates = onSnapshot(
            candidatesRef,
            (snapshot) => {
              snapshot.docChanges().forEach(async (change) => {
                if (change.type !== "added" || !isCurrentSession()) {
                  return;
                }

                const data = change.doc.data();

                if (data.senderId === user.uid || !data.candidate) {
                  return;
                }

                const candidate = new RTCIceCandidate(data.candidate);

                if (pc.remoteDescription) {
                  try {
                    await pc.addIceCandidate(candidate);
                  } catch (error) {
                    console.error("Could not add remote ICE candidate:", error);
                  }
                } else {
                  pendingCandidates.push(candidate);
                }
              });
            },
            (error) => console.error("ICE listener error:", error)
          );

          if (host) {
            try {
              await setDoc(
                roomRef,
                {
                  activeSessionId: sessionId,
                  activeSessionBy: user.uid,
                  activeSessionUpdatedAt: serverTimestamp(),
                },
                { merge: true }
              );

              if (!isCurrentSession()) return;

              unsubscribeAnswer = onSnapshot(
                answerRef,
                async (snapshot) => {
                  if (
                    !snapshot.exists() ||
                    !isCurrentSession() ||
                    pc.remoteDescription
                  ) {
                    return;
                  }

                  const answerData = snapshot.data();

                  if (answerData.createdBy === user.uid) return;

                  try {
                    await pc.setRemoteDescription(
                      new RTCSessionDescription({
                        type: answerData.type,
                        sdp: answerData.sdp,
                      })
                    );

                    await flushPendingCandidates();

                    if (isCurrentSession()) {
                      setStatus("Answer received. Connecting...");
                    }
                  } catch (error) {
                    console.error("Could not apply answer:", error);
                  }
                },
                (error) => console.error("Answer listener error:", error)
              );

              const offer = await pc.createOffer();

              if (!isCurrentSession()) return;

              await pc.setLocalDescription(offer);

              if (!isCurrentSession()) return;

              await setDoc(offerRef, {
                type: offer.type,
                sdp: offer.sdp,
                createdBy: user.uid,
                createdAt: serverTimestamp(),
              });

              setStatus("Offer sent. Waiting for participant...");
            } catch (error) {
              console.error("Host signaling error:", error);

              if (isCurrentSession()) {
                setStatus("Could not start the interview connection.");
              }
            }
          } else {
            setStatus("Waiting for the host's offer...");

            unsubscribeOffer = onSnapshot(
              offerRef,
              async (snapshot) => {
                if (
                  !snapshot.exists() ||
                  !isCurrentSession() ||
                  pc.remoteDescription
                ) {
                  return;
                }

                const offerData = snapshot.data();

                if (offerData.createdBy === user.uid) return;

                try {
                  await pc.setRemoteDescription(
                    new RTCSessionDescription({
                      type: offerData.type,
                      sdp: offerData.sdp,
                    })
                  );

                  await flushPendingCandidates();

                  if (!isCurrentSession()) return;

                  const answer = await pc.createAnswer();

                  await pc.setLocalDescription(answer);

                  if (!isCurrentSession()) return;

                  await setDoc(answerRef, {
                    type: answer.type,
                    sdp: answer.sdp,
                    createdBy: user.uid,
                    createdAt: serverTimestamp(),
                  });

                  setStatus("Answer sent. Connecting to host...");
                } catch (error) {
                  console.error("Could not process offer:", error);

                  if (isCurrentSession()) {
                    setStatus("Could not connect to the host.");
                  }
                }
              },
              (error) => console.error("Offer listener error:", error)
            );
          }
        };

        if (currentUserIsHost) {
          const newSessionRef = doc(
            collection(db, "interviewRooms", interviewId, "sessions")
          );

          await startSession(newSessionRef.id, true);
        } else {
          setStatus("Waiting for the host to start the connection...");

          roomUnsubscribeRef.current = onSnapshot(
            roomRef,
            (snapshot) => {
              if (cancelled || !snapshot.exists()) return;

              const sessionId = snapshot.data().activeSessionId;

              if (
                sessionId &&
                sessionId !== activeSessionIdRef.current
              ) {
                startSession(sessionId, false);
              }
            },
            (error) => {
              console.error("Interview room listener error:", error);
              setStatus("Could not listen for the interview session.");
            }
          );
        }
      } catch (error) {
        console.error("Interview setup error:", error);

        if (!cancelled) {
          setStatus("Could not load the interview.");
        }
      }
    };

    startInterview();

    return () => {
      cancelled = true;
      sessionStartTokenRef.current += 1;

      if (roomUnsubscribeRef.current) {
        roomUnsubscribeRef.current();
        roomUnsubscribeRef.current = null;
      }

      activeSessionIdRef.current = null;
      cleanupSession();
    };
  }, [user, interviewId]);

  const toggleMic = () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const nextValue = !micOn;

    stream.getAudioTracks().forEach((track) => {
      track.enabled = nextValue;
    });

    setMicOn(nextValue);
  };

  const toggleCamera = () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const nextValue = !cameraOn;

    stream.getVideoTracks().forEach((track) => {
      track.enabled = nextValue;
    });

    setCameraOn(nextValue);
  };

  const toggleRemoteAudio = async () => {
    const video = remoteVideoRef.current;
    if (!video) return;

    const shouldMute = !remoteMuted;
    video.muted = shouldMute;
    setRemoteMuted(shouldMute);

    if (!shouldMute) {
      try {
        await video.play();
      } catch (error) {
        console.warn("Could not play remote audio:", error.message);
      }
    }
  };

  // Complete the interview for both participants
  const endInterview = async () => {
    if (ending || !user) return;

    const confirmed = window.confirm(
      "End this interview for both participants?"
    );

    if (!confirmed) return;

    setEnding(true);

    try {
      await updateDoc(doc(db, "interviews", interviewId), {
        status: "completed",
        completedAt: serverTimestamp(),
        completedBy: user.uid,
      });

      setInterviewEnded(true);
      setConnected(false);
      setStatus("Interview ended.");

      sessionStartTokenRef.current += 1;

      if (roomUnsubscribeRef.current) {
        roomUnsubscribeRef.current();
        roomUnsubscribeRef.current = null;
      }

      activeSessionIdRef.current = null;
      cleanupSession();

      navigate("/interviews", { replace: true });
    } catch (error) {
      console.error("Could not complete interview:", error);

      alert(
        "Could not save the interview as completed. Please check your connection and try again."
      );

      setEnding(false);
    }
  };

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-cyan-400" />
          <p className="text-slate-400">Loading your interview...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white px-4 py-6 sm:px-6 lg:px-10">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-cyan-300 text-xl">
                TM
              </div>
              <span className="text-sm tracking-[0.25em] font-semibold text-cyan-300">
                TALENTMEET
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Interview Room
            </h1>

            <p className="text-slate-400 mt-2">
              {interview?.title || "Live interview session"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  connected ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
              <span className="text-sm text-slate-200">
                {connected ? "Connected" : "Connecting"}
              </span>
            </div>

            <div className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 font-mono text-sm">
              {formatTime(elapsedSeconds)}
            </div>
          </div>
        </header>

        <div className="mb-5 flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3">
          <span className={connected ? "text-emerald-400" : "text-amber-400"}>
            ●
          </span>
          <div>
            <p className="text-sm font-medium">{status}</p>
            <p className="text-xs text-slate-500 mt-1">
              {isHost
                ? "You are hosting this interview"
                : "You are the invited participant"}
            </p>
          </div>
        </div>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 shadow-2xl shadow-black/20">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div>
                <h2 className="font-semibold">{otherParticipantName}</h2>
                <p className="text-xs text-slate-500">Remote video</p>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full ${
                connected
                  ? "bg-emerald-400/10 text-emerald-300"
                  : "bg-amber-400/10 text-amber-300"
              }`}>
                {connected ? "LIVE" : "WAITING"}
              </span>
            </div>

            <div className="relative aspect-video bg-black">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted={remoteMuted}
                className="absolute inset-0 h-full w-full object-cover"
              />

              {!connected && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 pointer-events-none">
                  <div className="text-center px-4">
                    <div className="mx-auto mb-3 h-14 w-14 rounded-full border border-slate-700 bg-slate-800 flex items-center justify-center text-2xl">
                      👤
                    </div>
                    <p className="font-medium text-slate-200">
                      Waiting for participant
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      Their video will appear here
                    </p>
                  </div>
                </div>
              )}

              <div className="absolute bottom-3 left-3 rounded-lg bg-black/60 backdrop-blur px-3 py-2 text-sm">
                {otherParticipantName}
              </div>

              <button
                onClick={toggleRemoteAudio}
                className="absolute bottom-3 right-3 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-600 px-3 py-2 text-sm font-medium transition"
              >
                {remoteMuted ? "🔊 Unmute audio" : "🔇 Mute audio"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl overflow-hidden border border-cyan-400/20 bg-slate-900 shadow-2xl shadow-black/20">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div>
                <h2 className="font-semibold">You</h2>
                <p className="text-xs text-slate-500">Your camera</p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-400/10 text-cyan-300">
                YOU
              </span>
            </div>

            <div className="relative aspect-video bg-black">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
              />

              {!cameraOn && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
                  <div className="text-center">
                    <div className="text-4xl mb-3">📷</div>
                    <p className="text-slate-300">Camera is off</p>
                  </div>
                </div>
              )}

              <div className="absolute bottom-3 left-3 rounded-lg bg-black/60 backdrop-blur px-3 py-2 text-sm">
                {user.displayName || user.email || "You"}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={toggleMic}
              className={`min-w-32 rounded-xl px-5 py-3 font-medium transition ${
                micOn
                  ? "bg-slate-800 hover:bg-slate-700 border border-slate-700"
                  : "bg-red-500/15 text-red-300 border border-red-500/30"
              }`}
            >
              {micOn ? "🎤 Microphone On" : "🔇 Microphone Off"}
            </button>

            <button
              onClick={toggleCamera}
              className={`min-w-32 rounded-xl px-5 py-3 font-medium transition ${
                cameraOn
                  ? "bg-slate-800 hover:bg-slate-700 border border-slate-700"
                  : "bg-red-500/15 text-red-300 border border-red-500/30"
              }`}
            >
              {cameraOn ? "📹 Camera On" : "📷 Camera Off"}
            </button>

            <button
              onClick={endInterview}
              disabled={ending || interviewEnded}
              className="min-w-32 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 font-semibold transition shadow-lg shadow-red-950/30"
            >
              {ending ? "Ending Interview..." : "End Interview"}
            </button>
          </div>

          <p className="text-center text-xs text-slate-500 mt-4">
            Ending the interview disconnects both participants.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
          <h2 className="text-lg font-semibold mb-5">Interview Details</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">
                Date
              </p>
              <p className="font-medium">
                {interview?.date || "Not specified"}
              </p>
            </div>

            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">
                Scheduled time
              </p>
              <p className="font-medium">
                {interview?.time || "Not specified"}
              </p>
            </div>

            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-4 sm:col-span-2">
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">
                Description
              </p>
              <p className="text-slate-300 leading-relaxed">
                {interview?.description || "No description provided."}
              </p>
            </div>
          </div>
        </section>

        <footer className="py-6 text-center text-xs text-slate-600">
          TalentMeet · Connect. Interview. Grow.
        </footer>
      </div>
    </main>
  );
}

export default InterviewRoom;