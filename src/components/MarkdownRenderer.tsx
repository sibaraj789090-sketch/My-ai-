import React, { useState } from 'react';
import { Copy, Check, Terminal } from 'lucide-react';
import { marked } from 'marked';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const parts = splitContentByCodeBlocks(content);

  return (
    <div className="markdown-content text-[15px] sm:text-base text-slate-100">
      {parts.map((part, index) => {
        if (part.type === 'code') {
          return (
            <CodeBlockCard
              key={`code-${index}`}
              code={part.content}
              language={part.language || 'text'}
            />
          );
        }

        const html = marked.parse(part.content, { async: false }) as string;
        return (
          <div
            key={`md-${index}`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </div>
  );
};

interface CodeBlockCardProps {
  code: string;
  language: string;
}

const CodeBlockCard: React.FC<CodeBlockCardProps> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3.5 rounded-2xl overflow-hidden border border-slate-800 bg-[#050811] shadow-sm">
      <div className="flex items-center justify-between px-4 py-2 bg-[#0B1020] border-b border-slate-800 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-mono uppercase font-semibold text-[11px] text-slate-200">
            {language}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-slate-800 text-slate-200 transition text-[11px] min-h-[28px]"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      <pre className="p-3.5 sm:p-4 text-xs sm:text-sm font-mono overflow-x-auto text-slate-100 leading-relaxed bg-[#050811]">
        <code>{code}</code>
      </pre>
    </div>
  );
};

function splitContentByCodeBlocks(
  content: string
): Array<{ type: 'text' | 'code'; content: string; language?: string }> {
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  const parts: Array<{ type: 'text' | 'code'; content: string; language?: string }> = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: content.substring(lastIndex, match.index),
      });
    }

    parts.push({
      type: 'code',
      language: match[1] || 'text',
      content: match[2].trim(),
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({
      type: 'text',
      content: content.substring(lastIndex),
    });
  }

  return parts;
}
