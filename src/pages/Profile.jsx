import { useEffect, useState } from "react";
import { updateProfile } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

function Profile() {
  const user = auth.currentUser;

  const [name, setName] = useState(user?.displayName || "");
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState("");
  const [profileImage, setProfileImage] = useState("");
  useEffect(() => {
  const loadProfile = async () => {
    if (!user) return;

    const profileRef = doc(db, "users", user.uid);

    const profileSnap = await getDoc(profileRef);

    if (profileSnap.exists()) {
      const data = profileSnap.data();

      setName(data.name || user.displayName || "");
      setBio(data.bio || "");
      setSkills(data.skills || "");
    }
  };

  loadProfile();
}, [user]);

 const handleSave = async (e) => {
  e.preventDefault();

  try {
    await updateProfile(user, {
      displayName: name,
    });

   await setDoc(doc(db, "users", user.uid), {
  name: name,
  email: user.email,
  bio: bio,
  skills: skills,
});

await setDoc(doc(db, "publicProfiles", user.uid), {
  name: name,
  bio: bio,
  skills: skills,
});

    alert("Profile updated successfully!");
  } catch (error) {
    alert(error.message);
  }
};

  return (
    <main className="min-h-screen bg-gray-950 text-white px-6 py-12">
      <div className="max-w-3xl mx-auto">

        <h1 className="text-4xl font-bold mb-2">
          My Profile
        </h1>

        <p className="text-gray-400 mb-10">
          Manage your TalentMeet profile.
        </p>

        <form
          onSubmit={handleSave}
          className="bg-gray-900 border border-gray-800 rounded-xl p-8 space-y-6"
        >
            {/* Profile Picture */}
<div className="flex items-center gap-5">
  <div className="w-20 h-20 rounded-full bg-gray-800 border border-gray-700 overflow-hidden flex items-center justify-center text-3xl">
  {profileImage ? (
    <img
      src={profileImage}
      alt="Profile Preview"
      className="w-full h-full object-cover"
    />
  ) : (
    "👤"
  )}
</div>

  <div>
    <h2 className="text-lg font-semibold">
      Profile Picture
    </h2>

    <p className="text-sm text-gray-400">
  Choose a profile picture from your device.
</p>

<input
  type="file"
  accept="image/*"
  className="mt-2 text-sm text-gray-400"
  onChange={(e) => {
    const file = e.target.files[0];

    if (file) {
      const imageUrl = URL.createObjectURL(file);
      setProfileImage(imageUrl);
    }
  }}
/>
  </div>
</div>

          {/* Full Name */}
          <div>
            <label className="block text-gray-300 mb-2">
              Full Name
            </label>

            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 outline-none focus:border-blue-500"
              placeholder="Enter your full name"
              required
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-gray-300 mb-2">
              Email
            </label>

            <input
              type="email"
              value={user?.email || ""}
              disabled
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-400 cursor-not-allowed"
            />
          </div>

          {/* Bio */}
          <div>
            <label className="block text-gray-300 mb-2">
              Bio
            </label>

            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows="4"
              placeholder="Tell people a little about yourself..."
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 outline-none focus:border-blue-500 resize-none"
            />
          </div>
          {/* Skills */}
<div>
  <label className="block text-gray-300 mb-2">
    Skills
  </label>

  <input
    type="text"
    value={skills}
    onChange={(e) => setSkills(e.target.value)}
    placeholder="e.g. React, JavaScript, Firebase"
    className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 outline-none focus:border-blue-500"
  />
</div>
          {/* Save Button */}
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold transition"
          >
            Save Changes
          </button>

        </form>

      </div>
    </main>
  );
}

export default Profile;