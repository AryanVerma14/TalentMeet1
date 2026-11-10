function Home() {
  return (
    <main className="min-h-[calc(100vh-73px)] bg-gray-950 text-white">
      
      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-6 py-24 text-center">
        
        <div className="max-w-3xl mx-auto">
          <p className="text-blue-400 font-semibold mb-4">
            THE FUTURE OF INTERVIEWS
          </p>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
            Meet. Interview.
            <span className="text-blue-500"> Grow.</span>
          </h1>

          <p className="text-gray-400 text-lg md:text-xl leading-relaxed mb-10">
            TalentMeet connects candidates and interviewers in one
            simple platform. Practice interviews, communicate in
            real-time, and take your career to the next level.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button className="bg-blue-600 hover:bg-blue-700 px-8 py-3 rounded-lg font-semibold transition">
              Get Started
            </button>

            <button className="border border-gray-700 hover:bg-gray-800 px-8 py-3 rounded-lg font-semibold transition">
              Explore Platform
            </button>
          </div>
        </div>

      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          <div className="border border-gray-800 rounded-xl p-6 bg-gray-900">
            <h3 className="text-xl font-semibold mb-3">
              🎥 Live Interviews
            </h3>
            <p className="text-gray-400">
              Conduct interviews through real-time video communication.
            </p>
          </div>

          <div className="border border-gray-800 rounded-xl p-6 bg-gray-900">
            <h3 className="text-xl font-semibold mb-3">
              💬 Real-Time Chat
            </h3>
            <p className="text-gray-400">
              Communicate with interviewers and candidates instantly.
            </p>
          </div>

          <div className="border border-gray-800 rounded-xl p-6 bg-gray-900">
            <h3 className="text-xl font-semibold mb-3">
              💻 Technical Interviews
            </h3>
            <p className="text-gray-400">
              Practice coding and technical interview questions.
            </p>
          </div>

        </div>
      </section>

    </main>
  );
}

export default Home;