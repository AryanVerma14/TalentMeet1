import { useEffect, useState } from "react";
import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  Timestamp,
  doc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useParams } from "react-router-dom";
import { auth, db } from "../firebase";

function Chat() {
  const { userId } = useParams();

  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [otherUser, setOtherUser] = useState(null);
  const [isOnline, setIsOnline] = useState(false);

  // Get logged-in user
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);

  // Load other user's profile in real time
  useEffect(() => {
    if (!userId) return;

    const profileRef = doc(db, "publicProfiles", userId);

    const unsubscribe = onSnapshot(
      profileRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const profileData = snapshot.data();

          setOtherUser(profileData);

          // Check online status
          if (profileData.online === true) {
            setIsOnline(true);
          } else {
            setIsOnline(false);
          }
        }
      },
      (error) => {
        console.error("Error loading user profile:", error);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  // Load private conversation
  useEffect(() => {
    if (!user || !userId) return;

    // Messages sent by current user
    const sentQuery = query(
      collection(db, "messages"),
      where("senderId", "==", user.uid),
      where("receiverId", "==", userId)
    );

    // Messages received from other user
    const receivedQuery = query(
      collection(db, "messages"),
      where("senderId", "==", userId),
      where("receiverId", "==", user.uid)
    );

    let sentMessages = [];
    let receivedMessages = [];

    const updateMessages = () => {
      const allMessages = [
        ...sentMessages,
        ...receivedMessages,
      ];

      allMessages.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;

        return aTime - bTime;
      });

      setMessages(allMessages);
    };

    const unsubscribeSent = onSnapshot(
      sentQuery,
      (snapshot) => {
        sentMessages = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }));

        updateMessages();
      },
      (error) => {
        console.error("Error loading sent messages:", error);
      }
    );

    const unsubscribeReceived = onSnapshot(
      receivedQuery,
      (snapshot) => {
        receivedMessages = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }));

        updateMessages();
      },
      (error) => {
        console.error("Error loading received messages:", error);
      }
    );

    return () => {
      unsubscribeSent();
      unsubscribeReceived();
    };
  }, [user, userId]);

  // Send message
  const handleSend = async (e) => {
    e.preventDefault();

    if (!message.trim() || !user || !userId) return;

    try {
      await addDoc(collection(db, "messages"), {
        text: message.trim(),
        senderId: user.uid,
        receiverId: userId,
        participants: [user.uid, userId],
        createdAt: Timestamp.now(),
      });

      setMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
      alert(error.message);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white px-6 py-12">
      <div className="max-w-3xl mx-auto">

        <h1 className="text-4xl font-bold mb-2">
          Chat
        </h1>

        <p className="text-gray-400 mb-8">
          Private conversation
        </p>

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">

          {/* Chat Header */}
          <div className="p-5 border-b border-gray-800 flex items-center gap-4">

            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-xl font-bold">
              {(otherUser?.name || "U")
                .charAt(0)
                .toUpperCase()}
            </div>

            <div>
              <h2 className="text-xl font-semibold">
                {otherUser?.name || "Loading..."}
              </h2>

              {isOnline ? (
                <p className="text-green-400 text-sm mt-1">
                  🟢 Online
                </p>
              ) : (
                <p className="text-gray-500 text-sm mt-1">
                  ⚪ Offline
                </p>
              )}
            </div>

          </div>

          {/* Messages */}
          <div className="h-96 p-5 overflow-y-auto">

            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-gray-500">
                  No messages yet.
                </p>
              </div>
            ) : (
              <div className="space-y-4">

                {messages.map((msg) => {
                  const isMyMessage =
                    msg.senderId === user?.uid;

                  return (
                    <div
                      key={msg.id}
                      className={`flex ${
                        isMyMessage
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-xs px-4 py-3 rounded-xl ${
                          isMyMessage
                            ? "bg-blue-600"
                            : "bg-gray-800"
                        }`}
                      >
                        <p>{msg.text}</p>
                      </div>
                    </div>
                  );
                })}

              </div>
            )}

          </div>

          {/* Message Input */}
          <form
            onSubmit={handleSend}
            className="p-4 border-t border-gray-800 flex gap-3"
          >
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 outline-none focus:border-blue-500"
            />

            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold"
            >
              Send
            </button>
          </form>

        </div>

      </div>
    </main>
  );
}

export default Chat;