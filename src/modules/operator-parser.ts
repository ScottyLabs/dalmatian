export type Expr =
    | { type: "Literal"; value: string }
    | { type: "Unary"; op: "NOT"; expr: Expr }
    | { type: "Binary"; op: "AND" | "OR"; left: Expr; right: Expr };

function tokenize(input: string): string[] {
    return input
        .replace(/\(/g, " ( ")
        .replace(/\)/g, " ) ")
        .trim()
        .split(/\s+/);
}

// recursive descent parser
export function parseExpr(input: string): Expr {
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
            node = { type: "Binary", op: op as "OR", left: node, right };
        }

        return node;
    }

    function parseTerm(): Expr {
        let node = parseFactor();

        while (peek() === "AND") {
            const op = consume();
            const right = parseFactor();
            node = { type: "Binary", op: op as "AND", left: node, right };
        }

        return node;
    }

    function parseFactor(): Expr {
        if (peek() === "NOT") {
            consume();
            const expr = parseFactor();
            return { type: "Unary", op: "NOT", expr };
        } else if (peek() === "(") {
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
