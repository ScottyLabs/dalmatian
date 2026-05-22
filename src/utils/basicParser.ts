import {
    ASTNode,
    BaseContext,
    BaseRuntimeVal,
    BaseTokenType,
    isTokenEOX,
    Parser,
    PrattRule,
    SourceLocation,
    Tokenizer,
} from "./operatorParser.js";

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
        regex: /\s*([^()\s]+(?:\s+(?!AND|OR|NOT)[^()\s]+)*)/i, // Unquoted literals (no spaces or parentheses or operators)
        type: "LITERAL",
    },
]);

// The reason this exists is that in the future we could evaluate to multiple types, but in reality this usage only needs one type
class GenericResultRuntimeVal<TResult> implements BaseRuntimeVal {
    readonly type: string;
    constructor(public readonly value: TResult[]) {
        this.type = typeof value;
    }
}

class BasicParserContext<TLiteral, TResult> implements BaseContext {
    constructor(
        public readonly parseLiteral: (value: string) => TLiteral,
        public readonly lookup: (literal: TLiteral) => TResult[],
        public readonly equal: (a: TResult, b: TResult) => boolean,
        public readonly universe: () => TResult[],
    ) {}
}

class BasicParserBaseASTNode<TLiteral, TResult>
    implements
        ASTNode<
            GenericResultRuntimeVal<TResult>,
            BasicParserContext<TLiteral, TResult>
        >
{
    constructor(
        public readonly kind: string,
        public readonly loc: SourceLocation,
    ) {}

    evaluate(
        context: BasicParserContext<TLiteral, TResult>,
    ): GenericResultRuntimeVal<TResult> {
        throw new Error("Evaluate not implemented");
    }
}

class BooleanOperatorASTNode<TLiteral, TResult> extends BasicParserBaseASTNode<
    TLiteral,
    TResult
> {
    constructor(
        public readonly operator: "AND" | "OR" | "NOT",
        public readonly operands: ASTNode<GenericResultRuntimeVal<TResult>, BasicParserContext<TLiteral, TResult>>[],
        loc: SourceLocation,
    ) {
        super("BooleanOperator", loc);
    }

    override evaluate(
        context: BasicParserContext<TLiteral, TResult>,
    ): GenericResultRuntimeVal<TResult> {
        if (this.operator === "NOT") {
            const right = this.operands.pop();
            if (!right) {
                throw new Error("NOT operator must have exactly one operand");
            }
            const uni = context.universe();
            const rightValue = right.evaluate(context).value;
            const result = uni.filter((u) => !rightValue.some((r: TResult) => context.equal(u, r)));
            return new GenericResultRuntimeVal(result);
        } else if (this.operator === "AND" || this.operator === "OR") {
            const right = this.operands.pop();
            const left = this.operands.pop();
            if (!left || !right) {
                throw new Error("AND operator must have two operands");
            }

            const leftValue = left.evaluate(context).value;
            const rightValue = right.evaluate(context).value;

            let result: TResult[];
            if (this.operator === "AND") {
                result = leftValue.filter((l: TResult) =>
                        rightValue.some((r: TResult) => context.equal(l, r)),
                    );
            } else {
                result = [...leftValue];
                for (const r of rightValue) {
                    if (!result.some((res) => context.equal(res, r))) {
                        result.push(r);
                    }
                }
            }
            return new GenericResultRuntimeVal(result);
        }
        throw new Error(`Unknown operator: ${this.operator}`);
    }
}

class LiteralASTNode<TLiteral, TResult> extends BasicParserBaseASTNode<
    TLiteral,
    TResult
> {
    constructor(
        public readonly value: string,
        loc: SourceLocation,
    ) {
        super("Literal", loc);
    }

    override evaluate(
        context: BasicParserContext<TLiteral, TResult>,
    ): GenericResultRuntimeVal<TResult> {
        return new GenericResultRuntimeVal(
            context.lookup(context.parseLiteral(this.value)),
        );
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
        return new BooleanOperatorASTNode("NOT", [right], {
            index: token.index,
        });
    },
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
        return new BooleanOperatorASTNode("AND", [left, right], {
            index: token.index,
        });
    },
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
        return new BooleanOperatorASTNode("OR", [left, right], {
            index: token.index,
        });
    },
};

const literalRule: PrattRule<BasicTokenTypes> = {
    operator: "LITERAL",
    lbp: 0,
    rbp: 0.1,
    nud: (token) => {
        if (isTokenEOX(token)) {
            throw new Error("Unexpected end of input when expecting a literal");
        }

        return new LiteralASTNode(token.value as string, {
            index: token.index,
        });
    },
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
    },
};

const prattRules: PrattRule<BasicTokenTypes>[] = [
    notRule,
    andRule,
    orRule,
    literalRule,
    lparenRule,
];

export function parseAndEvaluate<TLiteral, TResult>(
    input: string,
    context: BasicParserContext<TLiteral, TResult>,
): TResult[] {
    const tokens = basicTokenizer.tokenize(input);
    const parser = new Parser(tokens, prattRules, (parser) => {
        // This would normally be where RDP is implemented, but this grammar can entirely be parsed with Pratt
        return parser.parsePratt();
    });

    const ast = parser.parse();

    return ast.evaluate(context).value;
}
