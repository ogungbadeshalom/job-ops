/**
 * Golden-job fixtures for the scoring eval harness.
 *
 * These are hand-curated job listings paired with a human-judged
 * `expectedScoreBand` and a consistent candidate profile. The eval runner
 * (`orchestrator/scripts/eval-scoring.ts`) re-scores these under a given
 * prompt version and reports drift vs a baseline.
 *
 * Coverage is deliberately varied so a prompt change that helps one case but
 * hurts another shows up. Add cases here to grow the eval — this file is the
 * source of truth for coverage.
 *
 * IMPORTANT: `expectedScoreBand` values are HUMAN JUDGMENT, not ground truth.
 * The harness measures DRIFT between prompt versions and how often scores land
 * in their bands — it does not prove "correctness".
 */

import { createJob } from "../factories";
import type { Job } from "../../types";
import { SCORING_EVAL_PROFILE } from "./scoring-profile";

export interface ScoringEvalCase {
  /** Stable id used in eval output + result diffs. */
  id: string;
  /** The job to score. */
  job: Job;
  /** Human-judged [min, max] inclusive score band. */
  expectedScoreBand: [number, number];
  /** Why this case is in the set / what it exercises. */
  note: string;
}

const REACT_JD = `We are hiring a Senior Frontend Engineer to build accessible, performant web apps.
Requirements:
- 5+ years building production UIs with React and TypeScript
- Strong CSS, accessibility (WCAG), and testing (Jest, Playwright)
- Experience with state management (Redux/Zustand) and design systems
Nice to have: Next.js, Node.js, GraphQL
Remote-friendly; competitive salary and equity.`;

const BACKEND_JD = `Backend Engineer (Node.js). Build scalable APIs and services.
Requirements:
- 4+ years Node.js, TypeScript, PostgreSQL
- REST and GraphQL design, background jobs, observability
- AWS or GCP
Onsite, London. Salary £70k-£90k.`;

const QA_JD = `Manual QA Tester. Write and execute test cases for a legacy desktop app.
Requirements:
- 1+ year manual testing
- Attention to detail
Onsite only. No remote. $45k.`;

const DEVOPS_JD = `DevOps / Platform Engineer. Kubernetes, Terraform, CI/CD pipelines, on-call rotation.
Requirements: 3+ years SRE/DevOps, AWS, Terraform, Datadog.
Remote (US). $140k-$170k.`;

/**
 * The golden set. Order is stable; ids are stable across runs.
 */
export const SCORING_EVAL_JOBS: ScoringEvalCase[] = [
  {
    id: "strong-react-match",
    job: createJob({
      id: "eval-strong-react-match",
      title: "Senior Frontend Engineer",
      employer: "Canvas Labs",
      location: "Remote",
      salary: "$150,000 - $180,000",
      degreeRequired: "Bachelor's preferred",
      disciplines: "Frontend Engineering",
      jobDescription: REACT_JD,
    }),
    expectedScoreBand: [80, 100],
    note: "Clear strong match — candidate's top skills (React, TS, testing) are the JD's core asks.",
  },
  {
    id: "poor-qa-mismatch",
    job: createJob({
      id: "eval-poor-qa-mismatch",
      title: "Manual QA Tester",
      employer: "LegacyCorp",
      location: "Onsite - Austin, TX",
      salary: "$45,000",
      degreeRequired: null,
      disciplines: "Quality Assurance",
      jobDescription: QA_JD,
    }),
    expectedScoreBand: [0, 35],
    note: "Clear poor match — manual QA, low seniority, onsite, far below candidate's level/skills.",
  },
  {
    id: "missing-salary",
    job: createJob({
      id: "eval-missing-salary",
      title: "Senior Frontend Engineer",
      employer: "Stealth Startup",
      location: "Remote",
      salary: null,
      degreeRequired: null,
      disciplines: "Frontend Engineering",
      jobDescription: REACT_JD.replace(/competitive salary and equity\./i, ""),
    }),
    expectedScoreBand: [55, 80],
    note: "Strong skills match but salary missing — exercises the salary-penalty path; expect a score below strong-react-match.",
  },
  {
    id: "missing-job-description",
    job: createJob({
      id: "eval-missing-jd",
      title: "Frontend Engineer",
      employer: "VagueCo",
      location: "Remote",
      salary: "$130,000",
      degreeRequired: null,
      disciplines: null,
      jobDescription: null,
    }),
    expectedScoreBand: [20, 50],
    note: "Title alone, no JD — model has almost nothing to score against; expect a conservative/low-mid score and a 'missing info' reason.",
  },
  {
    id: "ambiguous-title",
    job: createJob({
      id: "eval-ambiguous-title",
      title: "Software Engineer",
      employer: "Generalist Inc",
      location: "Remote",
      salary: "$140,000",
      degreeRequired: null,
      disciplines: null,
      jobDescription:
        "We need a software engineer to work across the stack. Some frontend, some backend, some infra. Lots of variety.",
    }),
    expectedScoreBand: [40, 70],
    note: "Generic title + vague stack — exercises whether the scorer rewards plausible fit vs punishes ambiguity.",
  },
  {
    id: "backend-secondary-fit",
    job: createJob({
      id: "eval-backend-secondary",
      title: "Backend Engineer (Node.js)",
      employer: "APIWorks",
      location: "London (Onsite)",
      salary: "£70,000 - £90,000",
      degreeRequired: "Bachelor's",
      disciplines: "Backend Engineering",
      jobDescription: BACKEND_JD,
    }),
    expectedScoreBand: [45, 75],
    note: "Secondary fit — candidate is frontend-primary with some Node; onsite London. Mid-band: decent skills overlap, weaker on seniority/domain + location.",
  },
  {
    id: "devops-weak-fit",
    job: createJob({
      id: "eval-devops-weak",
      title: "DevOps Engineer",
      employer: "CloudScale",
      location: "Remote (US)",
      salary: "$140,000 - $170,000",
      degreeRequired: null,
      disciplines: "Infrastructure",
      jobDescription: DEVOPS_JD,
    }),
    expectedScoreBand: [15, 45],
    note: "Weak fit — DevOps/K8s/Terraform/on-call vs a frontend-focused candidate; high salary/remote can't offset the skill gap.",
  },
  {
    id: "onsite-only-location-mismatch",
    job: createJob({
      id: "eval-onsite-only",
      title: "Senior Frontend Engineer",
      employer: "OfficeFirst",
      location: "Onsite - New York, NY (no remote)",
      salary: "$160,000",
      degreeRequired: "Bachelor's",
      disciplines: "Frontend Engineering",
      jobDescription: `${REACT_JD}\n\nThis role is 100% onsite in our NYC office. No remote or hybrid option.`,
    }),
    expectedScoreBand: [50, 75],
    note: "Skills match strongly but location is a hard onsite mismatch vs a remote candidate — exercises location penalty without being a full mismatch.",
  },
  {
    id: "over-qualified",
    job: createJob({
      id: "eval-over-qualified",
      title: "Junior Frontend Developer",
      employer: "BootcampGrad",
      location: "Remote",
      salary: "$65,000",
      degreeRequired: null,
      disciplines: "Frontend",
      jobDescription:
        "Entry-level frontend role for a recent bootcamp grad. Basic HTML/CSS/JS. Mentored. 0-1 years experience.",
    }),
    expectedScoreBand: [25, 55],
    note: "Skills overlap exists but the role is far below the candidate's seniority — exercises experience-level matching.",
  },
  {
    id: "remote-friendly-strong",
    job: createJob({
      id: "eval-remote-friendly",
      title: "Staff Frontend Engineer",
      employer: "DistributedCo",
      location: "Remote (Global)",
      salary: "$170,000 - $200,000",
      degreeRequired: null,
      disciplines: "Frontend Engineering",
      jobDescription: `${REACT_JD}\n\nStaff-level scope: set frontend architecture, mentor engineers, drive large projects end to end.`,
    }),
    expectedScoreBand: [85, 100],
    note: "Senior+ remote frontend, top-of-band salary, exact skill match — expect near the ceiling.",
  },
  {
    id: "title-translation-preserved",
    job: createJob({
      id: "eval-title-translated",
      title: "Ingénieur Frontend Senior",
      employer: "FrenchScale",
      location: "Remote (EU)",
      salary: "€70,000 - €90,000",
      degreeRequired: null,
      disciplines: "Frontend Engineering",
      jobDescription: REACT_JD,
    }),
    expectedScoreBand: [70, 95],
    note: "Localized title (French) over an English JD — exercises whether the scorer keys off the JD skills, not the translated title.",
  },
  {
    id: "low-info-listing",
    job: createJob({
      id: "eval-low-info",
      title: "Engineer",
      employer: "NoName",
      location: null,
      salary: null,
      degreeRequired: null,
      disciplines: null,
      jobDescription: "Hiring an engineer. Apply within.",
    }),
    expectedScoreBand: [0, 30],
    note: "Near-zero information across every field — should score low and ideally flag missing info; tests the floor.",
  },
];

export { SCORING_EVAL_PROFILE };
