import { InvalidTokenError } from "./errors.ts";

export type BaseTokenType<T> = T | null;

//End of expression
export const EOX = Symbol.for("EOX"); // End of expression, guaranteed uniqueness

export interface SourceLocation {
    readonly index: number;
}

// We will let token type be generic to allow for different token sets.
export type Token<T extends BaseTokenType<any>> =
    | typeof EOX
    | {
          type: T;
          loc: SourceLocation;
          value: string;
          toString(): string;
      };

const tokenPrototype = {
    toString(this: Token<any>): string {
        if (isTokenEOX(this)) return "End of Expression";
        return `${this.value}`;
    },
};

function createToken<T extends BaseTokenType<any>>(
    type: T,
    value: string,
    loc: SourceLocation,
): Token<T> {
    return Object.create(tokenPrototype, {
        type: { value: type, enumerable: true },
        value: { value, enumerable: true },
        loc: { value: loc, enumerable: true },
    });
}

export class TokenStream<T extends BaseTokenType<any>> {
    private readonly tokens: Array<Token<T>>;

    constructor(tokens: Array<Token<T>>) {
        this.tokens = tokens;
    }

    peek(): Token<T> | undefined {
        return this.tokens.at(-1);
    }

    consume(): Token<T> | undefined {
        return this.tokens.pop();
    }

    expect(expectedType: T): Token<T> {
        const token = this.consume();
        if (!token || isTokenEOX(token) || token.type !== expectedType) {
            throw new InvalidTokenError(token?.toString() ?? "end of input");
        }
        return token;
    }

    isEOX(token: Token<T> | undefined): boolean {
        return !token || isTokenEOX(token);
    }
}

export function getTokenLocation(token: Token<any>): SourceLocation {
    if (typeof token === "object" && token !== null && "loc" in token) {
        return token.loc;
    }
    return { index: -1 };
}

export function isTokenEOX<T extends BaseTokenType<any>>(
    token: Token<T>,
): token is typeof EOX {
    return token === EOX;
}
type TokenRule<T extends BaseTokenType<any>> = {
    regex: RegExp;
    type: T;
    transformer?: (value: string) => any;
};

export class Tokenizer<T extends BaseTokenType<any>> {
    private rules: TokenRule<T>[];

    constructor(rules: TokenRule<T>[]) {
        this.rules = rules;
    }

    tokenize(input: string): TokenStream<T> {
        let index = 0;

        const tokens: Array<Token<T>> = [];

        while (index < input.length) {
            let matched = false;

            for (const rule of this.rules) {
                const flags = new Set(rule.regex.flags.split(""));
                flags.delete("g");
                flags.add("y");

                const regex = new RegExp(
                    `${rule.regex.source}`,
                    [...flags].join(""),
                );
                regex.lastIndex = index;

                const match = regex.exec(input);

                if (match && match.length > 0) {
                    index += match[0].length;
                    if (rule.type !== null) {
                        const value = match[0];
                        tokens.push(
                            createToken(
                                rule.type,
                                rule.transformer
                                    ? rule.transformer(value)
                                    : value,
                                { index },
                            ),
                        );
                    }

                    matched = true;
                    break;
                }
            }

            if (!matched) {
                throw new InvalidTokenError(input[index] ?? "unknown", {
                    index,
                });
            }
        }

        tokens.push(EOX);
        return new TokenStream(tokens.reverse()); // Reverse for easier popping from the end
    }
}
