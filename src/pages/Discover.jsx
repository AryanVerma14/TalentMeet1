import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

function Discover() {
  const [profiles, setProfiles] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const loadProfiles = async () => {
      const snapshot = await getDocs(collection(db, "publicProfiles"));

      const profileList = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setProfiles(profileList);
    };

    loadProfiles();
  }, []);

  const filteredProfiles = profiles.filter((profile) => {
    const searchText = search.toLowerCase();

    return (
      profile.name?.toLowerCase().includes(searchText) ||
      profile.skills?.toLowerCase().includes(searchText)
    );
  });

  return (
    <main className="min-h-screen bg-gray-950 text-white px-6 py-12">
      <div className="max-w-6xl mx-auto">

        <h1 className="text-4xl font-bold mb-2">
          Discover People
        </h1>

        <p className="text-gray-400 mb-10">
          Find talented people on TalentMeet.
        </p>

        <input
          type="text"
          placeholder="Search by name or skills..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 mb-8 text-white outline-none focus:border-blue-500"
        />

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProfiles.length === 0 ? (
            <p className="text-gray-400">
              No profiles found.
            </p>
          ) : (
            filteredProfiles.map((profile) => (
              <Link
                key={profile.id}
                to={`/profile/${profile.id}`}
                className="block bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-blue-500 transition"
              >
                <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-xl font-bold mb-4">
                  {(profile.name || "U").charAt(0).toUpperCase()}
                </div>

                <h2 className="text-xl font-semibold">
                  {profile.name || "Unnamed User"}
                </h2>

                <p className="text-gray-400 mt-3">
                  {profile.bio || "No bio added yet."}
                </p>

                <p className="text-blue-400 mt-4">
                  {profile.skills || "No skills added yet."}
                </p>
              </Link>
            ))
          )}
        </div>

      </div>
    </main>
  );
}

export default Discover;