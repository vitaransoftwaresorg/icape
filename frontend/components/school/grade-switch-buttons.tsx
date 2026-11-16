"use client";

import { cn } from "@/lib/utils";

export const STUDENT_GRADES = [3, 4, 5, 6, 7, 8, 9, 10] as const;
export type StudentGrade = (typeof STUDENT_GRADES)[number];

export function isStudentGrade(value: number): value is StudentGrade {
  return value >= 3 && value <= 10;
}

/** Keep only named rows + rows already assigned to grades 3–10. */
export function retainGradedStudents<T extends { grade: number; name: string }>(
  students: T[],
) {
  return students.filter(
    (s) => s.name.trim() || isStudentGrade(s.grade),
  );
}

export function ensureStudentsForGrade<T extends { grade: number; name: string }>(
  students: T[],
  grade: number,
  emptyFactory: (grade: number) => T,
  minRows = 30,
): T[] {
  const kept = retainGradedStudents(students);
  const ofGrade = kept.filter((s) => s.grade === grade);
  const others = kept.filter((s) => s.grade !== grade);
  const needsPad = ofGrade.length < minRows;
  const lastNamed = Boolean(ofGrade[ofGrade.length - 1]?.name.trim());
  // After padding, last row is empty — only need an explicit trailing row when already at min.
  const needsTrailing = !needsPad && lastNamed;

  // Avoid reallocating when this grade is already ready — prevents flash on switch.
  if (
    !needsPad &&
    !needsTrailing &&
    kept.length === students.length &&
    ofGrade.length > 0
  ) {
    return students;
  }

  let nextOfGrade = [...ofGrade];
  if (needsPad) {
    nextOfGrade = [
      ...nextOfGrade,
      ...Array.from({ length: minRows - nextOfGrade.length }, () =>
        emptyFactory(grade),
      ),
    ];
  }
  if (nextOfGrade[nextOfGrade.length - 1]?.name.trim()) {
    nextOfGrade = [...nextOfGrade, emptyFactory(grade)];
  }
  return [...others, ...nextOfGrade];
}

export function gradeStudentIndices(
  students: Array<{ grade: number }>,
  grade: number,
) {
  const indices: number[] = [];
  students.forEach((s, i) => {
    if (s.grade === grade) indices.push(i);
  });
  return indices;
}

export function namedCountByGrade(
  students: Array<{ grade: number; name: string }>,
) {
  const counts: Partial<Record<number, number>> = {};
  for (const s of students) {
    if (!s.name.trim() || !isStudentGrade(s.grade)) continue;
    counts[s.grade] = (counts[s.grade] || 0) + 1;
  }
  return counts;
}

/** Lowest grade (3–10) that has at least one named student; defaults to 3. */
export function firstFilledGrade(
  students: Array<{ grade: number; name: string }>,
): StudentGrade {
  for (const grade of STUDENT_GRADES) {
    if (students.some((s) => s.grade === grade && s.name.trim())) {
      return grade;
    }
  }
  return 3;
}

export function GradeSwitchButtons({
  activeGrade,
  onChange,
  counts,
  disabled,
}: {
  activeGrade: number;
  onChange: (grade: StudentGrade) => void;
  counts?: Partial<Record<number, number>>;
  disabled?: boolean;
}) {
  return (
    <div
      className="grid grid-cols-4 gap-2 sm:grid-cols-8"
      role="tablist"
      aria-label="Select grade"
    >
      {STUDENT_GRADES.map((grade) => {
        const active = activeGrade === grade;
        const hasStudents = (counts?.[grade] ?? 0) > 0;
        return (
          <button
            key={grade}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(grade)}
            className={cn(
              "flex flex-col items-center justify-center rounded-xl border px-2 py-2.5 text-center transition",
              active
                ? "border-brand bg-brand text-white shadow-sm"
                : hasStudents
                  ? "border-brand/30 bg-brand-soft text-brand hover:bg-brand-soft/80"
                  : "border-border bg-white text-brand hover:bg-brand-soft/60",
              disabled && "cursor-default opacity-70",
            )}
          >
            <span
              className={cn(
                "text-[10px] font-semibold uppercase tracking-wide",
                active ? "text-white/75" : "text-muted",
              )}
            >
              Grade
            </span>
            <span className="text-lg font-bold leading-none sm:text-xl">
              {grade}
            </span>
          </button>
        );
      })}
    </div>
  );
}
