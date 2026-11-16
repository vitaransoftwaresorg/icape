import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { PageShell } from "@/components/public/page-shell";

const exams = [
  {
    code: "IMO",
    name: "Innovative Maths Olympiad",
    date: "14th December 2026",
    day: "Monday",
    href: "/imo",
  },
  {
    code: "ISO",
    name: "Innovative Science Olympiad",
    date: "16th December 2026",
    day: "Wednesday",
    href: "/iso",
  },
  {
    code: "IEO",
    name: "Innovative English Olympiad",
    date: "18th December 2026",
    day: "Friday",
    href: "/ieo",
  },
] as const;

export default function ExamSchedulePage() {
  return (
    <PageShell
      title="Exam Schedule"
      description="i-CAPE Olympiad Year 2026-2027 examination dates for IMO, ISO, and IEO."
    >
      <div className="space-y-12">
        <div className="max-w-3xl space-y-4 text-base leading-relaxed text-muted sm:text-lg">
          <h2 className="text-2xl font-bold text-brand sm:text-3xl">
            Important information
          </h2>
          <div className="h-0.5 w-14 bg-accent" aria-hidden />
          <p>
            The i-CAPE examinations for Olympiad Year 2026-2027 will be conducted
            in December 2026. Schools should complete registration on or before{" "}
            <strong className="text-brand">31th October 2026</strong> so that
            students can appear for the scheduled olympiads.
          </p>

          <ul className="space-y-3 pt-2">
            <li className="flex items-start gap-3">
              <CalendarDays
                className="mt-0.5 size-5 shrink-0 text-accent"
                aria-hidden
              />
              <span>
                Exams will be held on the dates mentioned in the timetable below.
              </span>
            </li>
          </ul>

          <p>
            For registration forms and fee payment, visit{" "}
            <Link
              href="/registration-forms"
              className="font-semibold text-brand underline underline-offset-2"
            >
              Download Registration Forms
            </Link>{" "}
            and{" "}
            <Link
              href="/registration-fee"
              className="font-semibold text-brand underline underline-offset-2"
            >
              Registration Fee
            </Link>
            .
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-brand sm:text-3xl">
            Examination timetable
          </h2>
          <div className="mt-2 h-0.5 w-14 bg-accent" aria-hidden />
          <p className="mt-3 text-base text-muted sm:text-lg">
            Olympiad Year 2026-2027
          </p>

          <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead className="bg-brand-stats text-white">
                <tr>
                  <th className="px-4 py-3 text-base font-semibold">Olympiad</th>
                  <th className="px-4 py-3 text-base font-semibold">Full name</th>
                  <th className="px-4 py-3 text-base font-semibold">Date</th>
                  <th className="px-4 py-3 text-base font-semibold">Day</th>
                </tr>
              </thead>
              <tbody>
                {exams.map((exam, index) => (
                  <tr
                    key={exam.code}
                    className={
                      index % 2 === 0 ? "bg-surface" : "bg-background"
                    }
                  >
                    <td className="px-4 py-4">
                      <Link
                        href={exam.href}
                        className="text-lg font-bold text-brand hover:underline"
                      >
                        {exam.code}
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={exam.href}
                        className="block text-base text-muted hover:text-brand"
                      >
                        {exam.name}
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={exam.href}
                        className="block text-base font-semibold text-brand"
                      >
                        {exam.date}
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={exam.href}
                        className="block text-base text-muted hover:text-brand"
                      >
                        {exam.day}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {exams.map((exam) => (
              <Link
                key={exam.code}
                href={exam.href}
                className="rounded-xl border border-accent/50 bg-surface p-5"
              >
                <p className="text-sm font-semibold uppercase tracking-wide text-accent">
                  {exam.code}
                </p>
                <h3 className="mt-1 text-lg font-bold text-brand">
                  {exam.date}
                </h3>
                <p className="mt-1 text-base text-muted">{exam.day}</p>
                <p className="mt-2 text-sm text-muted">{exam.name}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
