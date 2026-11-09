import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, X, Volume2, VolumeX, Sparkles } from 'lucide-react';

interface VoiceConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendVoiceTurn: (transcript: string) => Promise<string | null>;
  speechRate?: number;
}

export const VoiceConversationModal: React.FC<VoiceConversationModalProps> = ({
  isOpen,
  onClose,
  onSendVoiceTurn,
  speechRate = 1.0,
}) => {
  const [status, setStatus] = useState<'idle' | 'listening' | 'thinking' | 'speaking' | 'unsupported'>('idle');
  const [transcript, setTranscript] = useState('');
  const [replyText, setReplyText] = useState('');
  const [muted, setMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) {
      stopAll();
      return;
    }
    startListening();
    return () => stopAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const stopAll = () => {
    try {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // ignore
    }
  };

  const startListening = () => {
    setErrorMsg('');
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatus('unsupported');
      setErrorMsg('Browser speech recognition is unavailable on this device/browser.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      let finalTranscript = '';

      recognition.onstart = () => {
        setStatus('listening');
        setTranscript('');
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += piece + ' ';
          } else {
            interim += piece;
          }
        }
        setTranscript((finalTranscript + interim).trim());
      };

      recognition.onerror = (e: any) => {
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          setErrorMsg(`Microphone error: ${e.error}`);
        }
        setStatus('idle');
      };

      recognition.onend = async () => {
        const spoken = finalTranscript.trim();
        if (!spoken) {
          setStatus('idle');
          return;
        }
        setStatus('thinking');
        const reply = await onSendVoiceTurn(spoken);
        if (reply) {
          setReplyText(reply);
          if (!muted && 'speechSynthesis' in window) {
            setStatus('speaking');
            const clean = reply.replace(/[*_`#>-]/g, ' ').slice(0, 600);
            const utter = new SpeechSynthesisUtterance(clean);
            utter.rate = speechRate;
            utter.onend = () => {
              setStatus('idle');
            };
            utter.onerror = () => {
              setStatus('idle');
            };
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utter);
          } else {
            setStatus('idle');
          }
        } else {
          setStatus('idle');
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to start microphone.');
      setStatus('idle');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 myai-navy-backdrop flex flex-col items-center justify-between p-6 text-white">
      {/* Top Bar */}
      <div className="w-full max-w-lg flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span>MY AI Live Voice</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setMuted(!muted);
              if (!muted && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
              }
            }}
            className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 transition"
            title={muted ? 'Unmute reply voice' : 'Mute reply voice'}
          >
            {muted ? <VolumeX className="w-5 h-5 text-slate-300" /> : <Volume2 className="w-5 h-5 text-blue-400" />}
          </button>
          <button
            type="button"
            onClick={() => {
              stopAll();
              onClose();
            }}
            className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 transition"
            aria-label="Close voice conversation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Central Orb */}
      <div className="flex flex-col items-center text-center max-w-md my-auto px-4">
        <div
          className={`w-36 h-36 rounded-full flex items-center justify-center transition-all duration-500 ${
            status === 'listening'
              ? 'gemini-gradient-bg scale-110 shadow-[0_0_60px_rgba(59,130,246,0.5)]'
              : status === 'speaking'
              ? 'bg-indigo-600 scale-105 shadow-[0_0_50px_rgba(129,140,248,0.45)]'
              : status === 'thinking'
              ? 'bg-slate-800 animate-pulse'
              : 'bg-slate-900 border border-slate-700'
          }`}
        >
          {status === 'listening' ? (
            <Mic className="w-12 h-12 text-white" />
          ) : status === 'speaking' ? (
            <Volume2 className="w-12 h-12 text-white" />
          ) : (
            <Sparkles className="w-12 h-12 text-blue-400" />
          )}
        </div>

        <div className="mt-8 text-base font-semibold text-white">
          {status === 'listening' && 'Listening...'}
          {status === 'thinking' && 'MY AI is thinking...'}
          {status === 'speaking' && 'Speaking reply...'}
          {status === 'idle' && 'Tap the microphone to speak'}
          {status === 'unsupported' && 'Voice recognition unavailable'}
        </div>

        {transcript && (
          <p className="mt-4 text-sm text-blue-200 leading-relaxed">
            “{transcript}”
          </p>
        )}

        {replyText && status !== 'listening' && (
          <p className="mt-4 text-xs sm:text-sm text-slate-300 line-clamp-4 leading-relaxed">
            {replyText}
          </p>
        )}

        {errorMsg && (
          <p className="mt-4 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">
            {errorMsg}
          </p>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="flex items-center gap-4 pb-4">
        <button
          type="button"
          onClick={() => {
            if (status === 'listening') {
              recognitionRef.current?.stop();
            } else {
              startListening();
            }
          }}
          className={`w-16 h-16 rounded-full flex items-center justify-center shadow-xl transition ${
            status === 'listening'
              ? 'bg-red-600 hover:bg-red-500 text-white'
              : 'gemini-gradient-bg hover:brightness-110 text-white'
          }`}
          aria-label={status === 'listening' ? 'Stop listening' : 'Start listening'}
        >
          {status === 'listening' ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
        </button>

        <button
          type="button"
          onClick={() => {
            stopAll();
            onClose();
          }}
          className="px-6 py-3.5 rounded-full bg-white/10 hover:bg-white/20 text-sm font-semibold text-white transition"
        >
          End Voice
        </button>
      </div>
    </div>
  );
};
