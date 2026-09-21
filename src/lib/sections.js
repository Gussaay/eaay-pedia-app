// The app's top-level sections, shown as the tiles on the main page.
//
// Everything past MCQs and Flashcards is announced before it is built, on
// purpose: it tells people what is coming and lets them register interest, and
// the interest count is what decides which one gets built next. `live: false`
// is the only switch — a section goes live by flipping it and adding the
// route.
import { BookOpen, GraduationCap, Layers, Stethoscope, Siren } from 'lucide-react';

export const SECTIONS = [
  {
    key: 'mcqs',
    title: 'MCQs',
    tagline: 'Question banks and exams',
    to: '/mcqs',
    icon: BookOpen,
    live: true,
    // Tailwind needs whole class names in the source to keep them, so these
    // are written out rather than built from the key at runtime.
    tint: 'bg-brand-50 text-brand-700',
    ring: 'group-hover:ring-brand-200',
  },
  {
    key: 'flashcards',
    title: 'Flash Cards',
    tagline: 'Learn and revise by system',
    to: '/flashcards',
    icon: Layers,
    live: true,
    tint: 'bg-violet-50 text-violet-700',
    ring: 'group-hover:ring-violet-200',
  },
  {
    key: 'osce',
    title: 'Clinical OSCE',
    tagline: 'Stations, cases and marking',
    to: '/soon/osce',
    icon: Stethoscope,
    live: false,
    tint: 'bg-emerald-50 text-emerald-700',
    ring: 'group-hover:ring-emerald-200',
  },
  {
    key: 'oncall',
    title: 'On Call Tool',
    tagline: 'Doses, fluids and emergencies',
    to: '/soon/oncall',
    icon: Siren,
    live: false,
    tint: 'bg-rose-50 text-rose-700',
    ring: 'group-hover:ring-rose-200',
  },
  {
    key: 'courses',
    title: 'Courses',
    tagline: 'Structured learning tracks',
    to: '/soon/courses',
    icon: GraduationCap,
    live: false,
    tint: 'bg-amber-50 text-amber-700',
    ring: 'group-hover:ring-amber-200',
  },
];

export const sectionByKey = (key) => SECTIONS.find((s) => s.key === key) || null;

/** What each upcoming section will do, for its own announcement page. */
export const COMING_SOON = {
  osce: {
    blurb:
      'Practise clinical stations the way they are actually examined: a case, a task, a time limit, then the marking scheme you were judged against.',
    points: [
      'Short and long cases with structured marking sheets',
      'History, examination and communication stations',
      'Photographs, X-rays and growth charts to interpret',
      'Time yourself, then see where the marks went',
    ],
  },
  oncall: {
    blurb:
      'The things you need in the middle of a night shift, with the arithmetic already done and nothing to scroll past.',
    points: [
      'Weight-based drug doses, checked twice',
      'Fluid and electrolyte calculators, including maintenance and deficit',
      'Emergency algorithms: seizures, shock, DKA, anaphylaxis',
      'Normal ranges by age, at a glance',
    ],
  },
  courses: {
    blurb:
      'Guided tracks that put the MCQs, flashcards and cases in an order that builds on itself, instead of leaving you to choose.',
    points: [
      'Short lessons with a clear finish line',
      'A built-in mix of reading, cards and questions',
      'Progress you can pick up where you left it',
      'A certificate when you complete a track',
    ],
  },
};
