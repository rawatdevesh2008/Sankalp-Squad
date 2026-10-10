import React from 'react';
import { UserScore } from '../types';

interface ScoreBoardProps {
  score: UserScore | null;
  isLoading: boolean;
}

export const ScoreBoard: React.FC<ScoreBoardProps> = ({ score, isLoading }) => {
  if (!score) {
    return (
      <div className="glass-panel rounded-2xl p-4 sm:p-6 text-center">
        <p className="text-slate-400 text-xs sm:text-sm animate-pulse">Loading Household & Ward Score...</p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-6 shadow-xl border border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 sm:pb-4 border-b border-slate-800">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            🏆 Household Leaderboard
          </h3>
          <p className="text-[11px] sm:text-xs text-emerald-400 font-mono mt-0.5">
            {score.user_id} • {score.ward_id}
          </p>
        </div>
        <span className="px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
          DynamoDB Live Sync
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 mt-3.5 sm:mt-5">
        <div className="bg-slate-900/90 p-3 sm:p-4 rounded-xl border border-slate-800/80">
          <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider font-semibold">Green Points</p>
          <p className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1 font-mono tracking-tight">
            {score.total_points}
          </p>
          <span className="text-[10px] sm:text-[11px] text-slate-500 block truncate mt-0.5">
            +{score.correct_scans * 15} pts earned
          </span>
        </div>

        <div className="bg-slate-900/90 p-3 sm:p-4 rounded-xl border border-slate-800/80">
          <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider font-semibold">Accuracy Rate</p>
          <p className="text-2xl sm:text-3xl font-black text-cyan-400 mt-1 font-mono tracking-tight">
            {score.segregation_accuracy_pct}%
          </p>
          <span className="text-[10px] sm:text-[11px] text-slate-500 block truncate mt-0.5">
            {score.correct_scans} of {score.total_scans} segregated
          </span>
        </div>

        <div className="bg-slate-900/90 p-3 sm:p-4 rounded-xl border border-slate-800/80 col-span-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider font-semibold">Contamination Stopped</p>
            <p className="text-lg sm:text-xl font-bold text-rose-400 mt-0.5 font-mono truncate">
              {score.contamination_prevented} Truckload Risks Saved
            </p>
          </div>
          <div className="text-xl sm:text-2xl shrink-0">🛡️</div>
        </div>
      </div>

      <div className="mt-3.5 sm:mt-4 pt-3 border-t border-slate-800/80 text-[10px] sm:text-[11px] text-slate-400 flex items-center justify-between gap-2">
        <span className="truncate">Bharat Builds Tour: Track 03</span>
        <span className="shrink-0">{isLoading ? 'Syncing...' : 'DynamoDB Updated'}</span>
      </div>
    </div>
  );
};
