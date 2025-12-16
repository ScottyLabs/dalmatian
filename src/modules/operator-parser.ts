export type Expr<T> =
    | { type: "Literal"; value: T }
    | { type: "Operator"; op: "AND" | "OR"; left: Expr<T>; right: Expr<T> };

function tokenize(input: string): string[] {
    return input
        .replace(/\(/g, " ( ")
        .replace(/\)/g, " ) ")
        .trim()
        .split(/\s+/);
}

// recursive descent parser
export function parseExpr<TLiteral>(
    input: string,
    parseLiteral: (value: string) => TLiteral,
): Expr<TLiteral> {
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

    function parseExpression(): Expr<TLiteral> {
        let node = parseTerm();

        while (peek() === "OR") {
            const op = consume();
            const right = parseTerm();
            node = { type: "Operator", op: op as "OR", left: node, right };
        }

        return node;
    }

    function parseTerm(): Expr<TLiteral> {
        let node = parseFactor();

        while (peek() === "AND") {
            const op = consume();
            const right = parseFactor();
            node = { type: "Operator", op: op as "AND", left: node, right };
        }

        return node;
    }

    function parseFactor(): Expr<TLiteral> {
        if (peek() === "(") {
            consume();
            const expr = parseExpression();
            if (consume() !== ")") {
                throw new Error("Expected ')'");
            }
            return expr;
        } else {
            const value = consume();
            return { type: "Literal", value: parseLiteral(value) };
        }
    }

    const result = parseExpression();

    if (pos < tokens.length) {
        throw new Error("Unexpected token: " + peek());
    }

    return result;
}

// this parses specifically for courses, maybe can be generalized later
export function evaluateExpr<TLiteral, TResult>(
    expr: Expr<TLiteral>,
    lookup: (value: TLiteral) => TResult[],
    equals: (a: TResult, b: TResult) => boolean,
): TResult[] {
    switch (expr.type) {
        case "Literal":
            return lookup(expr.value);
        case "Operator": {
            const leftItems = evaluateExpr(expr.left, lookup, equals);
            const rightItems = evaluateExpr(expr.right, lookup, equals);
            if (expr.op === "AND") {
                // AND
                const result: TResult[] = [];
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

                const result: TResult[] = [...leftItems];
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

export function parseAndEvaluate<TLiteral, TResult>(
    input: string,
    parseLiteral: (value: string) => TLiteral,
    lookup: (value: TLiteral) => TResult[],
    equals: (a: TResult, b: TResult) => boolean,
): TResult[] {
    const expr = parseExpr(input, parseLiteral);
    return evaluateExpr(expr, lookup, equals);
}
