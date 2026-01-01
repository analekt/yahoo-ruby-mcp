#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Client ID from environment variable
const CLIENT_ID = process.env.YAHOO_CLIENT_ID;

if (!CLIENT_ID) {
  console.error("Error: YAHOO_CLIENT_ID environment variable is required");
  process.exit(1);
}

const API_ENDPOINT = "https://jlp.yahooapis.jp/FuriganaService/V2/furigana";

// Maximum text size per request (in bytes) - leaving room for JSON overhead
const MAX_CHUNK_SIZE = 3000;

// Types for API response
interface SubWord {
  surface: string;
  furigana?: string;
  roman?: string;
}

interface Word {
  surface: string;
  furigana?: string;
  roman?: string;
  subword?: SubWord[];
}

interface FuriganaResult {
  word: Word[];
}

interface ApiResponse {
  id: string;
  jsonrpc: string;
  result?: FuriganaResult;
  error?: {
    code: number;
    message: string;
  };
}

// Function to call Yahoo Furigana API
async function getFurigana(
  text: string,
  grade?: number
): Promise<ApiResponse> {
  const requestBody: {
    id: string;
    jsonrpc: string;
    method: string;
    params: { q: string; grade?: number };
  } = {
    id: "1",
    jsonrpc: "2.0",
    method: "jlp.furiganaservice.furigana",
    params: {
      q: text,
    },
  };

  if (grade !== undefined && grade >= 1 && grade <= 8) {
    requestBody.params.grade = grade;
  }

  const response = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": `Yahoo AppID: ${CLIENT_ID}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as ApiResponse;
}

// Split text into chunks at sentence boundaries
function splitTextIntoChunks(text: string): string[] {
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(text);

  // If text fits in one chunk, return as is
  if (textBytes.length <= MAX_CHUNK_SIZE) {
    return [text];
  }

  const chunks: string[] = [];

  // Split by sentence-ending punctuation (Japanese and English)
  const sentences = text.split(/(?<=[。．！？\n])/);

  let currentChunk = "";

  for (const sentence of sentences) {
    const testChunk = currentChunk + sentence;
    const testBytes = encoder.encode(testChunk);

    if (testBytes.length > MAX_CHUNK_SIZE) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = sentence;
      } else {
        // Single sentence is too long, split by characters
        let remaining = sentence;
        while (remaining) {
          let end = remaining.length;
          while (encoder.encode(remaining.slice(0, end)).length > MAX_CHUNK_SIZE && end > 1) {
            end = Math.floor(end / 2);
          }
          // Try to find a better break point
          while (end < remaining.length && encoder.encode(remaining.slice(0, end + 1)).length <= MAX_CHUNK_SIZE) {
            end++;
          }
          chunks.push(remaining.slice(0, end));
          remaining = remaining.slice(end);
        }
      }
    } else {
      currentChunk = testChunk;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

// Process text with chunking support
async function processTextWithChunking(
  text: string,
  grade: number | undefined,
  format: OutputFormat
): Promise<string> {
  const chunks = splitTextIntoChunks(text);

  if (chunks.length === 1) {
    // Single chunk, process normally
    const response = await getFurigana(text, grade);
    if (response.error) {
      throw new Error(`APIエラー: ${response.error.message} (code: ${response.error.code})`);
    }
    if (!response.result) {
      throw new Error("結果が取得できませんでした");
    }
    return formatResult(response.result, format);
  }

  // Multiple chunks, process each and combine
  const results: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const response = await getFurigana(chunks[i], grade);

    if (response.error) {
      throw new Error(`APIエラー (チャンク ${i + 1}/${chunks.length}): ${response.error.message}`);
    }

    if (!response.result) {
      throw new Error(`結果が取得できませんでした (チャンク ${i + 1}/${chunks.length})`);
    }

    results.push(formatResult(response.result, format));
  }

  // For roman format, join with newlines; for others, join directly
  return format === "roman" ? results.join("\n") : results.join("");
}

// Output format types
type OutputFormat = "bracket" | "ruby" | "roman";

// Format with bracket notation: 漢字（かんじ）
function formatBracket(result: FuriganaResult): string {
  const parts: string[] = [];

  for (const word of result.word) {
    if (word.furigana && word.surface !== word.furigana) {
      parts.push(`${word.surface}（${word.furigana}）`);
    } else if (word.subword) {
      const subParts = word.subword
        .map((sw) => {
          if (sw.furigana && sw.surface !== sw.furigana) {
            return `${sw.surface}（${sw.furigana}）`;
          }
          return sw.surface;
        })
        .join("");
      parts.push(subParts);
    } else {
      parts.push(word.surface);
    }
  }

  return parts.join("");
}

// Format with HTML ruby tags: <ruby>漢字<rt>かんじ</rt></ruby>
function formatRuby(result: FuriganaResult): string {
  const parts: string[] = [];

  for (const word of result.word) {
    if (word.furigana && word.surface !== word.furigana) {
      parts.push(`<ruby>${word.surface}<rt>${word.furigana}</rt></ruby>`);
    } else if (word.subword) {
      const subParts = word.subword
        .map((sw) => {
          if (sw.furigana && sw.surface !== sw.furigana) {
            return `<ruby>${sw.surface}<rt>${sw.furigana}</rt></ruby>`;
          }
          return sw.surface;
        })
        .join("");
      parts.push(subParts);
    } else {
      parts.push(word.surface);
    }
  }

  return parts.join("");
}

// Format with roman characters
function formatWithRoman(result: FuriganaResult): string {
  const lines: string[] = [];

  for (const word of result.word) {
    const surface = word.surface;
    const furigana = word.furigana || "";
    const roman = word.roman || "";

    if (word.subword) {
      const subDetails = word.subword
        .map((sw) => `  - ${sw.surface}: ${sw.furigana || ""} (${sw.roman || ""})`)
        .join("\n");
      lines.push(`${surface}:\n${subDetails}`);
    } else if (furigana || roman) {
      lines.push(`${surface}: ${furigana} (${roman})`);
    } else {
      lines.push(`${surface}`);
    }
  }

  return lines.join("\n");
}

// Create MCP server
const server = new McpServer({
  name: "yahoo-furigana",
  version: "1.0.0",
});

// Format result based on output format
function formatResult(result: FuriganaResult, format: OutputFormat): string {
  switch (format) {
    case "ruby":
      return formatRuby(result);
    case "roman":
      return formatWithRoman(result);
    case "bracket":
    default:
      return formatBracket(result);
  }
}

// Register the furigana tool
server.tool(
  "gen_furigana",
  "日本語テキストにふりがな（ひらがな読み）を付けます。漢字かな混じりのテキストを入力すると、各単語の読み方を返します。",
  {
    text: z.string().describe("ふりがなを付けたい日本語テキスト"),
    grade: z
      .number()
      .min(1)
      .max(8)
      .optional()
      .describe(
        "学年指定（1-8）。指定した学年までに習う漢字にはふりがなを付けません。1=小1, 2=小2, ..., 6=小6, 7=中学, 8=それ以上"
      ),
    output_format: z
      .enum(["bracket", "ruby", "roman"])
      .optional()
      .describe(
        "出力形式。bracket=括弧形式「漢字（かんじ）」、ruby=HTMLルビ形式「<ruby>漢字<rt>かんじ</rt></ruby>」、roman=ローマ字付き詳細形式（デフォルト: ruby）"
      ),
  },
  async ({ text, grade, output_format }) => {
    try {
      const format = output_format || "ruby";
      const formatted = await processTextWithChunking(text, grade, format);

      return {
        content: [
          {
            type: "text" as const,
            text: formatted,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        content: [
          {
            type: "text" as const,
            text: `エラーが発生しました: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Yahoo Furigana MCP server started");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
