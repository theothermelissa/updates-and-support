// Lowercased, trimmed, inner whitespace collapsed, and a leading "the " dropped,
// so "The  Maple Street " matches "maple street".
export function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, " ").replace(/^the /, "");
}

export function isCorrectAnswer(answer: string, acceptedAnswers: string[]): boolean {
  const given = normalizeAnswer(answer);
  return given !== "" && acceptedAnswers.some((accepted) => normalizeAnswer(accepted) === given);
}
