import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc, addDoc, collection } from "firebase/firestore";
import { auth, db } from "../firebase";

function PublicProfile() {
  const { userId } = useParams();

  const [profile, setProfile] = useState(null);
  const [connectionSent, setConnectionSent] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      const profileRef = doc(db, "publicProfiles", userId);
      const profileSnap = await getDoc(profileRef);

      if (profileSnap.exists()) {
        setProfile(profileSnap.data());
      }
    };

    loadProfile();
  }, [userId]);

  const handleConnect = async () => {
    if (!auth.currentUser) return;

    console.log("CURRENT USER UID:", auth.currentUser.uid);
    console.log("TARGET USER ID:", userId);

    try {
      await addDoc(collection(db, "connections"), {
        senderId: auth.currentUser.uid,
        receiverId: userId,
        status: "pending",
      });

      setConnectionSent(true);
      alert("Connection request sent!");
    } catch (error) {
      console.error("CONNECTION ERROR:", error);
      alert(error.message);
    }
  };

  if (!profile) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading profile...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">

          <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-3xl font-bold mb-6">
            {(profile.name || "U").charAt(0).toUpperCase()}
          </div>

          <h1 className="text-4xl font-bold">
            {profile.name || "Unnamed User"}
          </h1>

          <p className="text-gray-400 mt-4">
            {profile.bio || "No bio added yet."}
          </p>

          <div className="mt-6">
            <h2 className="text-lg font-semibold mb-2">
              Skills
            </h2>

            <p className="text-blue-400">
              {profile.skills || "No skills added yet."}
            </p>
          </div>

          <button
            onClick={handleConnect}
            disabled={connectionSent}
            className={`mt-8 px-6 py-3 rounded-lg font-semibold transition ${
              connectionSent
                ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            {connectionSent ? "Request Sent" : "Connect"}
          </button>

        </div>
      </div>
    </main>
  );
}

export default PublicProfile;