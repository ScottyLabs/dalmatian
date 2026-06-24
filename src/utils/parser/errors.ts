import { getTokenDisplay, getTokenLocation, SourceLocation, Token } from "./tokenizer.ts";

export class ParserError extends Error {
    constructor(
        message: string,
        public readonly sourceLocation: SourceLocation,
    ) {
        super(message);
    }
}

export class UnexpectedTokenError extends ParserError {
    constructor(unexpectedToken: Token<any>, expectedTokenTypes?: string[]) {
        super(
            `Unexpected token: ${getTokenDisplay(unexpectedToken)}` +
                (expectedTokenTypes?.length
                    ? expectedTokenTypes.length === 1
                        ? `. Expected ${expectedTokenTypes[0]}`
                        : `. Expected one of: ${expectedTokenTypes.join(", ")}`
                    : ""),
            getTokenLocation(unexpectedToken),
        );
    }
}

export class UnexpectedEndOfInputError extends ParserError {
    constructor(location?: SourceLocation, expectedTokenTypes?: string[]) {
        super(
            `Unexpected end of input` +
                (expectedTokenTypes?.length
                    ? expectedTokenTypes.length === 1
                        ? `. Expected ${expectedTokenTypes[0]}`
                        : `. Expected one of: ${expectedTokenTypes.join(", ")}`
                    : ""),
            location ?? { index: -1 },
        );
    }
}

export class InvalidTokenError extends ParserError {
    constructor(invalidToken: string, location?: SourceLocation) {
        super(`Invalid token: ${invalidToken}`, location || { index: -1 });
    }
}

export class MaxCallDepthExceededError extends ParserError {
    constructor(maxCallDepth: number, location?: SourceLocation) {
        super(`Maximum call depth of ${maxCallDepth} exceeded`, location || { index: -1 });
    }
}

export class EvaluationError extends ParserError {
    constructor(message: string, location?: SourceLocation) {
        super(message, location ?? { index: -1 });
    }
}
