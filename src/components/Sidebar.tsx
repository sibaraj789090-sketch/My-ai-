import React, { useState } from 'react';
import {
  Plus,
  Search,
  FolderKanban,
  Image as ImageIcon,
  Clock,
  GraduationCap,
  SlidersHorizontal,
  Film,
  BookOpen,
  MessageSquare,
  Trash2,
  Edit3,
  Check,
  X,
  Shield,
  Settings,
  Share2,
} from 'lucide-react';
import { ChatConversation, UserAccount } from '../types';

export type LibraryFilter =
  | 'all'
  | 'conversations'
  | 'images'
  | 'videos'
  | 'audio'
  | 'files'
  | 'notebooks'
  | 'saved'
  | 'scheduled';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  chats: ChatConversation[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  onRenameChat: (chatId: string, newTitle: string) => void;
  onShareChat: (chatId: string, title: string) => void;
  onOpenLibrary: (tab: LibraryFilter) => void;
  onOpenStudentsMode: () => void;
  onOpenCustomize: () => void;
  onOpenAccount: () => void;
  onOpenSettings: () => void;
  onOpenAdmin: () => void;
  currentUser: UserAccount | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onRenameChat,
  onShareChat,
  onOpenLibrary,
  onOpenStudentsMode,
  onOpenCustomize,
  onOpenAccount,
  onOpenSettings,
  onOpenAdmin,
  currentUser,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const filteredChats = chats.filter((c) =>
    c.title.toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  const navItems: Array<{
    label: string;
    icon: React.FC<{ className?: string }>;
    onClick: () => void;
  }> = [
    { label: 'Library', icon: FolderKanban, onClick: () => { onOpenLibrary('all'); onClose(); } },
    { label: 'Images', icon: ImageIcon, onClick: () => { onOpenLibrary('images'); onClose(); } },
    { label: 'Scheduled', icon: Clock, onClick: () => { onOpenLibrary('scheduled'); onClose(); } },
    { label: 'Students', icon: GraduationCap, onClick: () => { onOpenStudentsMode(); onClose(); } },
    { label: 'Customize', icon: SlidersHorizontal, onClick: () => { onOpenCustomize(); onClose(); } },
    { label: 'Videos', icon: Film, onClick: () => { onOpenLibrary('videos'); onClose(); } },
    { label: 'Notebooks', icon: BookOpen, onClick: () => { onOpenLibrary('notebooks'); onClose(); } },
  ];

  const initials = (currentUser?.name || 'MY')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/65 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 w-full sm:w-80 bg-[#050811] border-r border-slate-800 flex flex-col transition-transform duration-200 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top Bar + New Chat */}
        <div className="p-4 border-b border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-base font-bold tracking-tight text-white">
              MY AI
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="w-full py-2.5 px-4 rounded-2xl gemini-gradient-bg text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-md hover:brightness-110 transition min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>

          {/* Live Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search chats..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#0B1020] border border-slate-700/80 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Navigation Links + Recent Chats */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          <div className="grid grid-cols-2 gap-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.onClick}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-slate-200 hover:text-white hover:bg-[#0B1020] transition text-left min-h-[42px]"
                >
                  <Icon className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}

            {currentUser?.role === 'admin' && (
              <button
                type="button"
                onClick={() => {
                  onOpenAdmin();
                  onClose();
                }}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 transition text-left min-h-[42px]"
              >
                <Shield className="w-4 h-4 shrink-0" />
                <span className="truncate">Admin Panel</span>
              </button>
            )}
          </div>

          {/* Recent Chat History */}
          <div>
            <div className="px-2 mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Recent Chats
            </div>

            {filteredChats.length === 0 ? (
              <div className="px-3 py-4 text-xs text-slate-400">
                {searchTerm ? 'No matching conversations.' : 'Start a conversation to see history.'}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredChats.map((chat) => {
                  const isActive = chat.id === activeChatId;
                  const isEditing = editingId === chat.id;

                  return (
                    <div
                      key={chat.id}
                      className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-xl transition min-h-[42px] ${
                        isActive
                          ? 'bg-blue-600/20 text-blue-300 font-semibold border border-blue-500/30'
                          : 'text-slate-200 hover:bg-[#0B1020]'
                      }`}
                    >
                      {isEditing ? (
                        <div className="flex-1 flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && editTitle.trim()) {
                                onRenameChat(chat.id, editTitle.trim());
                                setEditingId(null);
                              }
                            }}
                            autoFocus
                            className="flex-1 bg-[#0B1020] border border-blue-500 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (editTitle.trim()) {
                                onRenameChat(chat.id, editTitle.trim());
                              }
                              setEditingId(null);
                            }}
                            className="p-1 text-emerald-400"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectChat(chat.id);
                              onClose();
                            }}
                            className="flex-1 flex items-center gap-2.5 min-w-0 text-left"
                          >
                            <MessageSquare className="w-4 h-4 shrink-0 text-slate-400" />
                            <span className="text-xs sm:text-sm truncate">{chat.title}</span>
                          </button>

                          <div className="flex items-center gap-0.5 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition">
                            <button
                              type="button"
                              onClick={() => onShareChat(chat.id, chat.title)}
                              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                              title="Share public link"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(chat.id);
                                setEditTitle(chat.title);
                              }}
                              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                              title="Rename chat"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteChat(chat.id)}
                              className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400"
                              title="Delete chat"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Profile & Settings */}
        <div className="p-3 border-t border-slate-800 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              onOpenAccount();
              onClose();
            }}
            className="flex-1 flex items-center gap-3 p-2 rounded-2xl hover:bg-[#0B1020] transition min-w-0 text-left"
          >
            {currentUser?.avatar ? (
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-700"
              />
            ) : (
              <div className="w-9 h-9 rounded-full gemini-gradient-bg text-white text-xs font-bold flex items-center justify-center shrink-0">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-semibold text-white truncate">
                {currentUser?.name || 'MY AI User'}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {currentUser?.tier || 'Free'} Plan · {currentUser?.email}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenSettings();
              onClose();
            }}
            className="p-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition shrink-0"
            title="Settings"
            aria-label="Open Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </aside>
    </>
  );
};
