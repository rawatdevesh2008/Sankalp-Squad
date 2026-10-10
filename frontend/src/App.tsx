import { useState, useEffect, useRef } from 'react';
import { CameraInspector } from './components/CameraInspector';
import { ScoreBoard } from './components/ScoreBoard';
import { AiChatBox } from './components/AiChatBox';
import { InspectionResponse, UserScore } from './types';

const API_URL = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'http://localhost:8000';
const DEFAULT_USER = 'household_402';
const DEFAULT_WARD = 'Ward-12 (Delhi)';

export function App() {
  const [userScore, setUserScore] = useState<UserScore | null>(null);
  const [lastResult, setLastResult] = useState<InspectionResponse | null>(null);
  const [isScoreLoading, setIsScoreLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const getFrameFnRef = useRef<(() => string | null) | null>(null);

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

  // Update Score & Result state whenever a new scan inspection returns (from Camera or Copilot)
  const handleInspectionResult = (result: InspectionResponse) => {
    setLastResult(result);
    if (result.user_score) {
      setUserScore(result.user_score);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F17] text-slate-800 dark:text-slate-100 flex flex-col font-sans transition-colors duration-300 selection:bg-emerald-500/30">
      {/* Top Navbar Header */}
      <header className="border-b border-slate-200/80 dark:border-slate-800/70 bg-white/80 dark:bg-[#0B0F17]/80 backdrop-blur-xl sticky top-0 z-50 transition-colors duration-300 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-lg sm:text-xl shrink-0 border border-white/20">
              🛡️
            </div>
            <div className="truncate">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5 sm:gap-2">
                  ShieldBin
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-bold shrink-0">
                  Track 03
                </span>
                <span className="hidden md:inline text-[9px] font-mono uppercase px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/25">
                  MoEFCC SWM 2016 Compliant
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Source-Level Waste & Contamination Intelligence Inspector
              </p>
            </div>
          </div>

          {/* Right Header Controls: API Status, Bedrock info, and Theme Switcher */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            {/* Live API Health Pill */}
            <div className="flex items-center gap-2 text-[11px] sm:text-xs font-mono px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-800 shadow-sm">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  backendStatus === 'online'
                    ? 'bg-emerald-400 shadow-sm shadow-emerald-400/80 animate-pulse'
                    : 'bg-rose-500 animate-ping'
                }`}
              />
              <span className="text-slate-700 dark:text-slate-300 font-medium">
                <span className="hidden xs:inline">Engine: </span>
                {backendStatus === 'online' ? 'Live' : 'Offline'}
              </span>
            </div>

            <span className="text-xs text-slate-400 dark:text-slate-400 hidden xl:inline font-mono bg-slate-900/40 px-3 py-1.5 rounded-full border border-slate-800/60">
              AWS Bedrock • Claude 3.5 Sonnet
            </span>

            {/* Theme Toggle Icon */}
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
              className="p-2 rounded-xl border border-slate-300 dark:border-slate-800/80 bg-slate-100 dark:bg-slate-900/80 text-slate-700 dark:text-slate-200 hover:text-emerald-500 dark:hover:text-emerald-400 hover:border-emerald-500/40 active:scale-95 hover:-translate-y-0.5 transition-all flex items-center gap-1.5 text-xs font-medium cursor-pointer shadow-sm"
              aria-label="Toggle theme"
            >
              <span className="text-sm sm:text-base">{theme === 'dark' ? '☀️' : '🌙'}</span>
              <span className="hidden sm:inline text-[11px] font-mono capitalize">{theme}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Responsive Grid Layout */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
          {/* Main Primary Column: Camera Feed, AI Result Banner & AI Copilot Drawer */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6 w-full">
            <CameraInspector
              apiUrl={API_URL}
              onInspectionResult={handleInspectionResult}
              userId={DEFAULT_USER}
              wardId={DEFAULT_WARD}
              externalResult={lastResult}
              onFrameCaptureReady={(fn) => {
                getFrameFnRef.current = fn;
              }}
            />

            {/* ShieldBin AI Copilot (Dual Purpose: Waste Override & General ChatGPT) */}
            <AiChatBox
              apiUrl={API_URL}
              onInspectionResult={handleInspectionResult}
              getCurrentFrame={() => (getFrameFnRef.current ? getFrameFnRef.current() : null)}
              userId={DEFAULT_USER}
              wardId={DEFAULT_WARD}
            />
          </div>

          {/* Sidebar Column: Household Leaderboard & Municipal Guidelines */}
          <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-6 w-full">
            <ScoreBoard score={userScore} isLoading={isScoreLoading} />

            {/* Indian SWM 2016 Guidelines Quick Card */}
            <div className="glass-panel rounded-2xl p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800/70 shadow-xl transition-all relative overflow-hidden group">
              <div className="flex items-center justify-between pb-3.5 border-b border-slate-200/80 dark:border-slate-800/80">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <span>📋</span> Municipal Waste Standards
                </h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  CPCB 2016/2022
                </span>
              </div>

              <div className="space-y-3 mt-4 text-xs">
                {/* Blue Bin */}
                <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800/70 hover:border-blue-500/40 hover:-translate-y-0.5 transition-all">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50 shrink-0" />
                    <span className="font-bold text-slate-900 dark:text-white">Blue Bin (Dry Recyclables)</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 mt-1 pl-5.5 leading-relaxed text-[11px]">
                    Clean paper, cardboard, PET bottles, metal cans. <span className="text-blue-600 dark:text-blue-300 font-semibold italic">Must be free of food grease!</span>
                  </p>
                </div>

                {/* Green Bin */}
                <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800/70 hover:border-emerald-500/40 hover:-translate-y-0.5 transition-all">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50 shrink-0" />
                    <span className="font-bold text-slate-900 dark:text-white">Green Bin (Wet Organic)</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 mt-1 pl-5.5 leading-relaxed text-[11px]">
                    Vegetable & fruit peels, food leftovers, tea leaves, compostable organic scraps.
                  </p>
                </div>

                {/* Yellow Bin */}
                <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800/70 hover:border-amber-500/40 hover:-translate-y-0.5 transition-all">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50 shrink-0" />
                    <span className="font-bold text-slate-900 dark:text-white">Yellow (E-Waste / Specialized)</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 mt-1 pl-5.5 leading-relaxed text-[11px]">
                    Phones, lithium batteries, chargers, circuitry. <span className="text-amber-600 dark:text-amber-300 font-bold">Never dump into municipal bins!</span>
                  </p>
                </div>

                {/* Black Bin */}
                <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800/70 hover:border-slate-600/40 hover:-translate-y-0.5 transition-all">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full bg-slate-500 shadow-sm shadow-slate-500/50 shrink-0" />
                    <span className="font-bold text-slate-900 dark:text-white">Black Bin (Sanitary / Landfill)</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 mt-1 pl-5.5 leading-relaxed text-[11px]">
                    Greasy pizza boxes, soiled diapers, inert wraps, contaminated reject waste.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 dark:border-slate-800/80 bg-white/60 dark:bg-[#070A0F]/80 py-4 text-center text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 px-4 transition-colors font-mono">
        Bharat Builds Tour • Environmental Hacks (Track 03) • Sankalp Squad
      </footer>

      {/* Floating ShieldBin AI Copilot Quick Action Floating Pill */}
      <aside aria-label="ShieldBin Copilot Floating Trigger" className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40">
        <button
          onClick={() => {
            const copilotEl = document.getElementById('ai-copilot-container');
            if (copilotEl) {
              copilotEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
              const input = copilotEl.querySelector('input');
              input?.focus();
            }
          }}
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold text-xs sm:text-sm shadow-xl shadow-emerald-500/30 hover:shadow-emerald-500/40 hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer border border-white/20 backdrop-blur-xl"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-300 animate-ping" />
          <span className="text-base">🤖</span>
          <span>ShieldBin AI Copilot</span>
        </button>
      </aside>
    </div>
  );
}

export default App;
