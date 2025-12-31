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
      "User-Agent": "Yahoo AppID: " + CLIENT_ID,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as ApiResponse;
}

// Format the result for display
function formatResult(result: FuriganaResult): string {
  const lines: string[] = [];

  for (const word of result.word) {
    if (word.furigana && word.surface !== word.furigana) {
      lines.push(`${word.surface}（${word.furigana}）`);
    } else if (word.subword) {
      const subParts = word.subword
        .map((sw) => {
          if (sw.furigana && sw.surface !== sw.furigana) {
            return `${sw.surface}（${sw.furigana}）`;
          }
          return sw.surface;
        })
        .join("");
      lines.push(subParts);
    } else {
      lines.push(word.surface);
    }
  }

  return lines.join("");
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
    include_roman: z
      .boolean()
      .optional()
      .describe("ローマ字も含めた詳細出力にするかどうか（デフォルト: false）"),
  },
  async ({ text, grade, include_roman }) => {
    try {
      const response = await getFurigana(text, grade);

      if (response.error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `APIエラー: ${response.error.message} (code: ${response.error.code})`,
            },
          ],
          isError: true,
        };
      }

      if (!response.result) {
        return {
          content: [
            {
              type: "text" as const,
              text: "結果が取得できませんでした",
            },
          ],
          isError: true,
        };
      }

      const formatted = include_roman
        ? formatWithRoman(response.result)
        : formatResult(response.result);

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
