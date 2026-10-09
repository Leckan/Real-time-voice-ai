"use client";

import { useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StoredConversation } from "@/lib/store/types";

export function Sidebar({
  conversations,
  activeId,
  open,
  onClose,
  onNew,
  onOpen,
  onRename,
  onDelete,
}: {
  conversations: StoredConversation[];
  activeId: string | null;
  open: boolean;
  onClose: () => void;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const filtered = conversations.filter((conversation) =>
    conversation.title.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <>
      {open ? <button type="button" className="fixed inset-0 z-30 bg-black/40 lg:hidden" aria-label="Close history" onClick={onClose} /> : null}
      <aside
        className={`${open ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-30 flex w-[min(320px,88vw)] flex-col border-r border-line bg-panel transition-transform lg:static lg:translate-x-0`}
      >
        <div className="flex items-center justify-between gap-2 p-4">
          <h2 className="font-display text-2xl">Calls</h2>
          <Button type="button" size="sm" variant="primary" onClick={onNew}>
            <Plus size={14} /> New
          </Button>
        </div>
        <label className="mx-4 mb-3 flex items-center gap-2 rounded-full border border-line px-3 py-2 text-sm">
          <Search size={14} className="text-mist" />
          <span className="sr-only">Search conversations</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="w-full bg-transparent outline-none"
          />
        </label>
        <ul className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
          {filtered.length === 0 ? <li className="px-3 py-6 text-sm text-mist">No conversations yet.</li> : null}
          {filtered.map((conversation) => (
            <li key={conversation.id}>
              {editing === conversation.id ? (
                <form
                  className="px-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onRename(conversation.id, draft);
                    setEditing(null);
                  }}
                >
                  <input
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={() => setEditing(null)}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2"
                    aria-label="Conversation name"
                  />
                </form>
              ) : (
                <div className={`rounded-2xl px-3 py-2 ${conversation.id === activeId ? "bg-panel-2" : "hover:bg-panel-2/70"}`}>
                  <button type="button" className="w-full text-left" onClick={() => { onOpen(conversation.id); onClose(); }}>
                    <span className="block truncate text-sm">{conversation.title}</span>
                    <span className="font-mono text-[10px] text-mist">{new Date(conversation.updatedAt).toLocaleString()}</span>
                  </button>
                  <div className="mt-1 flex gap-2">
                    <button
                      type="button"
                      className="text-xs text-mist hover:text-ink"
                      onClick={() => {
                        setEditing(conversation.id);
                        setDraft(conversation.title);
                      }}
                    >
                      Rename
                    </button>
                    {pendingDelete === conversation.id ? (
                      <button type="button" className="text-xs text-danger" onClick={() => onDelete(conversation.id)}>
                        Confirm delete
                      </button>
                    ) : (
                      <button type="button" className="inline-flex items-center gap-1 text-xs text-mist hover:text-ink" onClick={() => setPendingDelete(conversation.id)}>
                        <Trash2 size={12} /> Delete
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </aside>
    </>
  );
}
