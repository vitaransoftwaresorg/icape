export type OlympiadPageId = "imo" | "iso" | "ieo";

export type OlympiadOverviewRow = {
  label: string;
  value: string;
};

export type OlympiadPageContent = {
  id: OlympiadPageId;
  code: string;
  fullName: string;
  subjectLabel: string;
  subjectFocus: string;
  examDate: string;
  examDay: string;
  intro: string[];
  overview: OlympiadOverviewRow[];
  patternBlurb: string;
  eligibility: string[];
  howToParticipate: string[];
  examDatesNote: string;
  samplePapersBlurb: string;
  awardsBlurb: string;
  prepareTips: string[];
};

const sharedOverviewBase = {
  organizingBody: "I-CAPE Pvt. Ltd (Innovative Talent Search Examination)",
  eligibility: "Students of Grades 3 to 10 enrolled through a participating school",
  examLevel: "School / National olympiad level",
  application: "Through the respective school (no individual self-registration)",
  examMode: "Offline (OMR-based)",
  fee: "INR 150 per Olympiad",
  frequency: "Once a year (Olympiad Year based)",
  languages: "English",
  duration:
    "60 minutes (Grades 3–5) · 90 minutes (Grades 6–10)",
} as const;

export const olympiadPages: Record<OlympiadPageId, OlympiadPageContent> = {
  imo: {
    id: "imo",
    code: "IMO",
    fullName: "Innovative Maths Olympiad",
    subjectLabel: "Maths",
    subjectFocus:
      "maths reasoning, number sense, algebra, geometry, and problem-solving",
    examDate: "14th December 2026",
    examDay: "Monday",
    intro: [
      "The Innovative Maths Olympiad (IMO) is an annual academic competition conducted by i-CAPE for students of Grades 3 to 10. It assesses maths understanding, logical ability, and problem-solving skills aligned to school curriculum and olympiad thinking.",
      "This page covers key details for i-CAPE IMO — overview, eligibility, exam date, pattern & syllabus, sample papers, awards, and how schools can participate for Olympiad Year 2026-2027.",
    ],
    overview: [
      { label: "Exam Organizing Body", value: sharedOverviewBase.organizingBody },
      { label: "Eligibility", value: sharedOverviewBase.eligibility },
      { label: "Exam Level", value: sharedOverviewBase.examLevel },
      {
        label: "Application Process",
        value: sharedOverviewBase.application,
      },
      { label: "Exam Date", value: "14th December 2026 (Monday)" },
      { label: "Exam Mode", value: sharedOverviewBase.examMode },
      { label: "Registration Fee", value: sharedOverviewBase.fee },
      { label: "Frequency of Conduct", value: sharedOverviewBase.frequency },
      {
        label: "Objective",
        value: "To identify and nurture passion for Maths",
      },
      { label: "Language", value: sharedOverviewBase.languages },
      { label: "Duration", value: sharedOverviewBase.duration },
    ],
    patternBlurb:
      "i-CAPE IMO uses multiple-choice questions on an OMR sheet. Grades 3–5 have 35 questions (70 marks, 60 minutes). Grades 6–10 have 50 questions (100 marks, 90 minutes). Each question carries 2 marks with no negative marking. Syllabus areas include numbers, arithmetic, geometry, mensuration, algebra, and data handling as applicable to each grade.",
    eligibility: [
      "Students of Grades 3 to 10 studying in a participating school may appear for IMO.",
      "A student should appear for the olympiad of their own grade only.",
      "Registration is done through the school — individual student applications are not accepted.",
    ],
    howToParticipate: [
      "Schools download the School and Student Registration Forms from the i-CAPE website.",
      "Complete school and student details carefully, including olympiad choices (IMO / ISO / IEO).",
      "Remit INR 150 per Olympiad and keep the payment proof.",
      "Submit filled forms and payment proof to i-CAPE on WhatsApp (+91 80745 63902) on or before 31th October 2026.",
    ],
    examDatesNote:
      "i-CAPE Innovative Maths Olympiad (IMO) for Olympiad Year 2026-2027 will be held on 14th December 2026 (Monday).",
    samplePapersBlurb:
      "i-CAPE has released IMO model papers for Grades 3 to 10. Schools and students can view or download the PDFs to understand the exam pattern and practise for the olympiad.",
    awardsBlurb:
      "Outstanding performers in i-CAPE olympiads are recognised through national ranker trophies and certificates, top-performer scholarships and excellence certificates, school toppers’ medals and merit certificates, participation certificates for all students, plus school and teacher awards for exceptional contribution.",
    prepareTips: [
      "Study the grade-wise IMO pattern and syllabus on the Pattern page.",
      "Practise with official i-CAPE IMO model papers from the Model Papers & Previous Papers page.",
      "Strengthen fundamentals — numbers, operations, geometry, measurement, and reasoning.",
      "Take timed practice to get comfortable with OMR marking and exam duration.",
      "Revise carefully and avoid last-minute cramming; focus on clear concepts.",
    ],
  },
  iso: {
    id: "iso",
    code: "ISO",
    fullName: "Innovative Science Olympiad",
    subjectLabel: "Science",
    subjectFocus:
      "scientific reasoning, conceptual understanding, and application of science in daily life",
    examDate: "16th December 2026",
    examDay: "Wednesday",
    intro: [
      "The Innovative Science Olympiad (ISO) is an annual academic competition conducted by i-CAPE for students of Grades 3 to 10. It assesses scientific knowledge, observation skills, and logical ability across biology, chemistry, physics, and environmental science themes suited to each grade.",
      "This page answers common questions about i-CAPE ISO — overview, eligibility, exam date, pattern & syllabus, sample papers, awards, and how schools can enrol students for Olympiad Year 2026-2027.",
    ],
    overview: [
      { label: "Exam Organizing Body", value: sharedOverviewBase.organizingBody },
      { label: "Eligibility", value: sharedOverviewBase.eligibility },
      { label: "Exam Level", value: sharedOverviewBase.examLevel },
      {
        label: "Application Process",
        value: sharedOverviewBase.application,
      },
      { label: "Exam Date", value: "16th December 2026 (Wednesday)" },
      { label: "Exam Mode", value: sharedOverviewBase.examMode },
      { label: "Registration Fee", value: sharedOverviewBase.fee },
      { label: "Frequency of Conduct", value: sharedOverviewBase.frequency },
      {
        label: "Objective",
        value: "To identify and foster passion for Science",
      },
      { label: "Language", value: sharedOverviewBase.languages },
      { label: "Duration", value: sharedOverviewBase.duration },
    ],
    patternBlurb:
      "i-CAPE ISO is an OMR-based multiple-choice examination. Grades 3–5 attempt 35 questions (70 marks, 60 minutes). Grades 6–10 attempt 50 questions (100 marks, 90 minutes). Each question carries 2 marks with no negative marking. Syllabus spans living world, matter, force and energy, earth and environment, and grade-appropriate biology, chemistry, and physics topics.",
    eligibility: [
      "Students of Grades 3 to 10 studying in a participating school may appear for ISO.",
      "A student should appear for the olympiad of their own grade only.",
      "Registration is done through the school — individual student applications are not accepted.",
    ],
    howToParticipate: [
      "Schools download the School and Student Registration Forms from the i-CAPE website.",
      "Complete school and student details carefully, including olympiad choices (IMO / ISO / IEO).",
      "Remit INR 150 per Olympiad and keep the payment proof.",
      "Submit filled forms and payment proof to i-CAPE on WhatsApp (+91 80745 63902) on or before 31th October 2026.",
    ],
    examDatesNote:
      "i-CAPE Innovative Science Olympiad (ISO) for Olympiad Year 2026-2027 will be held on 16th December 2026 (Wednesday).",
    samplePapersBlurb:
      "i-CAPE has released ISO model papers for Grades 3 to 10. Use these PDFs to familiarise students with question style, syllabus coverage, and exam timing.",
    awardsBlurb:
      "Outstanding performers in i-CAPE olympiads are recognised through national ranker trophies and certificates, top-performer scholarships and excellence certificates, school toppers’ medals and merit certificates, participation certificates for all students, plus school and teacher awards for exceptional contribution.",
    prepareTips: [
      "Review the grade-wise ISO pattern and syllabus on the Pattern page.",
      "Practise with official i-CAPE ISO model papers from the Model Papers & Previous Papers page.",
      "Build strong science fundamentals and connect concepts to real-life examples.",
      "Practise MCQs under timed conditions and mark answers carefully on OMR practice sheets.",
      "Revise key definitions, diagrams, and processes before the exam.",
    ],
  },
  ieo: {
    id: "ieo",
    code: "IEO",
    fullName: "Innovative English Olympiad",
    subjectLabel: "English",
    subjectFocus:
      "vocabulary, functional grammar, reading comprehension, and interactive English",
    examDate: "18th December 2026",
    examDay: "Friday",
    intro: [
      "The Innovative English Olympiad (IEO) is an annual academic competition conducted by i-CAPE for students of Grades 3 to 10. It assesses language skills across vocabulary and functional grammar, reading comprehension, and interactive English suited to each grade.",
      "This page covers i-CAPE IEO essentials — overview, eligibility, exam date, pattern & syllabus, sample papers, awards, and school participation steps for Olympiad Year 2026-2027.",
    ],
    overview: [
      { label: "Exam Organizing Body", value: sharedOverviewBase.organizingBody },
      { label: "Eligibility", value: sharedOverviewBase.eligibility },
      { label: "Exam Level", value: sharedOverviewBase.examLevel },
      {
        label: "Application Process",
        value: sharedOverviewBase.application,
      },
      { label: "Exam Date", value: "18th December 2026 (Friday)" },
      { label: "Exam Mode", value: sharedOverviewBase.examMode },
      { label: "Registration Fee", value: sharedOverviewBase.fee },
      { label: "Frequency of Conduct", value: sharedOverviewBase.frequency },
      {
        label: "Objective",
        value: "To identify and strengthen English language proficiency",
      },
      { label: "Language", value: sharedOverviewBase.languages },
      { label: "Duration", value: sharedOverviewBase.duration },
    ],
    patternBlurb:
      "i-CAPE IEO is an OMR-based multiple-choice examination covering Vocabulary and Functional Grammar, Reading Comprehension, and Interactive English. Grades 3–5 have 35 questions (70 marks, 60 minutes). Grades 6–10 have 50 questions (100 marks, 90 minutes). Each question carries 2 marks with no negative marking.",
    eligibility: [
      "Students of Grades 3 to 10 studying in a participating school may appear for IEO.",
      "A student should appear for the olympiad of their own grade only.",
      "Registration is done through the school — individual student applications are not accepted.",
    ],
    howToParticipate: [
      "Schools download the School and Student Registration Forms from the i-CAPE website.",
      "Complete school and student details carefully, including olympiad choices (IMO / ISO / IEO).",
      "Remit INR 150 per Olympiad and keep the payment proof.",
      "Submit filled forms and payment proof to i-CAPE on WhatsApp (+91 80745 63902) on or before 31th October 2026.",
    ],
    examDatesNote:
      "i-CAPE Innovative English Olympiad (IEO) for Olympiad Year 2026-2027 will be held on 18th December 2026 (Friday).",
    samplePapersBlurb:
      "i-CAPE has released IEO model papers for Grades 3 to 10. Schools and teachers can use these PDFs for classroom practice and revision before the exam.",
    awardsBlurb:
      "Outstanding performers in i-CAPE olympiads are recognised through national ranker trophies and certificates, top-performer scholarships and excellence certificates, school toppers’ medals and merit certificates, participation certificates for all students, plus school and teacher awards for exceptional contribution.",
    prepareTips: [
      "Go through the grade-wise IEO pattern and syllabus on the Pattern page.",
      "Practise with official i-CAPE IEO model papers from the Model Papers & Previous Papers page.",
      "Read regularly and revise grammar, vocabulary, and comprehension strategies.",
      "Practise interactive English situations — greetings, requests, conversations, and formal expressions.",
      "Attempt timed practice papers to improve accuracy and speed.",
    ],
  },
};
