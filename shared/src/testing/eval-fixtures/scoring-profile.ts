/**
 * Candidate profile fixture used by the scoring eval harness.
 *
 * Kept as a plain object (the scorer's `sanitizeProfileForPrompt` tolerates a
 * partial record). It is a single, consistent candidate so that score drift
 * across prompt versions reflects prompt/context changes — not candidate
 * changes. The profile is intentionally a senior, frontend-focused engineer,
 * which is what the `expectedScoreBand` values in scoring-jobs.ts are judged
 * against.
 *
 * If you change this profile, re-baseline the bands in scoring-jobs.ts.
 */

export const SCORING_EVAL_PROFILE = {
  basics: {
    label: "Senior Frontend Engineer",
    headline: "Senior Frontend Engineer (React / TypeScript)",
    summary:
      "Senior frontend engineer with 6 years building accessible, performant web applications. Strong in React, TypeScript, testing, and design systems.",
    location: "Remote (UTC+1)",
  },
  skills: [
    {
      name: "Frontend",
      keywords: ["React", "TypeScript", "JavaScript", "Next.js", "Redux", "Zustand"],
    },
    {
      name: "Styling & A11y",
      keywords: ["CSS", "Tailwind", "Accessibility", "WCAG", "Design Systems"],
    },
    {
      name: "Testing",
      keywords: ["Jest", "Playwright", "Testing Library"],
    },
    {
      name: "Tooling",
      keywords: ["Vite", "Webpack", "Node.js", "GraphQL", "Storybook"],
    },
  ],
  experience: [
    {
      company: "Canvas Labs",
      position: "Senior Frontend Engineer",
      period: "2021 - Present",
      summary:
        "Lead frontend on a design-system team. Built accessible component libraries in React/TypeScript; drove testing strategy with Playwright.",
    },
    {
      company: "Pixel & Co",
      position: "Frontend Engineer",
      period: "2018 - 2021",
      summary:
        "Shipped customer-facing React apps. Owned performance and a11y audits. Some Node/Express API work.",
    },
  ],
  projects: [
    {
      name: "Open-source component library",
      summary: "Accessible React component library, 4k+ stars.",
    },
  ],
  education: [
    {
      school: "State University",
      degree: "BSc Computer Science",
      period: "2014 - 2018",
    },
  ],
  languages: [
    { language: "English", fluency: "Fluent" },
    { language: "French", fluency: "Conversational" },
  ],
} as const;
