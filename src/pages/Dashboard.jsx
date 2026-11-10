import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";

function Dashboard() {
  const navigate = useNavigate();
  const user = auth.currentUser;

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white px-6 py-12">
      <div className="max-w-6xl mx-auto">

        <div className="mb-10">
          <h1 className="text-4xl font-bold mb-3">
            Welcome, {user?.displayName || "User"} 👋
          </h1>

          <p className="text-gray-400">
            {user?.email}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-2">
              🎯 Interviews
            </h2>
            <p className="text-gray-400">
              Manage your upcoming interviews.
            </p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-2">
              💬 Messages
            </h2>
            <p className="text-gray-400">
              Chat with candidates and interviewers.
            </p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-2">
              🎥 Video Interviews
            </h2>
            <p className="text-gray-400">
              Join your live interview sessions.
            </p>
          </div>

        </div>

        <button
          onClick={handleLogout}
          className="mt-10 bg-red-600 hover:bg-red-700 px-6 py-3 rounded-lg font-semibold transition"
        >
          Logout
        </button>

      </div>
    </main>
  );
}

export default Dashboard;