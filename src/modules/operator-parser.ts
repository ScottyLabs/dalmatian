type Token = string;
type Operator = "AND" | "OR";

function tokenize(input: string): Token[] {
    // For future reference:
    // \s*"([^"]*)" matches quoted strings (literal role names with spaces and operators)
    // \s*'([^']*)' matches single-quoted strings
    // \s*([()]) matches any whitespace then a parenthesis
    // \s*\b(AND|OR)\b matches any whitespace then AND or OR as whole words (case insensitive because of the end i)
    // \s*([^()\s]+(?:\s+(?!AND|OR)[^()\s]+)*) matches any whitespace then a sequence of non-parenthesis, non-whitespace characters, grouping multiple sequences together as long as they aren't AND/OR
    // the end g makes the regex search globally through the string
    const regex =
        /\s*"([^"]*)"|\s*'([^']*)'|\s*([()])|\s*\b(AND|OR)\b|\s*([^()\s]+(?:\s+(?!AND|OR)[^()\s]+)*)/gi;
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
            // AND/OR operator
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

    const PRECEDENCE: Record<Operator, number> = { OR: 1, AND: 2 };
    const isOperator = (token: Token | undefined): token is Operator =>
        token === "AND" || token === "OR";

    for (const token of tokens) {
        if (isOperator(token)) {
            while (!empty(operatorStack)) {
                const t = peek(operatorStack);
                if (!isOperator(t) || PRECEDENCE[t] < PRECEDENCE[token]) break;
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
): TResult[] {
    const stack: TResult[][] = [];

    for (const token of rpnTokens) {
        if (token === "AND" || token === "OR") {
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
): TResult[] {
    const rpnTokens = parseExpr(input);
    return evaluateExpr(rpnTokens, parseLiteral, lookup, equal);
}
