export type Expr =
    | { type: "Literal"; value: string }
    | { type: "Operator"; op: "AND" | "OR"; left: Expr; right: Expr };

function tokenize(input: string): string[] {
    return input
        .replace(/\(/g, " ( ")
        .replace(/\)/g, " ) ")
        .trim()
        .split(/\s+/);
}

// recursive descent parser
function parseExpr(input: string): Expr {
    const tokens = tokenize(input);
    let pos = 0;

    const peek = () => tokens[pos];
    const consume = (): string => {
        const t = tokens[pos++];
        if (t === undefined) {
            throw new Error("Unexpected end of input");
        }
        return t;
    };

    function parseExpression(): Expr {
        let node = parseTerm();

        while (peek() === "OR") {
            const op = consume();
            const right = parseTerm();
            node = { type: "Operator", op: op as "OR", left: node, right };
        }

        return node;
    }

    function parseTerm(): Expr {
        let node = parseFactor();

        while (peek() === "AND") {
            const op = consume();
            const right = parseFactor();
            node = { type: "Operator", op: op as "AND", left: node, right };
        }

        return node;
    }

    function parseFactor(): Expr {
        if (peek() === "(") {
            consume();
            const expr = parseExpression();
            if (consume() !== ")") {
                throw new Error("Expected closing parenthesis");
            }
            return expr;
        } else {
            const value = consume();
            return { type: "Literal", value };
        }
    }

    const result = parseExpression();

    if (pos < tokens.length) {
        throw new Error("Unexpected token: " + peek());
    }

    return result;
}

// this parses specifically for courses, maybe can be generalized later
function evaluateExpr<T>(expr: Expr, lookup: (value: string) => T[]): T[] {
    switch (expr.type) {
        case "Literal":
            return lookup(expr.value);
        case "Operator": {
            const leftItems = evaluateExpr(expr.left, lookup);
            const rightItems = evaluateExpr(expr.right, lookup);
            if (expr.op === "AND") {
                return leftItems.filter((item) => rightItems.includes(item));
            } else {
                // OR
                return Array.from(new Set([...leftItems, ...rightItems]));
            }
        }
    }
}

export function parseAndEvaluate<T>(
    input: string,
    lookup: (value: string) => T[],
): T[] {
    const expr = parseExpr(input);
    return evaluateExpr(expr, lookup);
}
