// Lowercased, trimmed, inner whitespace collapsed, and a leading "the " dropped,
// so "The  Maple Street " matches "maple street".
export function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, " ").replace(/^the /, "");
}

export function isCorrectAnswer(answer: string, acceptedAnswers: string[]): boolean {
  const given = normalizeAnswer(answer);
  return given !== "" && acceptedAnswers.some((accepted) => normalizeAnswer(accepted) === given);
}

// Whether an answer that worked before a change stops working after it, so anyone who
// got in with it should have to answer again.
export function dropsAnAnswer(before: string[], after: string[]): boolean {
  const kept = new Set(after.map(normalizeAnswer));
  return before.map(normalizeAnswer).some((answer) => answer !== "" && !kept.has(answer));
}
