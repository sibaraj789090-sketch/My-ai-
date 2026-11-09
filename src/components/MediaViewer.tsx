import React, { useState, useRef } from 'react';
import {
  Play,
  Pause,
  Maximize2,
  Download,
  Volume2,
  VolumeX,
  Film,
  Music,
  Copy,
  Check,
  Bookmark,
  FileCode2,
  ChevronLeft,
  ChevronRight,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { MediaPayload, CanvasPayload } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface MediaViewerProps {
  media: MediaPayload;
  onAnimateToVideo?: (imageUrl: string, prompt: string) => void;
  onRegenerate?: (prompt: string, aspectRatio?: string) => void;
  isRegenerating?: boolean;
  onToggleSave?: () => void;
  isSaved?: boolean;
}

export const InlineImageViewer: React.FC<MediaViewerProps> = ({
  media,
  onAnimateToVideo,
  onRegenerate,
  isRegenerating,
  onToggleSave,
  isSaved,
}) => {
  const [isZoomed, setIsZoomed] = useState(false);

  const handleDownload = () => {
    if (!media.url) return;
    const ext = media.url.startsWith('data:image/jpeg')
      ? 'jpg'
      : media.url.startsWith('data:image/webp')
      ? 'webp'
      : 'png';
    const a = document.createElement('a');
    a.href = media.url;
    a.download = `myai-image-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="mt-3 rounded-2xl overflow-hidden border border-slate-800 bg-[#070B14] max-w-2xl shadow-lg">
      <div className="relative bg-black/50 flex items-center justify-center">
        <img
          src={media.url}
          alt={media.alt || media.prompt || 'Generated image'}
          className="w-full h-auto max-h-[480px] object-contain cursor-pointer"
          onClick={() => setIsZoomed(true)}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>

      <div className="px-3.5 py-2.5 bg-[#0B1020] border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <span>{media.resolution || 'HD'}</span>
          {media.aspectRatio && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{media.aspectRatio}</span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsZoomed(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#11192E] hover:bg-[#17213B] border border-slate-700 text-slate-100 text-xs font-medium transition min-h-[34px]"
            title="Preview full image"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Preview</span>
          </button>

          {onRegenerate && media.prompt && (
            <button
              type="button"
              disabled={isRegenerating}
              onClick={() => onRegenerate(media.prompt!, media.aspectRatio)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#11192E] hover:bg-[#17213B] border border-slate-700 disabled:opacity-50 text-slate-100 text-xs font-medium transition min-h-[34px]"
              title="Regenerate image"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
              <span>Regenerate</span>
            </button>
          )}

          {onAnimateToVideo && media.url && (
            <button
              type="button"
              onClick={() => onAnimateToVideo(media.url!, media.prompt || 'Animate this photo into a cinematic video')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition min-h-[34px]"
              title="Animate this photo into a video"
            >
              <Film className="w-3.5 h-3.5" />
              <span>Animate</span>
            </button>
          )}

          {onToggleSave && (
            <button
              type="button"
              onClick={onToggleSave}
              className={`p-2 rounded-xl transition min-h-[34px] min-w-[34px] flex items-center justify-center ${
                isSaved
                  ? 'text-blue-400 bg-blue-500/15'
                  : 'text-slate-300 hover:text-white hover:bg-[#11192E]'
              }`}
              title={isSaved ? 'Saved to Library' : 'Save to Library'}
            >
              <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
            </button>
          )}

          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#11192E] hover:bg-[#17213B] border border-slate-700 text-slate-100 text-xs font-medium transition min-h-[34px]"
            title="Download image"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </button>
        </div>
      </div>

      {isZoomed && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setIsZoomed(false)}
        >
          <div className="relative max-w-5xl max-h-[90dvh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={media.url}
              alt="Full preview"
              className="w-full h-auto max-h-[82dvh] object-contain rounded-xl shadow-2xl"
              referrerPolicy="no-referrer"
            />
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-300">
              <span className="truncate max-w-md">{media.prompt}</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsZoomed(false)}
                  className="px-3 py-1.5 rounded-xl bg-[#11192E] hover:bg-[#17213B] border border-slate-700 text-white font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const InlineVideoPlayer: React.FC<MediaViewerProps> = ({ media, onToggleSave, isSaved }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const curr = videoRef.current.currentTime;
    const dur = videoRef.current.duration || 1;
    setCurrentTime(curr);
    setDuration(dur);
    setProgress((curr / dur) * 100);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const newTime = (parseFloat(e.target.value) / 100) * (videoRef.current.duration || 1);
    videoRef.current.currentTime = newTime;
    setProgress(parseFloat(e.target.value));
  };

  const toggleFullscreen = () => {
    if (!videoRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      videoRef.current.requestFullscreen();
    }
  };

  const handleDownload = () => {
    if (!media.url) return;
    const a = document.createElement('a');
    a.href = media.url;
    a.download = `myai-video-${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="mt-3 rounded-2xl overflow-hidden border border-slate-800 bg-black max-w-2xl shadow-xl">
      <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          src={media.url}
          poster={media.thumbnail}
          className="w-full h-full object-contain"
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
          playsInline
          loop
          onClick={togglePlay}
        />

        {!isPlaying && (
          <button
            type="button"
            onClick={togglePlay}
            className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-2xl transition transform hover:scale-105"
            aria-label="Play video"
          >
            <Play className="w-6 h-6 translate-x-0.5 fill-white" />
          </button>
        )}
      </div>

      <div className="px-4 py-3 bg-[#0a101d] border-t border-slate-800 flex flex-col gap-2">
        <input
          type="range"
          min="0"
          max="100"
          value={progress || 0}
          onChange={handleSeek}
          aria-label="Video timeline"
          className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-200">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              className="p-2 rounded-lg hover:bg-white/10 text-white transition"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
            </button>
            <button
              type="button"
              onClick={toggleMute}
              className="p-2 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <span className="font-mono tabular-nums text-[11px] text-slate-400">
              {formatTime(currentTime)} / {formatTime(duration || 10)}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {onToggleSave && (
              <button
                type="button"
                onClick={onToggleSave}
                className={`p-2 rounded-lg transition ${isSaved ? 'text-blue-400' : 'text-slate-300 hover:text-white'}`}
                title="Save to Library"
              >
                <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 transition text-xs font-medium"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition"
              title="Fullscreen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const InlineAudioPlayer: React.FC<MediaViewerProps> = ({ media, onToggleSave, isSaved }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showLyrics, setShowLyrics] = useState(false);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const curr = audioRef.current.currentTime;
    const dur = audioRef.current.duration || 30;
    setCurrentTime(curr);
    setDuration(dur);
    setProgress((curr / dur) * 100);
  };

  const handleDownload = () => {
    if (!media.url) return;
    const a = document.createElement('a');
    a.href = media.url;
    a.download = `myai-music-${Date.now()}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="mt-3 rounded-2xl border border-slate-800 bg-[#0B1020] p-4 max-w-xl shadow-lg">
      <audio
        ref={audioRef}
        src={media.url}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
      />

      <div className="flex items-center gap-3.5">
        <button
          type="button"
          onClick={togglePlay}
          className="w-12 h-12 shrink-0 rounded-full gemini-gradient-bg text-white flex items-center justify-center shadow-md hover:brightness-110 transition"
          aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
        >
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 translate-x-0.5 fill-white" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-white truncate">
            <Music className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="truncate">{media.prompt || 'Generated Audio Track'}</span>
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <input
              type="range"
              min="0"
              max="100"
              value={progress || 0}
              onChange={(e) => {
                if (!audioRef.current) return;
                const next = (parseFloat(e.target.value) / 100) * (audioRef.current.duration || 30);
                audioRef.current.currentTime = next;
                setProgress(parseFloat(e.target.value));
              }}
              aria-label="Audio scrubber"
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <span className="text-[11px] font-mono tabular-nums text-slate-300 shrink-0">
              {formatTime(currentTime)} / {formatTime(duration || 30)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {media.lyrics && (
            <button
              type="button"
              onClick={() => setShowLyrics(!showLyrics)}
              className="text-xs font-medium text-blue-400 hover:underline"
            >
              {showLyrics ? 'Hide Lyrics' : 'Show Lyrics'}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {onToggleSave && (
            <button
              type="button"
              onClick={onToggleSave}
              className={`p-2 rounded-xl transition ${isSaved ? 'text-blue-400' : 'text-slate-300 hover:text-white'}`}
              title="Save to Library"
            >
              <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
            </button>
          )}
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#11192E] hover:bg-[#17213B] border border-slate-700 text-slate-100 text-xs font-medium transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Audio</span>
          </button>
        </div>
      </div>

      {showLyrics && media.lyrics && (
        <div className="mt-3 p-3 rounded-xl bg-[#070B14] border border-slate-800 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
          {media.lyrics}
        </div>
      )}
    </div>
  );
};

export const InlineCanvasCard: React.FC<{ canvas: CanvasPayload }> = ({ canvas }) => {
  const [copied, setCopied] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);

  // Split slides by '---' or '## Slide' if slides mode
  const slides =
    canvas.kind === 'slides'
      ? canvas.content
          .split(/\n---\n|\n(?=##\s*Slide)/i)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const handleCopy = () => {
    navigator.clipboard.writeText(canvas.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    const blob = new Blob([canvas.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${canvas.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-3 rounded-2xl border border-slate-800 bg-[#070B14] overflow-hidden shadow-lg max-w-3xl">
      <div className="px-4 py-3 border-b border-slate-800 bg-[#0B1020] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <FileCode2 className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="font-semibold text-xs sm:text-sm text-white truncate">
            Canvas · {canvas.title}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#11192E] hover:bg-[#17213B] border border-slate-700 text-slate-100 text-xs font-medium transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {canvas.kind === 'slides' && slides.length > 1 ? (
        <div className="p-5">
          <div className="min-h-[220px] p-5 rounded-xl bg-[#050811] border border-slate-800">
            <MarkdownRenderer content={slides[slideIdx] || ''} />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
            <button
              type="button"
              disabled={slideIdx === 0}
              onClick={() => setSlideIdx((p) => Math.max(0, p - 1))}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#11192E] hover:bg-[#17213B] border border-slate-700 text-slate-100 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>
            <span className="font-mono tabular-nums">
              Slide {slideIdx + 1} of {slides.length}
            </span>
            <button
              type="button"
              disabled={slideIdx >= slides.length - 1}
              onClick={() => setSlideIdx((p) => Math.min(slides.length - 1, p + 1))}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#11192E] hover:bg-[#17213B] border border-slate-700 text-slate-100 disabled:opacity-40"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 sm:p-5 max-h-[520px] overflow-y-auto">
          <MarkdownRenderer content={canvas.content} />
        </div>
      )}
    </div>
  );
};
