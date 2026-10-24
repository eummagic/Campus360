
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { MessageCircle, Send, X } from "lucide-react";
import {
  answerCampusQuestion,
  assistantSuggestions,
  type CampusRole,
} from "@/lib/campus-assistant";

type ChatMessage = {
  role: "user" | "model";
  text: string;
};

const GREETING: ChatMessage = {
  role: "model",
  text: "Hi! How can I help you today?",
};

export function CampusAssistant({
  roles,
}: {
  roles: CampusRole[];
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function closeAssistant() {
    setOpen(false);
    toggleRef.current?.focus();
  }

  async function sendMessage(rawMessage: string) {
    const message = rawMessage.trim();

    if (!message || loading) return;

    if (message.length > 1000) {
      setError("Please keep your message under 1000 characters.");
      return;
    }

    const previousMessages = messages;
    const history = previousMessages
      .filter((item) => item.text !== GREETING.text)
      .slice(-6);

    setQuestion("");
    setError("");
    setMessages([...previousMessages, { role: "user", text: message }]);
    setLoading(true);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history,
        }),
      });

      const data: { answer?: string; error?: string } =
        await response.json();

      if (!response.ok || !data.answer) {
        throw new Error(data.error || "The assistant couldn't reply.");
      }

      setMessages((current) => [
        ...current,
        { role: "model", text: data.answer! },
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The assistant is temporarily unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(question);
  }

  function askSuggestion(suggestion: string) {
    void sendMessage(suggestion);
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6">
      {open ? (
        <section
          aria-labelledby="campus-assistant-title"
          className="mb-3 flex max-h-[min(70vh,36rem)] w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
        >
          <header className="flex items-center justify-between gap-3 border-b border-divider px-4 py-3">
            <div>
              <h2 id="campus-assistant-title" className="font-semibold">
                Campus360 Assistant
              </h2>
              <p className="text-xs text-muted-foreground">
                AI-powered campus guide
              </p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={closeAssistant}
              aria-label="Close Campus360 Assistant"
              className="flex size-11 items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </header>

          <div
            aria-live="polite"
            className="flex-1 space-y-3 overflow-y-auto p-4"
          >
            {messages.map((item, index) => (
              <div key={`${index}-${item.role}`} className="space-y-2">
                <p
                  className={`whitespace-pre-line rounded-xl p-3 text-sm ${
                    item.role === "user"
                      ? "ml-6 bg-primary text-primary-foreground"
                      : "mr-3 bg-muted"
                  }`}
                >
                  {item.text}
                </p>

                {item.role === "user" &&
                index === messages.length - 1 &&
                !loading
                  ? (() => {
                      const links = answerCampusQuestion(
                        item.text,
                        roles,
                      ).links;

                      return links.length ? (
                        <nav
                          aria-label="Related Campus360 pages"
                          className="flex flex-wrap gap-2"
                        >
                          {links.map((link) => (
                            <Link
                              key={link.href}
                              href={link.href}
                              onClick={() => setOpen(false)}
                              className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-primary-text hover:bg-muted"
                            >
                              {link.label}
                            </Link>
                          ))}
                        </nav>
                      ) : null;
                    })()
                  : null}
              </div>
            ))}

            {loading ? (
              <p role="status" className="mr-3 rounded-xl bg-muted p-3 text-sm">
                Thinking…
              </p>
            ) : null}

            {error ? (
              <p role="alert" className="rounded-lg p-2 text-sm text-red-500">
                {error}
              </p>
            ) : null}

            {messages.length === 1 && !loading ? (
              <div className="flex flex-wrap gap-2">
                {assistantSuggestions(roles).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => askSuggestion(suggestion)}
                    className="min-h-10 rounded-full border border-border px-3 py-2 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}

            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={submitQuestion}
            className="flex gap-2 border-t border-divider p-3"
          >
            <label
              className="sr-only"
              htmlFor="campus-assistant-question"
            >
              Ask the Campus360 assistant
            </label>
            <input
              id="campus-assistant-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask me anything…"
              maxLength={1000}
              disabled={loading}
              className="min-h-11 min-w-0 flex-1 rounded-lg border px-3 text-sm"
            />
            <button
              type="submit"
              aria-label="Send question"
              disabled={loading || !question.trim()}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text"
            >
              <Send aria-hidden="true" className="size-4" />
            </button>
          </form>
        </section>
      ) : null}

      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="ml-auto flex min-h-12 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {open ? (
          <X aria-hidden="true" className="size-5" />
        ) : (
          <MessageCircle aria-hidden="true" className="size-5" />
        )}
        {open ? "Close help" : "Campus360 help"}
      </button>
    </div>
  );
}
