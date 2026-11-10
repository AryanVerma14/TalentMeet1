import { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile, } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, setDoc } from "firebase/firestore";

function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSignup = async (e) => {
    e.preventDefault();

    try {
      const userCredential = await createUserWithEmailAndPassword(
  auth,
  email,
  password
);

await updateProfile(userCredential.user, {
  displayName: name,
});

await setDoc(doc(db, "users", userCredential.user.uid), {
  name: name,
  email: email,
  bio: "",
  skills: "",
});

await setDoc(doc(db, "publicProfiles", userCredential.user.uid), {
  name: name,
  bio: "",
  skills: "",
});

      alert("Account created successfully!");
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md">

        <h1 className="text-3xl font-bold text-center mb-2">
          Create Your Account
        </h1>

        <p className="text-gray-400 text-center mb-8">
          Join TalentMeet today
        </p>

        <form onSubmit={handleSignup} className="space-y-5">

          <div>
            <label className="block text-sm text-gray-300 mb-2">
              Full Name
            </label>

            <input
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 outline-none focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-2">
              Email
            </label>

            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 outline-none focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-2">
              Password
            </label>

            <input
              type="password"
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 outline-none focus:border-blue-500"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-lg font-semibold transition"
          >
            Create Account
          </button>

        </form>

      </div>
    </main>
  );
}

export default Signup;