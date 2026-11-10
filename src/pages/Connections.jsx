import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  getDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Link } from "react-router-dom";
import { auth, db } from "../firebase";

function Connections() {
  const [requests, setRequests] = useState([]);
  const [acceptedConnections, setAcceptedConnections] = useState([]);
  const [connectionProfiles, setConnectionProfiles] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // Get pending requests
        const pendingQuery = query(
          collection(db, "connections"),
          where("receiverId", "==", user.uid),
          where("status", "==", "pending")
        );

        const pendingSnapshot = await getDocs(pendingQuery);

        const incomingRequests = pendingSnapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }));

        setRequests(incomingRequests);

        // Get accepted connections sent by current user
        const sentAcceptedQuery = query(
          collection(db, "connections"),
          where("senderId", "==", user.uid),
          where("status", "==", "accepted")
        );

        const sentAcceptedSnapshot = await getDocs(
          sentAcceptedQuery
        );

        // Get accepted connections received by current user
        const receivedAcceptedQuery = query(
          collection(db, "connections"),
          where("receiverId", "==", user.uid),
          where("status", "==", "accepted")
        );

        const receivedAcceptedSnapshot = await getDocs(
          receivedAcceptedQuery
        );

        const sentConnections = sentAcceptedSnapshot.docs.map(
          (document) => ({
            id: document.id,
            ...document.data(),
          })
        );

        const receivedConnections =
          receivedAcceptedSnapshot.docs.map((document) => ({
            id: document.id,
            ...document.data(),
          }));

        const allConnections = [
          ...sentConnections,
          ...receivedConnections,
        ];

        setAcceptedConnections(allConnections);

        // Load public profiles
        const profiles = {};

        for (const connection of allConnections) {
          const otherUserId =
            connection.senderId === user.uid
              ? connection.receiverId
              : connection.senderId;

          const profileRef = doc(
            db,
            "publicProfiles",
            otherUserId
          );

          const profileSnap = await getDoc(profileRef);

          if (profileSnap.exists()) {
            profiles[otherUserId] = profileSnap.data();
          }
        }

        setConnectionProfiles(profiles);
      } catch (error) {
        console.error("Error loading connections:", error);
        alert(error.message);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleResponse = async (requestId, status) => {
    try {
      await updateDoc(doc(db, "connections", requestId), {
        status: status,
      });

      setRequests((currentRequests) =>
        currentRequests.filter(
          (request) => request.id !== requestId
        )
      );

      if (status === "accepted") {
        const acceptedRequest = requests.find(
          (request) => request.id === requestId
        );

        if (acceptedRequest) {
          setAcceptedConnections((currentConnections) => [
            ...currentConnections,
            {
              ...acceptedRequest,
              status: "accepted",
            },
          ]);
        }
      }
    } catch (error) {
      console.error("Error updating connection:", error);
      alert(error.message);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white px-6 py-12">
      <div className="max-w-3xl mx-auto">

        <h1 className="text-4xl font-bold mb-2">
          Connections
        </h1>

        <p className="text-gray-400 mb-10">
          Manage your connection requests and connections.
        </p>

        {/* Pending Requests */}

        <h2 className="text-2xl font-semibold mb-4">
          Pending Requests
        </h2>

        {loading ? (
          <p className="text-gray-400 mb-10">
            Loading requests...
          </p>
        ) : requests.length === 0 ? (
          <p className="text-gray-400 mb-10">
            No pending connection requests.
          </p>
        ) : (
          <div className="space-y-4 mb-12">
            {requests.map((request) => (
              <div
                key={request.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-6"
              >
                <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-xl font-bold mb-4">
                  ?
                </div>

                <p className="text-lg font-semibold">
                  Someone wants to connect with you.
                </p>

                <p className="text-sm text-gray-500 mt-2">
                  User ID: {request.senderId}
                </p>

                <p className="text-sm text-yellow-400 mt-2">
                  Status: {request.status}
                </p>

                <div className="flex gap-4 mt-6">
                  <button
                    onClick={() =>
                      handleResponse(request.id, "accepted")
                    }
                    className="bg-green-600 hover:bg-green-700 px-5 py-2 rounded-lg font-semibold"
                  >
                    Accept
                  </button>

                  <button
                    onClick={() =>
                      handleResponse(request.id, "rejected")
                    }
                    className="bg-red-600 hover:bg-red-700 px-5 py-2 rounded-lg font-semibold"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* My Connections */}

        <h2 className="text-2xl font-semibold mb-4">
          My Connections
        </h2>

        {acceptedConnections.length === 0 ? (
          <p className="text-gray-400">
            You don't have any connections yet.
          </p>
        ) : (
          <div className="space-y-4">
            {acceptedConnections.map((connection) => {
              const currentUserId = auth.currentUser?.uid;

              const otherUserId =
                connection.senderId === currentUserId
                  ? connection.receiverId
                  : connection.senderId;

              const profile =
                connectionProfiles[otherUserId];

              return (
                <div
                  key={connection.id}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-6"
                >
                  <div className="w-14 h-14 rounded-full bg-green-600 flex items-center justify-center text-xl font-bold mb-4">
                    {(profile?.name || "U")
                      .charAt(0)
                      .toUpperCase()}
                  </div>

                  <p className="text-xl font-semibold">
                    {profile?.name || "Connected User"}
                  </p>

                  <p className="text-gray-400 mt-2">
                    {profile?.bio || "No bio added yet."}
                  </p>

                  <p className="text-blue-400 mt-3">
                    {profile?.skills || "No skills added yet."}
                  </p>

                  <p
  className={`text-sm mt-3 ${
    profile?.online
      ? "text-green-400"
      : "text-gray-500"
  }`}
>
  {profile?.online ? "🟢 Online" : "⚪ Offline"}
</p>

                  {/* Chat Button */}
                  <Link
                    to={`/chat/${otherUserId}`}
                    className="inline-block mt-5 bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-lg font-semibold transition"
                  >
                    Chat
                  </Link>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </main>
  );
}

export default Connections;