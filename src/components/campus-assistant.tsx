"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { MessageCircle, Send, X } from "lucide-react";
import { answerCampusQuestion, assistantSuggestions, type AssistantReply, type CampusRole } from "@/lib/campus-assistant";

export function CampusAssistant({ roles }: { roles: CampusRole[] }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState<AssistantReply>({ text: "Hi! I’m the Campus360 demo guide. Ask me how to use the pages available to your account.", links: [] });
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

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

  function closeAssistant() {
    setOpen(false);
    toggleRef.current?.focus();
  }

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim()) return;
    const response = answerCampusQuestion(question, roles);
    setReply(response);
    setQuestion("");
  }

  function ask(suggestion: string) {
    const response = answerCampusQuestion(suggestion, roles);
    setReply(response);
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6">
      {open ? (
        <section aria-labelledby="campus-assistant-title" className="mb-3 flex max-h-[min(70vh,36rem)] w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          <header className="flex items-center justify-between gap-3 border-b border-divider px-4 py-3">
            <div><h2 id="campus-assistant-title" className="font-semibold">Campus360 Assistant</h2><p className="text-xs text-muted-foreground">Demo guide · predefined help</p></div>
            <button ref={closeRef} type="button" onClick={closeAssistant} aria-label="Close Campus360 Assistant" className="flex size-11 items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text"><X aria-hidden="true" className="size-5" /></button>
          </header>
          <div className="space-y-3 overflow-y-auto p-4">
            <p role="status" className="whitespace-pre-line rounded-xl bg-muted p-3 text-sm">{reply.text}</p>
            {reply.links.length ? <nav aria-label="Assistant suggestions" className="flex flex-wrap gap-2">{reply.links.map((link) => <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-primary-text hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text">{link.label}</Link>)}</nav> : null}
            <div className="flex flex-wrap gap-2">{assistantSuggestions(roles).map((suggestion) => <button key={suggestion} type="button" onClick={() => ask(suggestion)} className="min-h-10 rounded-full border border-border px-3 py-2 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text">{suggestion}</button>)}</div>
          </div>
          <form onSubmit={submitQuestion} className="flex gap-2 border-t border-divider p-3">
            <label className="sr-only" htmlFor="campus-assistant-question">Ask a Campus360 how-to question</label>
            <input id="campus-assistant-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask how to use Campus360…" className="min-h-11 min-w-0 flex-1 rounded-lg border px-3 text-sm" />
            <button type="submit" aria-label="Send question" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text"><Send aria-hidden="true" className="size-4" /></button>
          </form>
        </section>
      ) : null}
      <button ref={toggleRef} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="ml-auto flex min-h-12 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        {open ? <X aria-hidden="true" className="size-5" /> : <MessageCircle aria-hidden="true" className="size-5" />}{open ? "Close help" : "Campus360 help"}
      </button>
    </div>
  );
}
