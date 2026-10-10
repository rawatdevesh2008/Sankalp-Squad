import React, { useState, useEffect, useRef } from 'react';
import { InspectionResponse, CopilotChatResponse } from '../types';

export interface StructuredOverride {
  itemName: string;
  category: string;
  assignedBin: string;
  riskPoints: string;
  explanation: string;
}

export interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
  intent?: 'waste_override' | 'general_chat';
  structured?: StructuredOverride | null;
  result?: InspectionResponse;
  isLoading?: boolean;
}

interface AiChatBoxProps {
  apiUrl?: string;
  onInspectionResult: (result: InspectionResponse) => void;
  getCurrentFrame?: () => string | null;
  targetBin?: string;
  userId?: string;
  wardId?: string;
  className?: string;
}

/**
 * Parses CPCB 5-point structured override text:
 * - Item Name: [Detected item]
 * - Category: [Sanitary / Landfill | Dry Recyclable | Wet Organic | E-Hazardous]
 * - Assigned Bin: [Black Bin | Blue Bin | Green Bin | Specialized E-Waste Drop-off Center]
 * - Risk Points: [-X Points]
 * - Explanation: [Short reason why contamination occurs]
 */
export const parseWasteOverride = (text: string): StructuredOverride | null => {
  if (!text) return null;
  const itemMatch = text.match(/-\s*Item Name:\s*(.+)/i);
  const catMatch = text.match(/-\s*Category:\s*(.+)/i);
  const binMatch = text.match(/-\s*Assigned Bin:\s*(.+)/i);
  const riskMatch = text.match(/-\s*Risk Points:\s*(.+)/i);
  const expMatch = text.match(/-\s*Explanation:\s*(.+)/i);

  if (itemMatch && (catMatch || binMatch)) {
    return {
      itemName: itemMatch[1].trim(),
      category: catMatch ? catMatch[1].trim() : 'Dry Recyclable',
      assignedBin: binMatch ? binMatch[1].trim() : 'Blue Bin',
      riskPoints: riskMatch ? riskMatch[1].trim() : '-0 Points',
      explanation: expMatch ? expMatch[1].trim() : 'CPCB Source Segregation Analysis',
    };
  }
  return null;
};

export const AiChatBox: React.FC<AiChatBoxProps> = ({
  apiUrl,
  onInspectionResult,
  getCurrentFrame,
  targetBin = 'Auto-Detect',
  userId = 'household_402',
  wardId = 'Ward-12 (Delhi)',
  className = '',
}) => {
  const backendUrl =
    apiUrl ||
    import.meta.env.VITE_BACKEND_URL ||
    import.meta.env.VITE_API_URL ||
    'http://localhost:8000';

  const [isOpen, setIsOpen] = useState(true);
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Initial welcome message
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      intent: 'general_chat',
      text: "👋 Hi! I'm your **ShieldBin AI Copilot**.\n\nI serve a dual role:\n• **Waste Override**: Type or speak an item (*'banana peel'*, *'lithium battery'*, *'That\\'s a mobile, not paper'*) to update CPCB segregation.\n• **General Assistant**: Ask me anything—science queries, code snippets, recycling mechanics, or jokes—just like ChatGPT!",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  // Smooth auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAnalyzing]);

  // Web Speech API: Initialize native webkitSpeechRecognition
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      setSpeechSupported(true);
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          setIsListening(true);
          setSpeechError(null);
        };

        recognition.onresult = (event: any) => {
          let transcript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }
          if (transcript) {
            setInputText(transcript);
          }
        };

        recognition.onerror = (event: any) => {
          console.warn('Speech recognition warning:', event.error);
          setIsListening(false);
          if (event.error === 'not-allowed') {
            setSpeechError('Microphone access blocked. Please enable mic permissions in your browser.');
          } else if (event.error !== 'no-speech') {
            setSpeechError(`Voice error: ${event.error}`);
          }
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      } catch (err) {
        console.warn('Could not initialize speech recognition:', err);
      }
    }
  }, []);

  const toggleListening = () => {
    if (!speechSupported || !recognitionRef.current) {
      alert('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    if (isListening) {
      try {
        recognitionRef.current.stop();
      } catch {
        setIsListening(false);
      }
    } else {
      try {
        setSpeechError(null);
        recognitionRef.current.start();
      } catch (err) {
        console.error('Error starting recognition:', err);
        setIsListening(false);
      }
    }
  };

  const createFallbackFrame = (prompt: string): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.fillStyle = '#070A0F';
    ctx.fillRect(0, 0, 1280, 720);

    ctx.fillStyle = '#0D131F';
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(400, 140, 480, 440, 24);
    } else {
      ctx.rect(400, 140, 480, 440);
    }
    ctx.fill();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ShieldBin Copilot Snapshot', 640, 320);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '22px sans-serif';
    ctx.fillText(`Prompt: "${prompt.slice(0, 45)}"`, 640, 380);

    ctx.fillStyle = '#10b981';
    ctx.font = '16px monospace';
    ctx.fillText('CPCB Audit Live Buffer', 640, 430);

    return canvas.toDataURL('image/jpeg', 0.9);
  };

  const handleSend = async (overridePrompt?: string) => {
    const promptToSend = (overridePrompt ?? inputText).trim();
    if (!promptToSend || isAnalyzing) return;

    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
    }

    setInputText('');
    setSpeechError(null);

    // 1. User Message
    const userMsgId = `user-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text: promptToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    // 2. AI Thinking Bubble
    const aiTempId = `ai-temp-${Date.now()}`;
    const aiTempMsg: ChatMessage = {
      id: aiTempId,
      sender: 'ai',
      text: 'Analyzing with Bedrock...',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMsg, aiTempMsg]);
    setIsAnalyzing(true);

    try {
      let imageBase64: string | null = null;
      if (getCurrentFrame) {
        imageBase64 = getCurrentFrame();
      }
      if (!imageBase64 || imageBase64.length < 200) {
        imageBase64 = createFallbackFrame(promptToSend);
      }

      const endpoint = `${backendUrl.replace(/\/+$/, '')}/api/copilot/chat`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: promptToSend,
          image_base64: imageBase64,
          target_bin: targetBin,
          user_id: userId,
          ward_id: wardId,
          location_context: 'India - Municipal',
        }),
      });

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data: CopilotChatResponse = await response.json();
      const structuredData = parseWasteOverride(data.reply_text);

      // If waste_override, immediately sync camera canvas & DynamoDB score
      if (data.intent === 'waste_override' && data.inspection_result) {
        onInspectionResult(data.inspection_result);
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiTempId
            ? {
                ...msg,
                text: data.reply_text,
                intent: data.intent,
                structured: structuredData,
                result: data.inspection_result || undefined,
                isLoading: false,
              }
            : msg
        )
      );
    } catch (err: any) {
      console.error('Copilot request error:', err);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiTempId
            ? {
                ...msg,
                text: `❌ Could not complete request: ${err.message || 'Network error'}. Please verify backend connection.`,
                isLoading: false,
              }
            : msg
        )
      );
    } finally {
      setIsAnalyzing(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Quick Action Preset Buttons
  const samplePrompts = [
    { label: '🔋 Lithium Battery', prompt: 'lithium battery' },
    { label: '🍌 Banana Peel', prompt: 'banana peel' },
    { label: '📱 Mobile Phone', prompt: "That's a mobile, not paper" },
    { label: '🍕 Greasy Pizza Box', prompt: 'greasy pizza box' },
    { label: '♻️ How Recycling Works', prompt: 'How does recycling work?' },
    { label: '🐍 Python Script', prompt: 'Write a Python script for binary search' },
    { label: '😄 Tell Me a Joke', prompt: 'Tell me a joke' },
  ];

  // Helper to render markdown and code blocks
  const renderFormattedText = (text: string) => {
    if (!text) return null;

    if (text.includes('```')) {
      const parts = text.split(/(```[\s\S]*?```)/g);
      return (
        <div className="space-y-2">
          {parts.map((part, idx) => {
            if (part.startsWith('```') && part.endsWith('```')) {
              const lines = part.slice(3, -3).trim().split('\n');
              const language = lines[0].trim();
              const code = (language.match(/^[a-z0-9_-]+$/i) ? lines.slice(1) : lines).join('\n');
              return (
                <div key={idx} className="my-2 rounded-xl overflow-hidden border border-slate-800 bg-[#070A0F] shadow-lg">
                  {language && (
                    <div className="px-3.5 py-1.5 bg-[#0B0F17] border-b border-slate-800 text-[10px] text-slate-400 font-mono flex items-center justify-between">
                      <span>{language}</span>
                      <span className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Code</span>
                    </div>
                  )}
                  <pre className="p-3.5 text-[11px] font-mono text-emerald-400 overflow-x-auto leading-relaxed scrollbar-thin">
                    <code>{code}</code>
                  </pre>
                </div>
              );
            }

            return (
              <div key={idx} className="whitespace-pre-wrap leading-relaxed">
                {part.split('\n\n').map((para, pIdx) => (
                  <p key={pIdx} className="mb-1.5 last:mb-0">
                    {para}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div className="whitespace-pre-wrap leading-relaxed">
        {text.split('\n\n').map((para, idx) => (
          <p key={idx} className="mb-1.5 last:mb-0">
            {para}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div id="ai-copilot-container" className={`transition-all duration-300 w-full max-w-2xl mx-auto scroll-mt-20 ${className}`}>
      {/* Hyper-Modern Floating Glass Container */}
      <div className="glass-panel rounded-2xl border border-slate-200/80 dark:border-slate-800/70 shadow-2xl overflow-hidden backdrop-blur-2xl bg-white/95 dark:bg-[#0D131F]/90 transition-all">
        {/* Header Bar */}
        <div
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-center justify-between p-3.5 sm:p-4.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors select-none border-b border-transparent dark:border-slate-800/50"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-teal-500 to-emerald-400 flex items-center justify-center text-lg sm:text-xl shadow-lg shadow-cyan-500/20 shrink-0 border border-white/20">
                🤖
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 border-2 border-white dark:border-[#0D131F] rounded-full shadow-sm" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate tracking-tight">
                  ShieldBin AI Assistant
                </h3>
                <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 font-bold shrink-0">
                  Dual Copilot
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {isOpen ? 'Waste overrides re-audit live frame • General questions answered naturally' : 'Tap to expand AI Assistant'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {isListening && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-rose-500 bg-rose-500/10 px-2.5 py-0.5 rounded-full animate-pulse border border-rose-500/30 shadow-sm shadow-rose-500/10">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                Listening
              </span>
            )}
            <button
              type="button"
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
              aria-label={isOpen ? 'Collapse Copilot' : 'Expand Copilot'}
            >
              <span className="text-sm font-bold block transition-transform duration-200">
                {isOpen ? '▼' : '▲'}
              </span>
            </button>
          </div>
        </div>

        {/* Expanded Drawer Content */}
        {isOpen && (
          <div className="p-3.5 sm:p-4.5 flex flex-col gap-3.5 border-t border-slate-200/60 dark:border-slate-800/70">
            {/* Quick Action Pill Buttons with Hover Micro-Translations */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 font-mono mr-1">
                Quick Actions:
              </span>
              {samplePrompts.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSend(preset.prompt);
                  }}
                  disabled={isAnalyzing}
                  className="text-[11px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900/80 hover:bg-emerald-500/15 hover:text-emerald-600 dark:hover:text-emerald-400 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-medium hover:-translate-y-0.5 hover:shadow-md hover:shadow-emerald-500/5 active:scale-95 transition-all whitespace-nowrap cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Chat History Messages Container */}
            <div className="max-h-72 sm:max-h-80 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
              {messages.map((msg) => {
                const isUser = msg.sender === 'user';
                const isWasteOverride = msg.intent === 'waste_override' || !!msg.structured;

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[92%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-xs shadow-md transition-all ${
                        isUser
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-br-sm shadow-emerald-900/20'
                          : 'bg-slate-100 dark:bg-[#070A0F]/90 text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-800/80 rounded-bl-sm shadow-black/20'
                      }`}
                    >
                      {/* Message Body */}
                      <div className="flex items-start gap-2.5">
                        {!isUser && (
                          <span className="text-sm mt-0.5 shrink-0">
                            {isWasteOverride ? '🛡️' : '🤖'}
                          </span>
                        )}
                        <div className="flex-1 leading-relaxed break-words">
                          {msg.isLoading ? (
                            <div className="flex items-center gap-2.5 text-cyan-600 dark:text-cyan-400 font-medium py-1">
                              <span className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                              <span className="font-mono text-xs">{msg.text}</span>
                            </div>
                          ) : isWasteOverride && msg.structured ? (
                            /* CPCB Waste Inspection Override Card */
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between pb-2 border-b border-slate-200/80 dark:border-slate-800">
                                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-mono">
                                  <span>⚖️</span> CPCB Source Segregation Audit
                                </span>
                                <span
                                  className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full ${
                                    msg.structured.riskPoints.includes('-') && !msg.structured.riskPoints.includes('-0')
                                      ? 'bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30'
                                      : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30'
                                  }`}
                                >
                                  Risk: {msg.structured.riskPoints}
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-0.5">
                                <div className="bg-white dark:bg-[#0B0F17] p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm">
                                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block font-mono">Item Name</span>
                                  <span className="font-black text-slate-900 dark:text-white mt-0.5 block">{msg.structured.itemName}</span>
                                </div>

                                <div className="bg-white dark:bg-[#0B0F17] p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm">
                                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block font-mono">Category</span>
                                  <span className="font-black text-slate-900 dark:text-white mt-0.5 block">{msg.structured.category}</span>
                                </div>
                              </div>

                              <div className="bg-white dark:bg-[#0B0F17] p-3 rounded-xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm flex items-center justify-between">
                                <div>
                                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block font-mono">Assigned Bin</span>
                                  <span className="font-black text-cyan-600 dark:text-cyan-300 text-xs sm:text-sm mt-0.5 block">
                                    {msg.structured.assignedBin}
                                  </span>
                                </div>
                                <span className="text-2xl">
                                  {msg.structured.assignedBin.includes('Green')
                                    ? '🟢'
                                    : msg.structured.assignedBin.includes('Blue')
                                    ? '🔵'
                                    : msg.structured.assignedBin.includes('Black')
                                    ? '⚫'
                                    : '🟡'}
                                </span>
                              </div>

                              <div className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed bg-white/70 dark:bg-[#0B0F17]/70 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800/80">
                                <span className="font-bold text-slate-700 dark:text-slate-200 block text-[10px] uppercase font-mono mb-1">
                                  Contamination Reason:
                                </span>
                                {msg.structured.explanation}
                              </div>

                              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5 pt-0.5 font-mono">
                                <span>✅</span> Active card & live overlay synchronized!
                              </div>
                            </div>
                          ) : (
                            <div>{renderFormattedText(msg.text)}</div>
                          )}
                        </div>
                      </div>

                      {/* Timestamp */}
                      <span
                        className={`block text-[9px] mt-1.5 text-right font-mono ${
                          isUser ? 'text-emerald-100/70' : 'text-slate-500'
                        }`}
                      >
                        {msg.timestamp}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Speech Error Alert */}
            {speechError && (
              <div className="text-[11px] text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2 flex items-center justify-between">
                <span>⚠️ {speechError}</span>
                <button
                  onClick={() => setSpeechError(null)}
                  className="font-bold text-slate-400 hover:text-slate-200 ml-2"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Live Listening Banner */}
            {isListening && (
              <div className="text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3.5 py-2 flex items-center gap-2 animate-pulse font-mono">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
                <span className="font-semibold">
                  Listening to voice... Speak your item or question now.
                </span>
              </div>
            )}

            {/* Input Controls Bar */}
            <div className="flex items-center gap-2.5 pt-1">
              {/* Native Voice Microphone Button */}
              <button
                type="button"
                onClick={toggleListening}
                title={
                  isListening
                    ? 'Stop Voice Listening'
                    : speechSupported
                    ? 'Click to speak your correction or question'
                    : 'Speech recognition unavailable in this browser'
                }
                className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center shrink-0 hover:-translate-y-0.5 active:scale-95 shadow-sm ${
                  isListening
                    ? 'bg-rose-500 text-white border-rose-600 shadow-md shadow-rose-500/30 scale-105'
                    : 'bg-slate-100 dark:bg-slate-900/90 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-800 hover:border-emerald-500/50 hover:text-emerald-600 dark:hover:text-emerald-400'
                }`}
                aria-label="Toggle voice input"
              >
                <span className="text-base sm:text-lg">
                  {isListening ? '🎙️' : '🎤'}
                </span>
              </button>

              {/* Text Input Box */}
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isAnalyzing}
                placeholder="Ask anything or override: 'banana peel', 'lithium battery'..."
                className="flex-1 bg-slate-100 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all font-medium placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />

              {/* Send Action Button */}
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={isAnalyzing || !inputText.trim()}
                className="px-4.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                {isAnalyzing ? (
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <span>Send</span>
                )}
                {!isAnalyzing && <span className="text-xs">➤</span>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AiChatBox;
