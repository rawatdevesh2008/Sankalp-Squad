import { useState, useEffect } from 'react';
import { CameraInspector } from './components/CameraInspector';
import { ScoreBoard } from './components/ScoreBoard';
import { InspectionResponse, UserScore } from './types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const DEFAULT_USER = 'household_402';
const DEFAULT_WARD = 'Ward-12 (Delhi)';

export function App() {
  const [userScore, setUserScore] = useState<UserScore | null>(null);
  const [isScoreLoading, setIsScoreLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  // Initial fetch of DynamoDB User Score & Backend Health
  useEffect(() => {
    async function fetchInitialData() {
      setIsScoreLoading(true);
      try {
        const healthRes = await fetch(`${API_URL}/health`);
        if (healthRes.ok) {
          setBackendStatus('online');
        } else {
          setBackendStatus('offline');
        }

        const scoreRes = await fetch(`${API_URL}/api/user/score?user_id=${DEFAULT_USER}`);
        if (scoreRes.ok) {
          const scoreData = await scoreRes.json();
          setUserScore(scoreData);
        }
      } catch (err) {
        console.error('Backend connection check failed:', err);
        setBackendStatus('offline');
      } finally {
        setIsScoreLoading(false);
      }
    }

    fetchInitialData();
  }, []);

  // Update Score whenever a new scan inspection returns
  const handleInspectionResult = (result: InspectionResponse) => {
    if (result.user_score) {
      setUserScore(result.user_score);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-xl">
              🛡️
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                ShieldBin
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  Track 03
                </span>
              </h1>
              <p className="text-[11px] text-slate-400">Source-Level Waste & Contamination Inspector</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800">
              <span
                className={`w-2 h-2 rounded-full ${
                  backendStatus === 'online' ? 'bg-emerald-400' : 'bg-rose-400 animate-pulse'
                }`}
              />
              <span className="text-slate-300">
                API: {backendStatus === 'online' ? 'App Runner (Live)' : 'Disconnected'}
              </span>
            </div>

            <span className="text-xs text-slate-400 hidden md:inline">
              AWS Bedrock • Claude 3.5 Sonnet
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left/Main Column: Webcam Feed & Contamination Card */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            <CameraInspector
              apiUrl={API_URL}
              onInspectionResult={handleInspectionResult}
              userId={DEFAULT_USER}
              wardId={DEFAULT_WARD}
            />
          </div>

          {/* Right Column: Leaderboard & DynamoDB Stats */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <ScoreBoard score={userScore} isLoading={isScoreLoading} />

            {/* Indian SWM 2016 Guidelines Quick Card */}
            <div className="glass-panel rounded-2xl p-6 border border-slate-800">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                📋 Municipal Waste Guidelines
              </h4>
              <ul className="space-y-3 text-xs text-slate-300">
                <li className="flex items-start gap-2.5">
                  <span className="w-3 h-3 rounded-full bg-blue-500 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white">Blue Bin (Dry Recyclables):</strong> Clean paper, cardboard, plastics, cans. <em>No grease or liquids!</em>
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white">Green Bin (Wet Organic):</strong> Fruit/vegetable peels, food scraps, tea leaves.
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-3 h-3 rounded-full bg-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white">Yellow Bin (E-Waste):</strong> Old electronics, charging cables, batteries.
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-3 h-3 rounded-full bg-slate-700 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white">Black Bin (Sanitary/Landfill):</strong> Greasy soiled paper, diapers, unrecyclable reject trash.
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
        Bharat Builds Tour • Event 02: Environmental Hacks (Oct 8–11, 2026) • Sankalp Squad
      </footer>
    </div>
  );
}

export default App;
