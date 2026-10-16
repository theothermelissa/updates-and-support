import { RequestError } from "./errors.js";

// An update's content is an ordered list of blocks. Only text blocks exist so far.
export type TextBlock = { type: "text"; text: string };
export type Block = TextBlock;

const MAX_BLOCKS = 20;
const MAX_TEXT = 20_000;

// The blocks a post or edit asks for. `blocks` wins; otherwise `body`, from pages loaded
// before blocks existed, becomes one text block.
export function blocksFrom(content: { blocks?: unknown; body?: unknown }): Block[] {
  if (content.blocks !== undefined) return validBlocks(content.blocks);
  if (typeof content.body === "string") return validBlocks([{ type: "text", text: content.body }]);
  throw new RequestError(400, "Expected blocks");
}

// Accepts exactly the shapes the spec allows and nothing else, trimming text.
export function validBlocks(input: unknown): Block[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_BLOCKS) {
    throw new RequestError(400, `An update must have 1 to ${MAX_BLOCKS} blocks`);
  }
  const blocks = input.map(validBlock);
  const total = blocks.reduce((sum, b) => sum + b.text.length, 0);
  if (total > MAX_TEXT) {
    throw new RequestError(400, `An update can have at most ${MAX_TEXT.toLocaleString("en-US")} characters of text`);
  }
  return blocks;
}

function validBlock(input: unknown): Block {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new RequestError(400, "Each block must be an object");
  }
  const { type, text, ...rest } = input as Record<string, unknown>;
  if (type !== "text" || Object.keys(rest).length > 0) throw new RequestError(400, "Unknown kind of block");
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed.length === 0) throw new RequestError(400, "A text block can't be empty");
  return { type: "text", text: trimmed };
}

// The text blocks joined by blank lines, for the `body` column.
export function bodyOf(blocks: Block[]): string {
  return blocks.map((b) => b.text).join("\n\n");
}
