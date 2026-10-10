import React, { useState, useEffect, useRef } from 'react';
import { InspectionResponse } from '../types';

export interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
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

export const AiChatBox: React.FC<AiChatBoxProps> = ({
  apiUrl,
  onInspectionResult,
  getCurrentFrame,
  targetBin = 'Auto-Detect',
  userId = 'household_402',
  wardId = 'Ward-12 (Delhi)',
  className = '',
}) => {
  // Respect VITE_BACKEND_URL or VITE_API_URL fallback
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

  // Initial messages
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: "👋 Hi! I'm your ShieldBin AI Vision Copilot. Holding an item that wasn't classified properly? Type or speak a voice override (e.g. 'That's a lithium battery, not plastic...') and I'll re-audit the live frame instantly!",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  // Scroll to bottom on new messages
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
            setSpeechError('Microphone permission blocked. Please enable mic access in your browser.');
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

  // Toggle voice recognition
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

  // Helper to construct a synthetic fallback frame if camera is not streaming
  const createFallbackFrame = (prompt: string): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, 1280, 720);

    ctx.fillStyle = '#1e293b';
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
    ctx.fillText(`Override Prompt: "${prompt.slice(0, 45)}"`, 640, 380);

    ctx.fillStyle = '#22c55e';
    ctx.font = '16px monospace';
    ctx.fillText('Live Frame Re-audit Buffer', 640, 430);

    return canvas.toDataURL('image/jpeg', 0.9);
  };

  // Execute AI Copilot Inspection
  const handleSend = async (overridePrompt?: string) => {
    const promptToSend = (overridePrompt ?? inputText).trim();
    if (!promptToSend || isAnalyzing) return;

    // Stop listening if active
    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
    }

    setInputText('');
    setSpeechError(null);

    // 1. Append user message
    const userMsgId = `user-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text: promptToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    // 2. Append temporary AI acknowledgment bubble
    const aiTempId = `ai-temp-${Date.now()}`;
    const promptLower = promptToSend.toLowerCase();
    const itemHint = promptLower.includes('battery')
      ? 'a lithium battery'
      : promptLower.includes('phone')
      ? 'a mobile device'
      : promptLower.includes('pizza')
      ? 'greasy food packaging'
      : promptLower.includes('milk')
      ? 'a milk pouch'
      : 'your custom correction';

    const aiTempMsg: ChatMessage = {
      id: aiTempId,
      sender: 'ai',
      text: `Got it! Re-analyzing as ${itemHint}...`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMsg, aiTempMsg]);
    setIsAnalyzing(true);

    try {
      // 3. Grab current camera frame
      let imageBase64: string | null = null;
      if (getCurrentFrame) {
        imageBase64 = getCurrentFrame();
      }

      if (!imageBase64 || imageBase64.length < 200) {
        // Fallback to high-res synthesized canvas buffer
        imageBase64 = createFallbackFrame(promptToSend);
      }

      // 4. POST to backend /api/inspect
      const endpoint = `${backendUrl.replace(/\/+$/, '')}/api/inspect`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_base64: imageBase64,
          user_prompt: promptToSend,
          target_bin: targetBin,
          user_id: userId,
          ward_id: wardId,
          location_context: 'India - Municipal',
        }),
      });

      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }

      const data: InspectionResponse = await response.json();

      // 5. Update global UI immediately: red/green result banner, scoreboard, canvas
      onInspectionResult(data);

      // 6. Confirm adjustment in AI chat bubble
      const isContaminated = data.is_contaminated || !data.is_segregation_correct;
      const statusIcon = isContaminated ? '⚠️' : '✅';
      const aiReplyText = `Got it! Re-analyzed as: **${data.item_detected}** (${data.category}). ${statusIcon} Assigned to **${data.correct_bin}**.`;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiTempId
            ? {
                ...msg,
                text: aiReplyText,
                isLoading: false,
                result: data,
              }
            : msg
        )
      );
    } catch (err: any) {
      console.error('Copilot inspection error:', err);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiTempId
            ? {
                ...msg,
                text: `❌ Could not complete re-inspection: ${err.message || 'Network error'}. Please check backend connection.`,
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

  // Quick preset override prompts
  const samplePrompts = [
    { label: '🔋 Lithium Battery', prompt: "That's a lithium battery, not plastic..." },
    { label: '📱 Mobile Phone', prompt: "That is a smartphone / e-waste device, not dry recyclable." },
    { label: '🍕 Greasy Pizza Box', prompt: "This cardboard pizza box has severe grease stains at the bottom." },
    { label: '🧴 Clean PET Bottle', prompt: "Clean and rinsed PET water bottle with cap intact." },
  ];

  return (
    <div id="ai-copilot-container" className={`transition-all duration-300 w-full max-w-2xl mx-auto scroll-mt-20 ${className}`}>
      {/* Collapsible Card Container */}
      <div className="glass-panel rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden backdrop-blur-xl bg-white/95 dark:bg-slate-900/90 transition-all">
        {/* Header Bar: Collapsible Toggle */}
        <div
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-center justify-between p-3 sm:p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors select-none"
        >
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="relative">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-500 flex items-center justify-center text-base sm:text-lg shadow-md shadow-cyan-500/20 shrink-0">
                🤖
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                  ShieldBin AI Assistant / Voice Override
                </h3>
                <span className="hidden xs:inline text-[9px] uppercase font-mono px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
                  Copilot
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {isOpen ? 'Tap to collapse • Live speech & prompt corrections' : 'Tap to expand AI voice & prompt override drawer'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isListening && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full animate-pulse border border-rose-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                Listening
              </span>
            )}
            <button
              type="button"
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              aria-label={isOpen ? 'Collapse Copilot' : 'Expand Copilot'}
            >
              <span className="text-sm font-bold">{isOpen ? '▼' : '▲'}</span>
            </button>
          </div>
        </div>

        {/* Expanded Drawer Content */}
        {isOpen && (
          <div className="border-t border-slate-200 dark:border-slate-800/80 p-3 sm:p-4 flex flex-col gap-3">
            {/* Quick Preset Prompts */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              <span className="text-[10px] font-semibold text-slate-400 uppercase shrink-0">
                Try:
              </span>
              {samplePrompts.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSend(preset.prompt);
                  }}
                  disabled={isAnalyzing}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 hover:bg-emerald-500/15 hover:text-emerald-600 dark:hover:text-emerald-400 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 font-medium transition-all whitespace-nowrap cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Chat History Messages Container */}
            <div className="max-h-56 sm:max-h-64 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin">
              {messages.map((msg) => {
                const isUser = msg.sender === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[88%] sm:max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs shadow-sm transition-all ${
                        isUser
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-br-none'
                          : 'bg-slate-100 dark:bg-slate-800/90 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700/60 rounded-bl-none'
                      }`}
                    >
                      {/* Message Body */}
                      <div className="flex items-start gap-2">
                        {!isUser && (
                          <span className="text-sm mt-0.5 shrink-0">🤖</span>
                        )}
                        <div className="flex-1 leading-relaxed break-words">
                          {msg.isLoading ? (
                            <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 font-medium">
                              <span className="w-3 h-3 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                              <span>{msg.text}</span>
                            </div>
                          ) : (
                            <div>
                              <span>{msg.text}</span>
                              {/* Extra details badge if response contains audit result */}
                              {msg.result && (
                                <div className="mt-2 pt-2 border-t border-slate-200/50 dark:border-slate-700/50 flex flex-wrap gap-1.5 text-[10px]">
                                  <span
                                    className={`px-1.5 py-0.5 rounded font-bold ${
                                      msg.result.is_contaminated
                                        ? 'bg-rose-500/20 text-rose-600 dark:text-rose-300'
                                        : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300'
                                    }`}
                                  >
                                    {msg.result.is_contaminated ? 'CONTAMINATED' : 'CLEAN'}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-600 dark:text-blue-300 font-mono">
                                    {msg.result.correct_bin}
                                  </span>
                                  {msg.result.contamination_reason && (
                                    <p className="w-full text-[10px] text-slate-500 dark:text-slate-400 italic mt-0.5">
                                      {msg.result.contamination_reason}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Timestamp */}
                      <span
                        className={`block text-[9px] mt-1 text-right ${
                          isUser ? 'text-emerald-100/70' : 'text-slate-400'
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

            {/* Speech Recognition Error Alert if any */}
            {speechError && (
              <div className="text-[11px] text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
                <span>⚠️ {speechError}</span>
                <button
                  onClick={() => setSpeechError(null)}
                  className="font-bold text-slate-400 hover:text-slate-200 ml-2"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Live Voice Prompting Active Banner */}
            {isListening && (
              <div className="text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-1.5 flex items-center gap-2 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
                <span className="font-medium">
                  Listening to voice override... Speak your correction now.
                </span>
              </div>
            )}

            {/* Input Controls Bar */}
            <div className="flex items-center gap-2 pt-1">
              {/* Native webkitSpeechRecognition Microphone Button */}
              <button
                type="button"
                onClick={toggleListening}
                title={
                  isListening
                    ? 'Stop Voice Listening'
                    : speechSupported
                    ? 'Click to speak your correction'
                    : 'Speech recognition unavailable in this browser'
                }
                className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center shrink-0 ${
                  isListening
                    ? 'bg-rose-500 text-white border-rose-600 shadow-md shadow-rose-500/30 scale-105'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-emerald-500/50 hover:text-emerald-600 dark:hover:text-emerald-400'
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
                placeholder="e.g., That's a lithium battery, not plastic..."
                className="flex-1 bg-slate-100 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all font-medium placeholder:text-slate-400 placeholder:italic"
              />

              {/* Send Button */}
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={isAnalyzing || !inputText.trim()}
                className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer flex items-center gap-1.5 shrink-0"
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
