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
  
  // Theme state: 'dark' | 'light', defaulting to dark mode with localStorage persistence
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('shieldbin_theme');
    return saved === 'light' || saved === 'dark' ? saved : 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
    localStorage.setItem('shieldbin_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans transition-colors duration-300 selection:bg-emerald-500/30">
      {/* Top Navbar */}
      <header className="border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/70 backdrop-blur-md sticky top-0 z-50 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-lg sm:text-xl shrink-0">
              🛡️
            </div>
            <div className="truncate">
              <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5 sm:gap-2">
                ShieldBin
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
                  Track 03
                </span>
              </h1>
              <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Source-Level Waste & Contamination Inspector
              </p>
            </div>
          </div>

          {/* Right Header Controls: API Status, Bedrock model info, and Theme Toggle Icon */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* API Health Pill */}
            <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-mono px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-slate-100 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-800">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  backendStatus === 'online' ? 'bg-emerald-500 dark:bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-rose-500 animate-pulse'
                }`}
              />
              <span className="text-slate-700 dark:text-slate-300">
                <span className="hidden xs:inline">API: </span>{backendStatus === 'online' ? 'Live' : 'Offline'}
              </span>
            </div>

            <span className="text-xs text-slate-500 dark:text-slate-400 hidden lg:inline font-mono">
              AWS Bedrock • Claude 3.5 Sonnet
            </span>

            {/* Premium Theme Switcher Icon */}
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
              className="p-1.5 sm:p-2 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-500/40 active:scale-95 transition-all flex items-center gap-1.5 text-xs font-medium cursor-pointer shadow-sm"
              aria-label="Toggle theme"
            >
              <span className="text-sm sm:text-base">{theme === 'dark' ? '☀️' : '🌙'}</span>
              <span className="hidden sm:inline text-[11px] font-mono capitalize">{theme}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="flex-1 max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 lg:gap-8 items-start">
          {/* Left/Main Column: Webcam Feed & Contamination Card */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-5 sm:gap-6 w-full">
            <CameraInspector
              apiUrl={API_URL}
              onInspectionResult={handleInspectionResult}
              userId={DEFAULT_USER}
              wardId={DEFAULT_WARD}
            />
          </div>

          {/* Right Column: Leaderboard & DynamoDB Stats */}
          <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-5 sm:gap-6 w-full">
            <ScoreBoard score={userScore} isLoading={isScoreLoading} />

            {/* Indian SWM 2016 Guidelines Quick Card */}
            <div className="glass-panel rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-lg transition-all">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 sm:mb-4 flex items-center gap-2">
                📋 Municipal Waste & E-Waste Standards
              </h4>
              <ul className="space-y-2.5 sm:space-y-3 text-xs text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-2.5">
                  <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-blue-500 shrink-0 mt-1" />
                  <div>
                    <strong className="text-slate-900 dark:text-white">Blue Bin (Dry Recyclables):</strong> Clean paper, cardboard, plastics, cans. <span className="text-blue-600 dark:text-blue-300 italic block sm:inline">Must be free of food grease!</span>
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-emerald-500 shrink-0 mt-1" />
                  <div>
                    <strong className="text-slate-900 dark:text-white">Green Bin (Wet Organic):</strong> Fruit/vegetable peels, leftovers, compostable food.
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-amber-400 shrink-0 mt-1" />
                  <div>
                    <strong className="text-slate-900 dark:text-white">Yellow Bin (E-Waste / Specialized Drop-off):</strong> Mobile phones, lithium batteries, cables, chargers. <span className="text-amber-600 dark:text-amber-300 font-semibold block sm:inline">Never throw into normal bins!</span>
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-slate-500 shrink-0 mt-1" />
                  <div>
                    <strong className="text-slate-900 dark:text-white">Black Bin (Sanitary / Landfill):</strong> Food-soiled cartons, dirty wraps, inert reject.
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-900 bg-white/60 dark:bg-slate-950/80 py-3 sm:py-4 text-center text-[11px] sm:text-xs text-slate-500 dark:text-slate-500 px-4 transition-colors">
        Bharat Builds Tour • Environmental Hacks (Oct 8–11, 2026) • Sankalp Squad
      </footer>
    </div>
  );
}

export default App;
