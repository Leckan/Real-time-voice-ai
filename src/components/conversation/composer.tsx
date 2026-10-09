"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function Composer({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <form
      className="mx-auto flex w-full max-w-3xl items-end gap-2 px-4 pb-3"
      onSubmit={(event) => {
        event.preventDefault();
        const next = text.trim();
        if (!next) return;
        onSend(next);
        setText("");
      }}
    >
      <label className="sr-only" htmlFor="composer">
        Message
      </label>
      <textarea
        id="composer"
        data-testid="composer"
        rows={2}
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder="Write a message"
        className="min-h-14 flex-1 resize-none rounded-2xl border border-line bg-panel px-4 py-3 outline-none"
      />
      <Button type="submit" variant="primary" disabled={disabled || !text.trim()}>
        Send
      </Button>
    </form>
  );
}
