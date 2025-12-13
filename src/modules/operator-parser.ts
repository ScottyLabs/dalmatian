// Custom error class to distinguish user-thrown errors from framework wrapper errors
class UserError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "UserError";
    }
}

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
function evaluateExpr<T>(
    expr: Expr,
    lookup: (value: string) => T[],
    equals: (a: T, b: T) => boolean,
): T[] {
    switch (expr.type) {
        case "Literal":
            try {
                return lookup(expr.value);
            } catch (err) {
                // If it's already a UserError, rethrow as-is. Otherwise wrap it.
                if (err instanceof UserError) {
                    throw err;
                }
                throw new Error(
                    `Error evaluating '${expr.value}': ${err instanceof Error ? err.message : String(err)}`,
                );
            }
        case "Operator": {
            const leftItems = evaluateExpr(expr.left, lookup, equals);
            const rightItems = evaluateExpr(expr.right, lookup, equals);
            if (expr.op === "AND") {
                // AND
                const result: T[] = [];
                leftItems.forEach((leftItem) => {
                    rightItems.forEach((rightItem) => {
                        if (equals(leftItem, rightItem)) {
                            result.push(leftItem);
                        }
                    });
                });
                return result;
            } else {
                // OR

                const result: T[] = [...leftItems];
                rightItems.forEach((item) => {
                    if (!result.some((resItem) => equals(resItem, item))) {
                        result.push(item);
                    }
                });
                return result;
            }
        }
    }
}

export function parseAndEvaluate<T>(
    input: string,
    lookup: (value: string) => T[],
    equals: (a: T, b: T) => boolean,
): T[] {
    try {
        const expr = parseExpr(input);
        return evaluateExpr(expr, lookup, equals);
    } catch (err) {
        // If it's already a UserError, rethrow as-is. Otherwise wrap it.
        if (err instanceof UserError) {
            throw err;
        }
        throw new Error(
            `Failed to parse and evaluate '${input}': ${err instanceof Error ? err.message : String(err)}`,
        );
    }
}

export { UserError };
