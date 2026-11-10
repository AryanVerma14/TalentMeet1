import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../firebase";

function Navbar() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <nav className="bg-gray-900 border-b border-gray-800 text-white">
      <div className="max-w-7xl mx-auto px-6 py-4">

        <div className="flex items-center justify-between">

          {/* Logo */}
          <Link
            to="/"
            className="text-2xl font-bold text-blue-500"
          >
            TalentMeet
          </Link>

          {/* Navigation */}
          <div className="flex items-center gap-6">

            <Link
              to="/"
              className="hover:text-blue-400 transition"
            >
              Home
            </Link>

            {user ? (
              <>
                <Link
                  to="/profile"
                  className="hover:text-blue-400 transition"
                >
                  Profile
                </Link>

                <Link
                  to="/dashboard"
                  className="hover:text-blue-400 transition"
                >
                  Dashboard
                </Link>

                <Link
                  to="/discover"
                  className="hover:text-blue-400 transition"
                >
                  Discover
                </Link>

                <Link
                  to="/connections"
                  className="hover:text-blue-400 transition"
                >
                  Connections
                </Link>

                <Link
                  to="/chat"
                  className="hover:text-blue-400 transition"
                >
                  Chat
                </Link>

                <Link
                  to="/interviews"
                  className="hover:text-blue-400 transition"
                >
                  Interviews
                </Link>

                <button
                  onClick={handleLogout}
                  className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-semibold transition"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="hover:text-blue-400 transition"
                >
                  Login
                </Link>

                <Link
                  to="/signup"
                  className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-semibold transition"
                >
                  Sign Up
                </Link>
              </>
            )}

          </div>

        </div>

      </div>
    </nav>
  );
}

export default Navbar;