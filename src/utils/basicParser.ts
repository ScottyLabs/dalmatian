import { ASTNode, BaseRuntimeVal, BaseTokenType, isTokenEOX, Parser, PrattRule, SourceLocation, Tokenizer } from "./operatorParser.js";

type BasicTokenTypes = BaseTokenType<
    "LITERAL" | "AND" | "OR" | "NOT" | "LPAREN" | "RPAREN"
>;

export const basicTokenizer = new Tokenizer<BasicTokenTypes>([
    {
        regex: /\s+/, // Skip whitespace
        type: null,
    },
    {
        regex: /\s*"([^"]*)"/, // Quoted strings (literal role names with spaces and operators)
        type: "LITERAL",
        transformer: (value) => value.slice(1, -1), // Remove the surrounding quotes
    },
    {
        regex: /\s*'([^']*)'/, // Single-quoted strings
        type: "LITERAL",
        transformer: (value) => value.slice(1, -1),
    },
    {
        regex: /\s*\(/, // Left parenthesis
        type: "LPAREN",
    },
    {
        regex: /\s*\)/, // Right parenthesis
        type: "RPAREN",
    },
    {
        regex: /\s*\b(NOT)\b/i, // Logical operators (case-insensitive)
        type: "NOT",
        transformer: (value) => value.trim().toUpperCase(),
    },
    {
        regex: /\s*\b(AND)\b/i,
        type: "AND",
        transformer: (value) => value.trim().toUpperCase(),
    },
    {
        regex: /\s*\b(OR)\b/i,
        type: "OR",
        transformer: (value) => value.trim().toUpperCase(),
    },
    {
        regex: /\s*([^\s()]+)/, // Unquoted literals (no spaces or parentheses)
        type: "LITERAL",
    },
]);

class BasicRuntimeVal implements BaseRuntimeVal {
    type: string;
    value: unknown;

    constructor(type: string, value: unknown) {
        this.type = type;
        this.value = value;
    }
}

class BasicParserBaseASTNode implements ASTNode<any, any> {
    constructor(
        public readonly kind: string,
        public readonly loc: SourceLocation,
    ) {}

    evaluate(context: any): any {
        throw new Error("Evaluate not implemented");
    }
}

class BooleanOperatorASTNode extends BasicParserBaseASTNode {
    constructor(
        public readonly operator: "AND" | "OR" | "NOT",
        public readonly operands: ASTNode<any, any>[],
        loc: SourceLocation,
    ) {
        super("BooleanOperator", loc);
    }
    
    override evaluate(context: any): boolean {
        if (this.operator === "NOT") {
            return !this.operands.every((operand) => operand.evaluate(context));
        } else if (this.operator === "AND") {
            return this.operands.every((operand) => operand.evaluate(context));
        } else if (this.operator === "OR") {
            return this.operands.some((operand) => operand.evaluate(context));
        }
        throw new Error(`Unknown operator: ${this.operator}`);
    }
}

class LiteralASTNode extends BasicParserBaseASTNode {
    constructor(
        public readonly value: string,
        loc: SourceLocation,
    ) {
        super("Literal", loc);
    }

    override evaluate(context: any): string {
        return this.value;
    }
}


const notRule: PrattRule<BasicTokenTypes> = {
    operator: "NOT",
    lbp: 3,
    rbp: 3.1,
    nud: (token, parser) => {
        if (isTokenEOX(token)) {
            throw new Error("Unexpected end of input after NOT");
        }
        const right = parser.parsePratt(notRule.rbp);
        return new BooleanOperatorASTNode("NOT", [right], {index: token.index});
    }
};

const andRule: PrattRule<BasicTokenTypes> = {
    operator: "AND",
    lbp: 2,
    rbp: 2.1,
    led: (left, token, parser) => {
        if (isTokenEOX(token)) {
            throw new Error("Unexpected end of input after AND");
        }
        const right = parser.parsePratt(andRule.rbp);
        return new BooleanOperatorASTNode("AND", [left, right], {index: token.index});
    }
};

const orRule: PrattRule<BasicTokenTypes> = {
    operator: "OR",
    lbp: 1,
    rbp: 1.1,
    led: (left, token, parser) => {
        if (isTokenEOX(token)) {
            throw new Error("Unexpected end of input after OR");
        }
        const right = parser.parsePratt(orRule.rbp);
        return new BooleanOperatorASTNode("OR", [left, right], {index: token.index});
    }
};

const literalRule: PrattRule<BasicTokenTypes> = {
    operator: "LITERAL",
    lbp: 0,
    rbp: 0.1,
    nud: (token) => {
        if (isTokenEOX(token)) {
            throw new Error("Unexpected end of input when expecting a literal");
        }

        return new LiteralASTNode(token.value as string, {index: token.index});
    }
};

const lparenRule: PrattRule<BasicTokenTypes> = {
    operator: "LPAREN",
    lbp: 0,
    rbp: 0.1,
    //we want to force everything to parse until we hit rparen
    nud: (token, parser) => {
        if (isTokenEOX(token)) {
            throw new Error("Unexpected end of input after (");
        }
        const expr = parser.parsePratt(lparenRule.rbp);
        const nextToken = parser.consumeToken(); // Consume the next token
        if (!nextToken || isTokenEOX(nextToken)) {
            throw new Error("Unexpected end of input, expected )");
        }
        if (nextToken.type !== "RPAREN") {
            throw new Error(`Expected ), got ${nextToken.value}`);
        }
        return expr;
    }
};

const prattRules: PrattRule<BasicTokenTypes>[] = [
    notRule,
    andRule,
    orRule,
    literalRule,
    lparenRule,
];

//test scenario

const testString = `NOT (Admitted AND "SCS") OR Admin`;

const tokens = basicTokenizer.tokenize(testString);

const parser = new Parser(tokens, prattRules, () => {
    throw new Error("Base function should never be called");
});

const ast = parser.parsePratt();

console.log(JSON.stringify(ast, null, 2));
