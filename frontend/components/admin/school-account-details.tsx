import type { ComponentType, ReactNode } from "react";
import {
  Building2,
  GraduationCap,
  MapPin,
  UserRound,
  Wallet,
} from "lucide-react";
import { paymentReferenceField, type PaymentMethod } from "@/lib/payment-details";
import { cn } from "@/lib/utils";

export type SchoolAccountRegistrationDetail = {
  id: string;
  schoolCode: string;
  schoolName: string;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  country: string;
  countryOther: string;
  website: string;
  affiliation: string;
  affiliationOther: string;
  trustName: string;
  schoolMobile: string;
  landline: string;
  stdCode: string;
  email: string;
  principalName: string;
  principalMobile: string;
  principalEmail: string;
  contactName: string;
  phone: string;
  inchargeEmail: string;
  status: string;
  currentStep: number;
  submittedAt: string | null;
  updatedAt: string;
  olympiadYear: { label: string; code: string } | null;
  studentCount?: number;
  _count?: { students: number };
  payment: {
    status: string;
    paymentMethod?: PaymentMethod;
    utr: string;
    amountExpected: string | number;
  } | null;
  concessionFeePerStudent?: number | null;
};

export type SchoolAccountDetail = {
  id: string;
  email: string;
  password?: string;
  name: string | null;
  schoolName: string;
  schoolCode: string;
  city: string;
  state: string;
  district: string;
  status: string | null;
  studentCount: number;
  imoCount?: number;
  ieoCount?: number;
  isoCount?: number;
  olympiadTotal?: number;
  registration: SchoolAccountRegistrationDetail | null;
};

function statusClass(status: string | null) {
  switch (status) {
    case "APPROVED":
      return "bg-green-100 text-green-800 border-green-200";
    case "UNDER_REVIEW":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "REJECTED":
      return "bg-red-100 text-red-800 border-red-200";
    case "DRAFT":
      return "bg-brand-soft text-brand border-border";
    default:
      return "bg-background text-muted border-border";
  }
}

function displayValue(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

/** Longer values take more columns so they wrap cleanly without cropping. */
function spanForValue(text: string) {
  const len = text.length;
  if (text === "—" || len <= 18) return "col-span-1";
  if (len <= 36) return "sm:col-span-2";
  return "sm:col-span-2 lg:col-span-3";
}

function DetailItem({
  label,
  value,
  className,
}: {
  label: string;
  value?: string | number | null;
  className?: string;
}) {
  const text = displayValue(value);
  return (
    <div className={cn("min-w-0", spanForValue(text), className)}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words text-[15px] font-semibold leading-snug text-brand [overflow-wrap:anywhere]">
        {text}
      </dd>
    </div>
  );
}

function DetailSection({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/80 bg-white">
      <div className="flex items-center gap-2.5 border-b border-border/70 bg-brand-soft/40 px-3.5 py-2">
        <span className="inline-flex size-7 items-center justify-center rounded-md bg-brand text-accent">
          <Icon className="size-4" aria-hidden />
        </span>
        <h3 className="text-sm font-bold text-brand">{title}</h3>
      </div>
      <dl className="grid grid-cols-1 gap-x-5 gap-y-3 p-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </dl>
    </section>
  );
}

export function SchoolAccountDetailsView({
  account,
}: {
  account: SchoolAccountDetail;
}) {
  const reg = account.registration;
  const studentCount =
    account.studentCount ||
    reg?.studentCount ||
    reg?._count?.students ||
    0;
  const imo = account.imoCount ?? 0;
  const ieo = account.ieoCount ?? 0;
  const iso = account.isoCount ?? 0;
  const total = account.olympiadTotal ?? imo + ieo + iso;

  return (
    <div className="space-y-3.5">
      <header className="relative overflow-hidden rounded-xl bg-gradient-to-br from-brand via-brand to-brand-hover px-4.5 py-3.5 text-white sm:px-5 sm:py-4">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 20%, #d4af37 0%, transparent 40%), radial-gradient(circle at 90% 0%, #fff 0%, transparent 35%)",
          }}
          aria-hidden
        />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
              School profile
            </p>
            <h1 className="mt-1 break-words font-serif text-[1.375rem] font-semibold tracking-tight sm:text-[1.65rem]">
              {account.schoolName || account.name || "School account"}
            </h1>
            <p className="mt-2 flex items-start gap-1.5 text-sm text-white/75">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="break-words">
                {[account.city, account.district, account.state]
                  .filter(Boolean)
                  .join(", ") || "Location not added"}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-stretch gap-2">
            {account.schoolCode ? (
              <span className="inline-flex min-w-[4.5rem] flex-col items-center justify-center rounded-md bg-white/10 px-2.5 py-1 text-center">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-white/70">
                  Code
                </span>
                <span className="font-mono text-xs font-bold tracking-wider text-accent">
                  {account.schoolCode}
                </span>
              </span>
            ) : null}
            <span
              className={cn(
                "inline-flex min-w-[4.5rem] flex-col items-center justify-center rounded-md border px-2.5 py-1 text-center",
                statusClass(account.status),
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                Status
              </span>
              <span className="text-xs font-bold">
                {account.status || "None"}
              </span>
            </span>
            <span className="inline-flex min-w-[4.5rem] flex-col items-center justify-center rounded-md bg-white/10 px-2.5 py-1 text-center">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-white/70">
                Students
              </span>
              <span className="text-xs font-bold tabular-nums text-white">
                {studentCount}
              </span>
            </span>
            {(
              [
                { label: "IMO", count: imo },
                { label: "IEO", count: ieo },
                { label: "ISO", count: iso },
                { label: "Total", count: total },
              ] as const
            ).map((item) => (
              <span
                key={item.label}
                className={cn(
                  "inline-flex min-w-[4.5rem] flex-col items-center justify-center rounded-md px-2.5 py-1 text-center",
                  item.label === "Total"
                    ? "bg-accent text-brand"
                    : "bg-white/10 text-white",
                )}
              >
                <span
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-wide",
                    item.label === "Total" ? "text-brand/70" : "text-white/70",
                  )}
                >
                  {item.label}
                </span>
                <span className="text-xs font-bold tabular-nums">
                  {item.count}
                </span>
              </span>
            ))}
          </div>
        </div>
      </header>

      {reg ? (
        <div className="grid gap-3.5 lg:grid-cols-2">
          <DetailSection icon={Building2} title="School details">
            <DetailItem label="School name" value={reg.schoolName} />
            <DetailItem label="School code" value={reg.schoolCode} />
            <DetailItem
              label="Affiliation"
              value={
                reg.affiliation === "OTHER"
                  ? reg.affiliationOther || "Other"
                  : reg.affiliation
              }
            />
            <DetailItem label="Trust / Society" value={reg.trustName} />
            <DetailItem label="Website" value={reg.website} />
            <DetailItem label="School email" value={reg.email} />
            <DetailItem label="School mobile" value={reg.schoolMobile} />
            <DetailItem
              label="Landline"
              value={
                reg.stdCode
                  ? `${reg.stdCode} – ${reg.landline}`
                  : reg.landline
              }
            />
          </DetailSection>

          <DetailSection icon={MapPin} title="Address">
            <DetailItem label="Address" value={reg.address} />
            <DetailItem label="City" value={reg.city} />
            <DetailItem label="District" value={reg.district} />
            <DetailItem label="State" value={reg.state} />
            <DetailItem label="Pin code" value={reg.pincode} />
            <DetailItem
              label="Country"
              value={
                reg.country === "Other"
                  ? reg.countryOther || "Other"
                  : reg.country
              }
            />
          </DetailSection>

          <div className="space-y-3.5">
            <DetailSection icon={UserRound} title="Principal">
              <DetailItem label="Name" value={reg.principalName} />
              <DetailItem label="Mobile" value={reg.principalMobile} />
              <DetailItem label="Email" value={reg.principalEmail} />
            </DetailSection>

            <DetailSection icon={GraduationCap} title="Olympiad incharge">
              <DetailItem label="Name" value={reg.contactName} />
              <DetailItem label="Mobile" value={reg.phone} />
              <DetailItem label="Email" value={reg.inchargeEmail} />
            </DetailSection>
          </div>

          {reg.payment ? (
            <DetailSection icon={Wallet} title="Payment">
              <DetailItem label="Status" value={reg.payment.status} />
              <DetailItem
                label="Method"
                value={reg.payment.paymentMethod || "UPI"}
              />
              <DetailItem
                label={paymentReferenceField(
                  reg.payment.paymentMethod || "UPI",
                ).label.replace(" *", "")}
                value={reg.payment.utr}
              />
              <DetailItem label="Olympiad entries" value={total} />
              <DetailItem
                label="Fee per Olympiad"
                value={
                  reg.concessionFeePerStudent != null &&
                  reg.concessionFeePerStudent > 0
                    ? `₹${reg.concessionFeePerStudent} (concession)`
                    : "₹150 (standard)"
                }
              />
              <DetailItem
                label="Total paid"
                value={`₹${Number(
                  reg.payment.amountExpected ??
                    total *
                      (reg.concessionFeePerStudent != null &&
                      reg.concessionFeePerStudent > 0
                        ? reg.concessionFeePerStudent
                        : 150),
                ).toLocaleString("en-IN")}`}
              />
            </DetailSection>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-white px-5 py-9 text-center">
          <Building2 className="mx-auto size-8 text-muted" aria-hidden />
          <p className="mt-2.5 text-[15px] font-semibold text-brand">
            No registration started
          </p>
          <p className="mt-1 text-[15px] text-muted">
            This account has not filled school registration details yet.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-white px-3.5 py-2.5 text-[13px] text-muted sm:px-4">
        Login email:{" "}
        <span className="font-semibold text-brand">{account.email}</span>
        {" · "}
        Password:{" "}
        <span className="font-mono font-semibold text-brand">
          {account.password || "—"}
        </span>
      </div>
    </div>
  );
}
