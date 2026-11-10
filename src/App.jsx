import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import Profile from "./pages/Profile";
import Discover from "./pages/Discover";
import PublicProfile from "./pages/PublicProfile";
import Connections from "./pages/Connections";
import Chat from "./pages/Chat";
import Interviews from "./pages/Interviews";
import InterviewRoom from "./pages/InterviewRoom";
import PreJoin from "./pages/PreJoin";
import CreateInterviewRoom from "./pages/CreateInterviewRoom";
import JoinInterviewInvite from "./pages/JoinInterviewInvite";
import InstantInterviewRoom from "./pages/InstantInterviewRoom";

import { auth, db } from "./firebase";

function App() {
  useEffect(() => {
    let currentUser = null;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      currentUser = user;

      if (!user) return;

      const userRef = doc(db, "publicProfiles", user.uid);

      setDoc(
        userRef,
        {
          online: true,
          lastSeen: serverTimestamp(),
        },
        { merge: true }
      ).catch((error) => {
        console.error("Error setting online status:", error);
      });
    });

    const handleOffline = async () => {
      if (!currentUser) return;

      try {
        await updateDoc(
          doc(db, "publicProfiles", currentUser.uid),
          {
            online: false,
            lastSeen: serverTimestamp(),
          }
        );
      } catch (error) {
        console.error("Error setting offline status:", error);
      }
    };

    window.addEventListener("beforeunload", handleOffline);

    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", handleOffline);
    };
  }, []);

  return (
    <BrowserRouter>
      <Navbar />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />

        <Route
          path="/discover"
          element={
            <ProtectedRoute>
              <Discover />
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile/:userId"
          element={
            <ProtectedRoute>
              <PublicProfile />
            </ProtectedRoute>
          }
        />

        <Route
          path="/connections"
          element={
            <ProtectedRoute>
              <Connections />
            </ProtectedRoute>
          }
        />

        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          }
        />

        <Route
          path="/chat/:userId"
          element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          }
        />

        <Route
          path="/interviews"
          element={
            <ProtectedRoute>
              <Interviews />
            </ProtectedRoute>
          }
        />

        <Route
          path="/create-room"
          element={
            <ProtectedRoute>
              <CreateInterviewRoom />
            </ProtectedRoute>
          }
        />

        <Route
          path="/join/:inviteId"
          element={<JoinInterviewInvite />}
        />

        <Route
          path="/instant-room/:inviteId"
          element={
            <ProtectedRoute>
              <InstantInterviewRoom />
            </ProtectedRoute>
          }
        />

        <Route
          path="/interview/:interviewId"
          element={
            <ProtectedRoute>
              <InterviewRoom />
            </ProtectedRoute>
          }
        />

        <Route
          path="/interview/:interviewId/prejoin"
          element={
            <ProtectedRoute>
              <PreJoin />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;