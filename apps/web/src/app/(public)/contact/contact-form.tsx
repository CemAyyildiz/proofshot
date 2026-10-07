"use client";

import { useActionState } from "react";
import { ArrowRightIcon, CheckIcon } from "@/components/icons";
import { type ContactState, sendContact } from "./actions";

const input = "min-h-12 w-full rounded-xl border border-line bg-surface px-3 py-2.5 aria-[invalid=true]:border-danger";

export function ContactForm() {
  const [state, action, pending] = useActionState<ContactState, FormData>(sendContact, { status: "idle" });

  if (state.status === "sent") {
    return (
      <div role="status" className="card flex flex-col gap-3 p-6">
        <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-brand text-brand-fg">
          <CheckIcon className="size-6" />
        </span>
        <h2 className="display text-2xl">Message sent</h2>
        <p className="text-foreground/80">Thank you. We read every message and will reply to {state.email}.</p>
      </div>
    );
  }

  const field = (name: "name" | "email" | "company" | "role" | "message") => ({
    id: `contact-${name}`,
    name,
    defaultValue: state.values?.[name] ?? "",
    "aria-invalid": state.errors?.[name] ? true : undefined,
    "aria-describedby": state.errors?.[name] ? `contact-${name}-error` : undefined,
  });
  const error = (name: "name" | "email" | "company" | "role" | "message") =>
    state.errors?.[name] && (
      <p id={`contact-${name}-error`} className="text-sm text-danger">
        {state.errors[name]}
      </p>
    );

  return (
    <form action={action} noValidate className="card flex flex-col gap-5 p-5 sm:p-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="contact-name" className="text-sm font-medium">
            Your name
          </label>
          <input {...field("name")} type="text" autoComplete="name" required className={input} />
          {error("name")}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="contact-email" className="text-sm font-medium">
            Work email
          </label>
          <input {...field("email")} type="email" autoComplete="email" inputMode="email" required className={input} />
          {error("email")}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="contact-company" className="text-sm font-medium">
            Company
          </label>
          <input {...field("company")} type="text" autoComplete="organization" required className={input} />
          {error("company")}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="contact-role" className="text-sm font-medium">
            Role <span className="font-normal text-muted">(optional)</span>
          </label>
          <input {...field("role")} type="text" autoComplete="organization-title" className={input} />
          {error("role")}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="contact-message" className="text-sm font-medium">
          How do claim photos reach your team today, and what would you want from Proofshot?
        </label>
        <textarea {...field("message")} rows={6} required className={`${input} resize-y`} />
        {error("message")}
      </div>
      {/* Hidden from people and from assistive technology; only scripts fill it in. */}
      <div aria-hidden="true" className="hidden">
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      {state.status === "limited" && (
        <p role="alert" className="text-danger">
          That is a lot of messages in one hour. Try again later.
        </p>
      )}
      {state.status === "failed" && (
        <p role="alert" className="text-danger">
          Your message could not be sent. Nothing was lost: try again in a moment.
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          We use these details only to reply to you.{" "}
          <a href="/privacy" className="underline underline-offset-4">
            Privacy
          </a>
        </p>
        <button type="submit" disabled={pending} className="btn-primary shrink-0">
          {pending ? "Sending…" : "Send message"}
          {!pending && <ArrowRightIcon className="size-5" />}
        </button>
      </div>
    </form>
  );
}
