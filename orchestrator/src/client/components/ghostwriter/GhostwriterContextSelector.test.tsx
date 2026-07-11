import type { JobDocument, JobNote } from "@shared/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GhostwriterContextSelector } from "./GhostwriterContextSelector";

const makeNote = (overrides: Partial<JobNote>): JobNote => ({
  id: "note-1",
  jobId: "job-1",
  title: "Recruiter call",
  content: "Bring examples about reliability work.",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const makeDocument = (overrides: Partial<JobDocument> = {}): JobDocument => ({
  id: "doc-1",
  jobId: "job-1",
  fileName: "take-home.md",
  mediaType: "text/markdown",
  byteSize: 1024,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

function renderSelector(
  overrides: Partial<
    React.ComponentProps<typeof GhostwriterContextSelector>
  > = {},
) {
  return render(
    <GhostwriterContextSelector
      notes={[makeNote({})]}
      documents={[makeDocument()]}
      selectedNoteIds={[]}
      selectedDocumentIds={[]}
      onNotesChange={vi.fn()}
      onDocumentsChange={vi.fn()}
      {...overrides}
    />,
  );
}

describe("GhostwriterContextSelector", () => {
  it("renders notes and documents in one context picker", () => {
    const onNotesChange = vi.fn();
    const onDocumentsChange = vi.fn();
    renderSelector({ onNotesChange, onDocumentsChange });

    fireEvent.click(screen.getByRole("button", { name: /context/i }));

    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Recruiter call/));
    fireEvent.click(screen.getByLabelText(/take-home.md/));

    expect(onNotesChange).toHaveBeenCalledWith(["note-1"]);
    expect(onDocumentsChange).toHaveBeenCalledWith(["doc-1"]);
  });

  it("shows combined selected count in the trigger", () => {
    renderSelector({
      selectedNoteIds: ["note-1"],
      selectedDocumentIds: ["doc-1"],
    });

    expect(
      screen.getByRole("button", { name: /2 context/i }),
    ).toBeInTheDocument();
  });

  it("shows estimated token counts for selected context", () => {
    renderSelector({
      notes: [
        makeNote({
          id: "note-1",
          content: "A".repeat(400),
        }),
      ],
      documents: [
        makeDocument({
          id: "doc-1",
          byteSize: 800,
        }),
      ],
      selectedNoteIds: ["note-1"],
      selectedDocumentIds: ["doc-1"],
    });

    fireEvent.click(screen.getByRole("button", { name: /2 context/i }));

    // Note estimate (100 tokens) appears in both the popover header total and
    // the Notes group header. Documents never produce a token estimate.
    expect(screen.getAllByText("≈100 tokens")).toHaveLength(2);
  });

  it("does not show document byte sizes as token estimates or trim badges", () => {
    renderSelector({
      documents: [
        makeDocument({
          id: "doc-1",
          fileName: "large-brief.pdf",
          mediaType: "application/pdf",
          byteSize: 500_000,
        }),
      ],
      selectedDocumentIds: ["doc-1"],
    });

    fireEvent.click(screen.getByRole("button", { name: /1 context/i }));

    expect(screen.queryByText(/tokens/)).not.toBeInTheDocument();
    expect(screen.queryByText("Trimmed for AI")).not.toBeInTheDocument();
    expect(screen.getByText(/488.3 KB/)).toBeInTheDocument();
  });

  it("shows independent limits and trimming feedback per group", () => {
    const selectedNoteIds = Array.from(
      { length: 8 },
      (_, index) => `note-${index + 1}`,
    );

    renderSelector({
      notes: [
        ...selectedNoteIds.map((id, index) =>
          makeNote({
            id,
            title: `Selected note ${index + 1}`,
            content: "A".repeat(3001),
          }),
        ),
        makeNote({ id: "note-9", title: "Ninth note" }),
      ],
      selectedNoteIds,
    });

    fireEvent.click(screen.getByRole("button", { name: /8 context/i }));

    expect(screen.getAllByText("Trimmed for AI")).toHaveLength(8);
    expect(screen.getByLabelText(/Ninth note/)).toBeDisabled();
    expect(screen.getByText("8 note limit")).toBeInTheDocument();
  });

  it("disables unsupported documents", () => {
    renderSelector({
      documents: [
        makeDocument({
          id: "doc-unsupported",
          fileName: "archive.zip",
          mediaType: "application/zip",
        }),
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: /context/i }));

    expect(screen.getByLabelText(/archive.zip/)).toBeDisabled();
    expect(screen.getByText("PDF or text-like files only")).toBeInTheDocument();
  });

  it("allows DOCX documents", () => {
    const onDocumentsChange = vi.fn();
    renderSelector({
      documents: [
        makeDocument({
          id: "doc-docx",
          fileName: "interview-pack.docx",
          mediaType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      ],
      onDocumentsChange,
    });

    fireEvent.click(screen.getByRole("button", { name: /context/i }));
    fireEvent.click(screen.getByLabelText(/interview-pack.docx/));

    expect(onDocumentsChange).toHaveBeenCalledWith(["doc-docx"]);
  });
});
