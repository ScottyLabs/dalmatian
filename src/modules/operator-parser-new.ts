type Token = string;
type Operator = "AND" | "OR";

function tokenize(input: string): Token[] {
    // For future reference:
    // \s*([()]) matches any whitespace then a parenthesis
    // \s*(AND|OR) matches any whitespace then AND or OR (case insensitive because of the end i)
    // \s*([^\s()]+) matches any whitespace then a sequence of non-whitespace, non-parenthesis characters
    // the end g makes the regex search globally through the string
    const regex = /\s*([()])|\s*(AND|OR)|\s*([^\s()]+)/gi;
    const tokens: Token[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(input)) !== null) {
        if (match[1]) {
            tokens.push(match[1]);
        } else if (match[2]) {
            tokens.push(match[2].toUpperCase());
        } else if (match[3]) {
            tokens.push(match[3]);
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
