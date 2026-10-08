import React from 'react';
import { UserScore } from '../types';

interface ScoreBoardProps {
  score: UserScore | null;
  isLoading: boolean;
}

export const ScoreBoard: React.FC<ScoreBoardProps> = ({ score, isLoading }) => {
  if (!score) {
    return (
      <div className="glass-panel rounded-2xl p-6 text-center">
        <p className="text-slate-400">Loading Household & Ward Score...</p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-6 shadow-xl border border-slate-800">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            🏆 Household Leaderboard
          </h3>
          <p className="text-xs text-emerald-400 font-mono mt-0.5">
            {score.user_id} • {score.ward_id}
          </p>
        </div>
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          DynamoDB Live Sync
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-5">
        <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Green Points</p>
          <p className="text-3xl font-black text-emerald-400 mt-1 font-mono">
            {score.total_points}
          </p>
          <span className="text-[11px] text-slate-500">+{score.correct_scans * 15} pts from clean recycling</span>
        </div>

        <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Accuracy Rate</p>
          <p className="text-3xl font-black text-cyan-400 mt-1 font-mono">
            {score.segregation_accuracy_pct}%
          </p>
          <span className="text-[11px] text-slate-500">{score.correct_scans} of {score.total_scans} items segregated</span>
        </div>

        <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 col-span-2 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Contamination Stopped</p>
            <p className="text-xl font-bold text-rose-400 mt-0.5 font-mono">
              {score.contamination_prevented} Truckload Risks Saved
            </p>
          </div>
          <div className="text-2xl">🛡️</div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
        <span>Bharat Builds Tour: Track 03</span>
        <span>{isLoading ? 'Syncing...' : 'DynamoDB Updated'}</span>
      </div>
    </div>
  );
};
