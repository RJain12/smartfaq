"use client";

import ReactMarkdown from "react-markdown";
import { ChevronRight } from "lucide-react";
import { parseFaqMarkdownToPairs } from "@/lib/faq-parse";

export function SmartFaqAccordion({ faqs }: { faqs: string }) {
  const pairs = parseFaqMarkdownToPairs(faqs);

  if (pairs.length === 0 && faqs.trim()) {
    return (
      <div className="note-panel-faq prose prose-sm prose-slate max-w-none prose-headings:text-[#2c3e50] prose-p:text-[#212529]">
        <ReactMarkdown>{faqs}</ReactMarkdown>
      </div>
    );
  }

  if (pairs.length === 0) {
    return <p className="text-sm text-[#6c757d]">No SmartFAQs for this note.</p>;
  }

  return (
    <div className="space-y-2">
      {pairs.map((item, i) => (
        <details
          key={i}
          className="group rounded-lg border border-slate-200 bg-white shadow-sm open:border-[#cfe2ff] open:bg-[#fafcff]"
        >
          <summary className="flex cursor-pointer list-none items-start gap-2 px-3 py-2.5 text-left text-sm font-medium leading-snug text-[#2c3e50] marker:content-none [&::-webkit-details-marker]:hidden">
            <ChevronRight
              className="mt-0.5 h-4 w-4 shrink-0 text-[#17a2b8] transition-transform duration-200 group-open:rotate-90"
              aria-hidden
            />
            <span>{item.question}</span>
          </summary>
          <div className="border-t border-slate-100 px-3 pb-3 pl-10 pr-3 pt-2 text-sm leading-relaxed text-[#212529]">
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              }}
            >
              {item.answer}
            </ReactMarkdown>
          </div>
        </details>
      ))}
    </div>
  );
}
