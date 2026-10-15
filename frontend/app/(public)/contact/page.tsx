import Link from "next/link";
import {
  CalendarDays,
  FileText,
  IndianRupee,
  MapPin,
  MessageCircle,
  Phone,
} from "lucide-react";
import { PageShell } from "@/components/public/page-shell";
import { WHATSAPP_APP_HREF } from "@/lib/registration-announcement";

const contactCards = [
  {
    title: "Office address",
    icon: MapPin,
    body: (
      <>
        <p className="font-semibold text-brand">I-CAPE Pvt. Ltd</p>
        <p>HIG-143, KPHB Colony, 5th Phase,</p>
        <p>Hyderabad — 500072</p>
      </>
    ),
  },
  {
    title: "Phone",
    icon: Phone,
    body: (
      <a
        href="tel:+918074563902"
        className="text-xl font-bold text-brand hover:underline"
      >
        +91 80745 63902
      </a>
    ),
  },
  {
    title: "WhatsApp",
    icon: MessageCircle,
    body: (
      <>
        <p className="mb-3 text-muted">
          Send registration forms and payment proof on WhatsApp.
        </p>
        <a
          href={WHATSAPP_APP_HREF}
          className="inline-flex rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover"
        >
          Chat on WhatsApp
        </a>
      </>
    ),
  },
] as const;

const helpLinks = [
  {
    title: "Registration forms",
    description: "Download school and student forms for 2026-2027.",
    href: "/registration-forms",
    icon: FileText,
  },
  {
    title: "Registration fee",
    description: "INR 150 per Olympiad — QR & bank details.",
    href: "/registration-fee",
    icon: IndianRupee,
  },
  {
    title: "Exam schedule",
    description: "IMO, ISO, and IEO dates for Olympiad Year 2026-2027.",
    href: "/exam-schedule",
    icon: CalendarDays,
  },
] as const;

export default function ContactPage() {
  return (
    <PageShell
      title="Contact us"
      description="Reach I-CAPE Pvt. Ltd for school registration, exam support, and Olympiad Year 2026-2027 queries."
    >
      <div className="space-y-12">
        <p className="max-w-3xl text-base leading-relaxed text-muted sm:text-lg">
          For registration, payment confirmation, olympiad dates, or school
          support, contact the i-CAPE team using the details below. Schools
          should submit filled forms and payment proof on WhatsApp on or before{" "}
          <strong className="text-brand">31th October 2026</strong>.
        </p>

        <section>
          <h2 className="text-2xl font-bold text-brand sm:text-3xl">
            Get in touch
          </h2>
          <div className="mt-2 h-0.5 w-14 bg-accent" aria-hidden />
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {contactCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.title}
                  className="flex flex-col rounded-xl border border-accent/50 bg-surface p-6 shadow-[0_1px_2px_rgba(13,23,59,0.04)]"
                >
                  <span className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <h3 className="text-lg font-bold text-brand">{card.title}</h3>
                  <div className="mt-3 text-base leading-relaxed text-muted">
                    {card.body}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-brand sm:text-3xl">
            Quick help
          </h2>
          <div className="mt-2 h-0.5 w-14 bg-accent" aria-hidden />
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {helpLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-xl border border-accent/50 bg-surface p-5 shadow-[0_1px_2px_rgba(13,23,59,0.04)]"
                >
                  <Icon className="mb-3 size-6 text-accent" aria-hidden />
                  <h3 className="text-base font-bold text-brand">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">
                    {item.description}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-accent/50 bg-brand-soft px-5 py-6 sm:px-8">
          <h2 className="text-xl font-bold text-brand sm:text-2xl">
            Office location
          </h2>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted">
            I-CAPE Pvt. Ltd, HIG-143, KPHB Colony, 5th Phase, Hyderabad — 500072
          </p>
          <a
            href="https://www.google.com/maps/search/?api=1&query=HIG-143+KPHB+Colony+5th+Phase+Hyderabad+500072"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-brand hover:border-accent"
          >
            Open in Google Maps
          </a>
        </section>
      </div>
    </PageShell>
  );
}
