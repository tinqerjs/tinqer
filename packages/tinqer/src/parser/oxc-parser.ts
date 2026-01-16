/**
 * OXC Parser wrapper
 * Wraps the OXC WASM parser for JavaScript/TypeScript parsing
 */

import { parseSync, rawTransferSupported, type ParserOptions } from "oxc-parser";

type InternalParserOptions = ParserOptions & {
  experimentalRawTransfer?: boolean;
  experimentalLazy?: boolean;
};

const DEFAULT_PARSER_OPTIONS: ParserOptions = {
  sourceType: "module",
};

/**
 * Parses JavaScript/TypeScript code using OXC parser
 * @param code The JavaScript/TypeScript code to parse
 * @returns The parsed AST or null if parsing fails
 */
export function parseJavaScript(code: string): unknown {
  try {
    const result = parseSync("query.ts", code, DEFAULT_PARSER_OPTIONS);

    if (result.errors.length > 0) {
      console.error("Parse errors:", result.errors);
      return null;
    }

    try {
      return result.program;
    } catch (error) {
      console.error("Failed to materialize AST:", error);

      if (!rawTransferSupported()) {
        return null;
      }

      const rawTransferOptions: InternalParserOptions = {
        ...DEFAULT_PARSER_OPTIONS,
        experimentalRawTransfer: true,
      };

      try {
        const rawTransferResult = parseSync("query.ts", code, rawTransferOptions);

        if (rawTransferResult.errors.length > 0) {
          console.error("Parse errors:", rawTransferResult.errors);
          return null;
        }

        return rawTransferResult.program;
      } catch (rawTransferError) {
        console.error("Failed to parse JavaScript (raw transfer):", rawTransferError);
        return null;
      }
    }
  } catch (error) {
    console.error("Failed to parse JavaScript:", error);
    return null;
  }
}
