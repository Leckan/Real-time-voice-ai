"use client";

import { motion, useReducedMotion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { CopyButton, MessageBody } from "@/components/conversation/message-body";
import type { ConversationMessage } from "@/lib/session/turn";

export function Transcript({
  messages,
  partial,
  visible,
  clips,
  onReplay,
  onRetry,
  canRetry,
}: {
  messages: ConversationMessage[];
  partial: string;
  visible: boolean;
  clips: Record<string, string>;
  onReplay: (id: string) => void;
  onRetry: () => void;
  canRetry: boolean;
}) {
  const reduce = useReducedMotion();
  if (!visible) return null;
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-2" data-testid="transcript">
      {messages.length === 0 && !partial ? (
        <div className="m-auto max-w-md text-center">
          <p className="font-display text-4xl leading-tight text-balance">The line is open when you are.</p>
          <p className="mt-3 text-sm text-mist">
            Start a call and speak as you would to someone in the room. Or type if you would rather write.
          </p>
        </div>
      ) : null}
      {messages.map((message) => {
        const speaking = message.role === "assistant" && message.status === "streaming";
        return (
          <motion.article
            key={message.id}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className={message.role === "user" ? "ml-auto max-w-[85%]" : "mr-auto max-w-[90%]"}
            aria-live={speaking ? "polite" : undefined}
          >
            <p className="mb-1 font-mono text-[10px] tracking-[0.16em] text-mist uppercase">
              {message.role === "user" ? "You" : "Auric"}
              {message.status === "interrupted" ? " · interrupted" : ""}
              {message.status === "error" ? " · not finished" : ""}
              {speaking ? " · speaking" : ""}
            </p>
            <div
              className={
                message.role === "user"
                  ? "rounded-3xl rounded-br-md bg-panel-2 px-4 py-3"
                  : "border-l border-accent/70 pl-4"
              }
            >
              <MessageBody text={message.text} streaming={speaking} />
            </div>
            {message.role === "assistant" && message.status !== "streaming" && message.text ? (
              <div className="mt-2 flex gap-3 pl-4">
                <CopyButton text={message.text} />
                {clips[message.id] ? (
                  <button type="button" className="text-xs text-mist hover:text-ink" onClick={() => onReplay(message.id)}>
                    Replay
                  </button>
                ) : null}
                {canRetry && lastAssistant?.id === message.id ? (
                  <button type="button" className="inline-flex items-center gap-1 text-xs text-mist hover:text-ink" onClick={onRetry}>
                    <RotateCcw size={13} /> Retry
                  </button>
                ) : null}
              </div>
            ) : null}
          </motion.article>
        );
      })}
      {partial ? (
        <p className="ml-auto max-w-[85%] text-right text-sm text-mist italic">{partial}</p>
      ) : null}
    </div>
  );
}
