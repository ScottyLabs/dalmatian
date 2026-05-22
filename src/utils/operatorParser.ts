export type BaseTokenType<T> = T | null;

//End of expression
const EOX = Symbol.for("EOX"); // End of expression, guaranteed uniqueness

// We will let token type be generic to allow for different token sets.

type Token<T extends BaseTokenType<any>> =
    | typeof EOX
    | {
          type: T;
          index: number;
          value: string;
      };

export function isTokenEOX<T extends BaseTokenType<any>>(token: Token<T>): token is typeof EOX {
    console.log("Checking if token is EOX:", token, token === EOX);
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


    tokenize(input: string): Array<Token<T>> {
        let index = 0;

        const tokens: Array<Token<T>> = [];

        while (index < input.length) {
            let matched = false;

            for (const rule of this.rules) {
                const regex = new RegExp(
                    `${rule.regex.source}`,
                    "y" + (rule.regex.ignoreCase ? "i" : ""),
                );
                regex.lastIndex = index;

                const match = regex.exec(input);

                if (match && match.length > 0) {
                    index += match[0].length;
                    if (rule.type !== null) {
                        const value = match[0];
                        tokens.push({
                            type: rule.type,
                            index,
                            value: rule.transformer
                                ? rule.transformer(value)
                                : value,
                        });
                    }

                    matched = true;
                    break;
                }
            }

            if (!matched) {
                throw new Error(
                    `Unexpected token at index ${index}: "${input.slice(index)}"`,
                );
            }
        }

        tokens.push(EOX);
        return tokens.reverse(); // Reverse for easier popping from the end
    }
}

export interface ExecutionContext {
    readonly config: {
        maxCallDepth: number;
        allowSideEffects: boolean;
    };
}

export interface SourceLocation {
    readonly index: number;
}

export interface BaseRuntimeVal {
  readonly type: string;
  readonly value: unknown; 
}

export interface BaseContext {
  readonly [key: string]: unknown;
}

export interface ASTNode< R extends BaseRuntimeVal, C extends BaseContext> {
  readonly kind: string;
  readonly loc: SourceLocation;
  evaluate(context: C): R;
}

export type PrattRule<T extends BaseTokenType<any>> = {
    operator: T;
    lbp: number; // left binding power
    rbp: number; // right binding power
    nud?: (token: Token<T>, parser: Parser<T>) => ASTNode<any, any>; // prefix operators
    led?: (left: ASTNode<any, any>, token: Token<T>, parser: Parser<T>) => ASTNode<any, any>; // infix/postfix operators
};

type BaseFunction<C extends BaseContext>  = (context: C, parser: Parser<any>) => ASTNode<any, any>;

export class Parser< T extends BaseTokenType<any>> {
    constructor(
        public readonly tokenGenerator: Array<Token<T>>,
        private prattRules: PrattRule<T>[],
        private base: BaseFunction<any>,
    ) {}

    peekToken(): Token<T> | undefined {
        return this.tokenGenerator.at(-1);
    }

    consumeToken(): Token<T> | undefined {
        return this.tokenGenerator.pop();
    }

    parsePratt(precedence = 0): ASTNode<any, any> {
        const token = this.consumeToken();      

        console.log ("Parsing token:", token);
        if (!token || token === EOX) {
            throw new Error("Unexpected end of input");
        }

        const rule = this.prattRules.find((r) => r.operator === token.type);
        if (!rule || !rule.nud) {
            console.log("Unexpected token:", token);
            throw new Error(`Unexpected token: ${token.value}`);
        }

        let left = rule.nud(token, this);

        while (true) {
            const nextToken = this.peekToken(); // Look at the next token without consuming it
            console.log("Next token:", nextToken);
            if (!nextToken || isTokenEOX(nextToken)) {
                break;
            }

            const nextRule = this.prattRules.find((r) => r.operator === nextToken.type);
            if (!nextRule || !nextRule.led || nextRule.lbp <= precedence) {
                // If the next token is not an operator or has lower binding power, stop parsing.
                break;
            }
            
            //if valid, consume
            this.consumeToken(); // Consume the next token

            left = nextRule.led(left, nextToken, this);
        }

        return left;

    }

}

/*

function tokenize(input: string): Token[] {
    // For future reference:
    // \s*"([^"]*)" matches quoted strings (literal role names with spaces and operators)
    // \s*'([^']*)' matches single-quoted strings
    // \s*([()]) matches any whitespace then a parenthesis
    // \s*\b(AND|OR|NOT)\b matches any whitespace then AND or OR or NOT as whole words (case insensitive because of the end i)
    // \s*([^()\s]+(?:\s+(?!AND|OR|NOT)[^()\s]+)*) matches any whitespace then a sequence of non-parenthesis, non-whitespace characters, grouping multiple sequences together as long as they aren't AND/OR/NOT
    // the end g makes the regex search globally through the string
    const regex =
        /\s*"([^"]*)"|\s*'([^']*)'|\s*([()])|\s*\b(AND|OR|NOT)\b|\s*([^()\s]+(?:\s+(?!AND|OR|NOT)[^()\s]+)*)/gi;
    const tokens: Token[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(input)) !== null) {
        if (match[1] !== undefined) {
            // Double-quoted string - treat as literal
            tokens.push(match[1]);
        } else if (match[2] !== undefined) {
            // Single-quoted string - treat as literal
            tokens.push(match[2]);
        } else if (match[3]) {
            // Parenthesis
            tokens.push(match[3]);
        } else if (match[4]) {
            // AND/OR/NOT operator
            tokens.push(match[4].toUpperCase());
        } else if (match[5]) {
            // Unquoted token
            tokens.push(match[5]);
        } else {
            throw new Error("Unexpected token");
        }
    }

    return tokens;
}

// shunting yard parser
function parseExpr(input: string): Token[] {
    const outputQueue: Token[] = [];
    const operatorStack: Token[] = [];
    const empty = (stack: Token[]): stack is [] => {
        return stack.length === 0;
    };
    const peek = (stack: Token[] = operatorStack): Token | undefined => {
        return stack[stack.length - 1];
    };
    const tokens = tokenize(input);

    const PRECEDENCE: Record<Operator, number> = { OR: 1, AND: 2, NOT: 3 };
    const isOperator = (token: Token | undefined): token is Operator =>
        token === "AND" || token === "OR" || token === "NOT";
    const isRightAssociative = (token: Token): boolean => token === "NOT";

    for (const token of tokens) {
        if (isOperator(token)) {
            while (!empty(operatorStack)) {
                const t = peek(operatorStack);
                if (!isOperator(t)) break;

                const shouldPop = isRightAssociative(token)
                    ? PRECEDENCE[t] > PRECEDENCE[token]
                    : PRECEDENCE[t] >= PRECEDENCE[token];

                if (!shouldPop) break;
                outputQueue.push(operatorStack.pop()!);
            }
            operatorStack.push(token);
        } else if (token === "(") {
            operatorStack.push(token);
        } else if (token === ")") {
            while (!empty(operatorStack) && peek(operatorStack) !== "(") {
                outputQueue.push(operatorStack.pop()!);
            }
            if (empty(operatorStack) || peek(operatorStack) !== "(") {
                throw new Error("Mismatched parentheses");
            }
            operatorStack.pop(); // Remove the '(' from the stack
        } else {
            outputQueue.push(token);
        }
    }

    while (operatorStack.length > 0) {
        const op = operatorStack.pop()!;
        if (op === "(" || op === ")") {
            throw new Error("Mismatched parentheses");
        }
        outputQueue.push(op);
    }

    return outputQueue;
}

// evaluates the reverse Polish notation tokens
function evaluateExpr<TLiteral, TResult>(
    rpnTokens: Token[],
    parseLiteral: (token: Token) => TLiteral,
    lookup: (literal: TLiteral) => TResult[],
    equal: (a: TResult, b: TResult) => boolean,
    universe: () => TResult[],
): TResult[] {
    const stack: TResult[][] = [];

    for (const token of rpnTokens) {
        if (token === "NOT") {
            const operand = stack.pop();
            if (!operand) throw new Error("Malformed expression");
            const uni = universe();
            const result = uni.filter((u) => !operand.some((o) => equal(u, o)));

            stack.push(result);
        } else if (token === "AND" || token === "OR") {
            const right = stack.pop()!;
            const left = stack.pop()!;

            if (!left || !right) {
                throw new Error("Malformed expression");
            }

            let result: TResult[];
            if (token === "AND") {
                result = left.filter((l) => right.some((r) => equal(l, r)));
            } else {
                result = [...left];
                for (const r of right) {
                    if (!result.some((res) => equal(res, r))) {
                        result.push(r);
                    }
                }
            }
            stack.push(result);
        } else {
            const literal = parseLiteral(token);
            const results = lookup(literal);
            stack.push(results);
        }
    }

    return stack.pop() || [];
}

export function parseAndEvaluate<TLiteral, TResult>(
    input: string,
    parseLiteral: (token: Token) => TLiteral,
    lookup: (literal: TLiteral) => TResult[],
    equal: (a: TResult, b: TResult) => boolean,
    universe: () => TResult[],
): TResult[] {
    const rpnTokens = parseExpr(input);
    return evaluateExpr(rpnTokens, parseLiteral, lookup, equal, universe);
}
*/
