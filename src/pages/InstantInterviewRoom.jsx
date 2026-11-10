
import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  addDoc,
} from "firebase/firestore";
import { useNavigate, useParams } from "react-router-dom";
import { auth, db } from "../firebase";

const rtcConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

function InstantInterviewRoom() {
  const { inviteId } = useParams();
  const navigate = useNavigate();

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerRef = useRef(null);
  const streamRef = useRef(null);
  const unsubscribersRef = useRef([]);
  const startingRef = useRef(false);

  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState(null);
  const [accessGranted, setAccessGranted] = useState(false);
  const [error, setError] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [mediaLoading, setMediaLoading] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [mediaReady, setMediaReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("Not connected");

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
      navigate("/login", {
        state: { from: `/instant-room/${inviteId}` },
      });
      return;
    }

    let cancelled = false;

    async function checkRoomAccess() {
      setLoading(true);
      setError("");
      setInvite(null);
      setAccessGranted(false);

      try {
        const inviteSnapshot = await getDoc(
          doc(db, "interviewInvites", inviteId)
        );

        if (!inviteSnapshot.exists()) {
          throw new Error("This interview invitation does not exist.");
        }

        const inviteData = {
          id: inviteSnapshot.id,
          ...inviteSnapshot.data(),
        };

        if (cancelled) return;
        setInvite(inviteData);

        if (inviteData.createdBy === user.uid) {
          setAccessGranted(true);
          return;
        }

        const requestSnapshot = await getDoc(
          doc(
            db,
            "interviewInvites",
            inviteId,
            "requests",
            user.uid
          )
        );

        if (cancelled) return;

        if (
          requestSnapshot.exists() &&
          requestSnapshot.data().status === "approved"
        ) {
          setAccessGranted(true);
        } else {
          throw new Error(
            "You cannot enter until the host approves your request."
          );
        }
      } catch (err) {
        console.error("Room access check failed:", err);
        if (!cancelled) {
          setError(err.message || "Could not verify room access.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    checkRoomAccess();

    return () => {
      cancelled = true;
    };
  }, [authReady, user, inviteId, navigate]);

  // Get local camera and microphone after access has been verified.
  useEffect(() => {
    if (!accessGranted) return;

    let cancelled = false;
    let localStream = null;

    async function startCamera() {
      setMediaLoading(true);
      setMediaError("");

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            "Camera access requires localhost or a secure HTTPS connection."
          );
        }

        localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        if (cancelled) {
          localStream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = localStream;

        localStream.getVideoTracks().forEach((track) => {
          track.enabled = cameraOn;
        });

        localStream.getAudioTracks().forEach((track) => {
          track.enabled = micOn;
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }

        setMediaReady(true);
      } catch (err) {
        console.error("Media access failed:", err);

        if (!cancelled) {
          setMediaError(
            err.name === "NotAllowedError"
              ? "Camera or microphone permission was denied. Allow access in your browser settings."
              : err.message || "Could not access camera and microphone."
          );
        }
      } finally {
        if (!cancelled) setMediaLoading(false);
      }
    }

    startCamera();

    return () => {
      cancelled = true;

      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }

      if (streamRef.current === localStream) {
        streamRef.current = null;
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }

      setMediaReady(false);
    };
  }, [accessGranted]);

  // Establish a one-host/one-approved-guest WebRTC connection.
  useEffect(() => {
    if (!accessGranted || !mediaReady || !user || !invite) return;
    if (startingRef.current) return;

    startingRef.current = true;

    let cancelled = false;
    let peer = null;
    let localStream = streamRef.current;
    let unsubscribeSession = null;
    let unsubscribeOffer = null;
    let unsubscribeAnswer = null;
    let unsubscribeHostCandidates = null;
    let unsubscribeGuestCandidates = null;

    const basePath = ["interviewInvites", inviteId, "sessions", "current"];
    const sessionRef = doc(db, ...basePath);
    const offerRef = doc(db, ...basePath, "offer", "main");
    const answerRef = doc(db, ...basePath, "answer", "main");
    const hostCandidatesRef = collection(db, ...basePath, "hostCandidates");
    const guestCandidatesRef = collection(db, ...basePath, "guestCandidates");

    const isHost = invite.createdBy === user.uid;

    // ICE can arrive before the remote description. Queue it until ready.
    let remoteDescriptionReady = false;
    const pendingCandidates = [];

    async function addRemoteCandidate(candidateData) {
      if (!peer || !candidateData?.candidate) return;

      try {
        const candidate = new RTCIceCandidate(candidateData);

        if (!remoteDescriptionReady) {
          pendingCandidates.push(candidate);
        } else {
          await peer.addIceCandidate(candidate);
        }
      } catch (err) {
        console.error("Could not add ICE candidate:", err);
      }
    }

    async function flushPendingCandidates() {
      remoteDescriptionReady = true;

      while (pendingCandidates.length && peer) {
        const candidate = pendingCandidates.shift();

        try {
          await peer.addIceCandidate(candidate);
        } catch (err) {
          console.error("Could not add queued ICE candidate:", err);
        }
      }
    }

    async function startConnection() {
      if (!localStream || cancelled) return;

      setConnectionStatus(
        isHost ? "Waiting for guest..." : "Waiting for host offer..."
      );

      peer = new RTCPeerConnection(rtcConfiguration);
      peerRef.current = peer;

      localStream.getTracks().forEach((track) => {
        peer.addTrack(track, localStream);
      });

      peer.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      peer.onconnectionstatechange = () => {
        if (cancelled) return;

        const state = peer.connectionState;

        if (state === "connected") {
          setConnectionStatus("Connected");
        } else if (state === "connecting") {
          setConnectionStatus("Connecting...");
        } else if (state === "disconnected") {
          setConnectionStatus("Connection interrupted");
        } else if (state === "failed") {
          setConnectionStatus(
            "Connection failed. A TURN server may be needed for this network."
          );
        } else if (state === "closed") {
          setConnectionStatus("Disconnected");
        }
      };

      peer.onicecandidate = async (event) => {
        if (!event.candidate || cancelled) return;

        try {
          const candidate = event.candidate.toJSON();
          const target = isHost
            ? hostCandidatesRef
            : guestCandidatesRef;

          await addDoc(target, {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid ?? null,
            sdpMLineIndex: candidate.sdpMLineIndex ?? null,
          });
        } catch (err) {
          console.error("Could not save ICE candidate:", err);
          if (!cancelled) {
            setError(
              "Could not exchange connection details. Check Firestore rules."
            );
          }
        }
      };

      if (isHost) {
        // Only create a session if this is a fresh room.
        const existingSession = await getDoc(sessionRef);

        if (cancelled) return;

        if (existingSession.exists()) {
          throw new Error(
            "A signaling session already exists for this invitation. Stop here and reset the test session safely before retrying."
          );
        }

        await setDoc(sessionRef, {
          hostId: user.uid,
          status: "waiting",
          createdAt: new Date(),
        });

        if (cancelled) return;

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);

        await setDoc(offerRef, {
          type: offer.type,
          sdp: offer.sdp,
        });

        if (cancelled) return;

        unsubscribeAnswer = onSnapshot(
          answerRef,
          async (snapshot) => {
            if (cancelled || !snapshot.exists()) return;
            if (peer.currentRemoteDescription) return;

            try {
              await peer.setRemoteDescription(
                new RTCSessionDescription(snapshot.data())
              );

              await flushPendingCandidates();
            } catch (err) {
              console.error("Could not apply guest answer:", err);
              setError("Could not connect to the guest's answer.");
            }
          },
          (err) => {
            console.error("Answer listener failed:", err);
            setError("Could not listen for the guest's answer.");
          }
        );
      } else {
        // The guest waits for the host's session and offer.
        unsubscribeSession = onSnapshot(
          sessionRef,
          (snapshot) => {
            if (cancelled) return;

            if (!snapshot.exists()) {
              setConnectionStatus("Waiting for host to open the room...");
              return;
            }

            unsubscribeSession?.();
            unsubscribeSession = null;

            unsubscribeOffer = onSnapshot(
              offerRef,
              async (offerSnapshot) => {
                if (cancelled || !offerSnapshot.exists()) return;
                if (peer.currentRemoteDescription) return;

                try {
                  const offer = offerSnapshot.data();

                  await peer.setRemoteDescription(
                    new RTCSessionDescription(offer)
                  );

                  await flushPendingCandidates();

                  const answer = await peer.createAnswer();
                  await peer.setLocalDescription(answer);

                  await setDoc(answerRef, {
                    type: answer.type,
                    sdp: answer.sdp,
                  });

                  setConnectionStatus("Connecting to host...");
                } catch (err) {
                  console.error("Could not answer host offer:", err);
                  setError("Could not respond to the host's offer.");
                }
              },
              (err) => {
                console.error("Offer listener failed:", err);
                setError("Could not listen for the host's offer.");
              }
            );
          },
          (err) => {
            console.error("Session listener failed:", err);
            setError("Could not listen for the room session.");
          }
        );
      }

      // Host reads guest ICE; guest reads host ICE.
      const remoteCandidates = isHost
        ? guestCandidatesRef
        : hostCandidatesRef;

      const unsubscribeRemoteCandidates = onSnapshot(
        remoteCandidates,
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
              addRemoteCandidate(change.doc.data());
            }
          });
        },
        (err) => {
          console.error("ICE listener failed:", err);
          setError("Could not receive connection candidates.");
        }
      );

      unsubscribeGuestCandidates = unsubscribeRemoteCandidates;
    }

    startConnection().catch((err) => {
      console.error("Could not start WebRTC:", err);
      if (!cancelled) {
        setError(err.message || "Could not start the video connection.");
        setConnectionStatus("Connection could not start");
      }
    });

    return () => {
      cancelled = true;
      startingRef.current = false;

      unsubscribeSession?.();
      unsubscribeOffer?.();
      unsubscribeAnswer?.();
      unsubscribeHostCandidates?.();
      unsubscribeGuestCandidates?.();

      peer?.close();

      if (peerRef.current === peer) {
        peerRef.current = null;
      }

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
    };
  }, [accessGranted, mediaReady, user, invite, inviteId]);

  function toggleCamera() {
    const nextValue = !cameraOn;
    setCameraOn(nextValue);

    streamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = nextValue;
    });
  }

  function toggleMicrophone() {
    const nextValue = !micOn;
    setMicOn(nextValue);

    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = nextValue;
    });
  }

  function leaveRoom() {
    peerRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    navigate(`/join/${inviteId}`);
  }

  if (!authReady || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950 p-6 text-white">
        Checking interview room access...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950 p-6 text-white">
        Redirecting to sign in...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => navigate(`/join/${inviteId}`)}
            className="text-gray-400 hover:text-white"
          >
            ← Back to invitation
          </button>

          <span className="rounded-full border border-gray-700 px-4 py-2 text-sm">
            {connectionStatus}
          </span>
        </div>

        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6 sm:p-8">
          <p className="text-sm font-semibold text-blue-400">TALENTMEET</p>

          <h1 className="mt-2 text-3xl font-bold">
            {invite?.title || "Instant Interview Room"}
          </h1>

          {accessGranted ? (
            <>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="overflow-hidden rounded-xl border border-gray-700 bg-black">
                  <div className="border-b border-gray-800 px-4 py-3 text-sm font-medium">
                    You ({user.displayName || user.email})
                  </div>

                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className={`aspect-video w-full object-cover ${
                      cameraOn && mediaReady ? "" : "hidden"
                    }`}
                  />

                  {(!cameraOn || !mediaReady) && (
                    <div className="flex aspect-video items-center justify-center text-gray-400">
                      {mediaLoading
                        ? "Starting camera..."
                        : "Your camera is off"}
                    </div>
                  )}
                </div>

                <div className="overflow-hidden rounded-xl border border-gray-700 bg-black">
                  <div className="border-b border-gray-800 px-4 py-3 text-sm font-medium">
                    Other participant
                  </div>

                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="aspect-video w-full object-cover"
                  />

                  {!remoteVideoRef.current?.srcObject && (
                    <div className="flex aspect-video items-center justify-center text-gray-400">
                      Waiting for the other participant...
                    </div>
                  )}
                </div>
              </div>

              {mediaError && (
                <p className="mt-4 rounded-lg border border-red-800 bg-red-950/30 p-4 text-sm text-red-300">
                  {mediaError}
                </p>
              )}

              {error && (
                <p className="mt-4 break-word rounded-lg border border-red-800 bg-red-950/30 p-4 text-sm text-red-300">
                  {error}
                </p>
              )}

              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button
                  onClick={toggleCamera}
                  disabled={!mediaReady}
                  className="rounded-full bg-gray-700 px-5 py-3 font-semibold hover:bg-gray-600 disabled:opacity-50"
                >
                  {cameraOn ? "Turn Camera Off" : "Turn Camera On"}
                </button>

                <button
                  onClick={toggleMicrophone}
                  disabled={!mediaReady}
                  className="rounded-full bg-gray-700 px-5 py-3 font-semibold hover:bg-gray-600 disabled:opacity-50"
                >
                  {micOn ? "Mute Microphone" : "Unmute Microphone"}
                </button>

                <button
                  onClick={leaveRoom}
                  className="rounded-full bg-red-600 px-5 py-3 font-semibold hover:bg-red-700"
                >
                  Leave Room
                </button>
              </div>

              <p className="mt-5 text-center text-xs text-gray-500">
                Keep both participants signed in and this page open while testing.
              </p>
            </>
          ) : (
            <div className="mt-6 rounded-xl border border-red-800 bg-red-950/30 p-5">
              <h2 className="font-semibold text-red-300">
                Room access unavailable
              </h2>

              <p className="mt-2 break-word text-sm text-gray-300">
                {error || "The host has not approved your request."}
              </p>

              <button
                onClick={() => navigate(`/join/${inviteId}`)}
                className="mt-4 rounded-lg bg-blue-600 px-5 py-2 font-semibold hover:bg-blue-700"
              >
                Return to invitation
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default InstantInterviewRoom;
