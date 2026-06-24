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
          humanName?: string;
          loc: SourceLocation;
          value: string;
      };

function createToken<T extends BaseTokenType<any>>(
    type: T,
    value: string,
    humanName: string,
    loc: SourceLocation,
): Token<T> {
    return {
        type,
        humanName,
        value,
        loc,
    };
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
            throw new InvalidTokenError(token ? getTokenDisplay(token) : "end of input");
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

export function getTokenDisplay(token: Token<any>): string {
    if (isTokenEOX(token)) return "End of Expression";
    return token.humanName ?? token.value;
}

export function isTokenEOX<T extends BaseTokenType<any>>(token: Token<T>): token is typeof EOX {
    return token === EOX;
}
export type TokenRule<T extends BaseTokenType<any>> = {
    regex: RegExp;
    type: T;
    humanName: string;
    transformer?: (value: string) => any;
};

function compileTokenRules<T extends BaseTokenType<any>>(rules: TokenRule<T>[]): TokenRule<T>[] {
    return rules.map((rule) => {
        const flags = new Set(rule.regex.flags.split(""));
        flags.delete("g");
        flags.add("y");
        return {
            ...rule,
            regex: new RegExp(rule.regex.source, [...flags].join("")),
        };
    });
}
export function tokenize<T extends BaseTokenType<any>>(
    rules: TokenRule<T>[],
    input: string,
): TokenStream<T> {
    let index = 0;

    const tokens: Array<Token<T>> = [];

    const compiledRules = compileTokenRules(rules);

    while (index < input.length) {
        let matched = false;

        for (const rule of compiledRules) {
            rule.regex.lastIndex = index;

            const match = rule.regex.exec(input);

            if (match && match.length > 0) {
                index += match[0].length;
                if (rule.type !== null) {
                    const value = match[0];
                    tokens.push(
                        createToken(
                            rule.type,
                            rule.transformer ? rule.transformer(value) : value,
                            rule.humanName,
                            { index: index - value.length },
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
