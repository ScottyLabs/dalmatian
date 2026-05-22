import {
    BaseRuntimeVal,
    ASTNode,
    PrattRule,
    Parser,
    BaseExecutionContext,
} from "./parser.ts";
import {
    UnexpectedEndOfInputError,
    UnexpectedTokenError,
    EvaluationError,
} from "./errors.ts";
import { GrammarFactory } from "./grammarFactory.ts";
import {
    BaseTokenType,
    EOX,
    isTokenEOX,
    SourceLocation,
    Tokenizer,
} from "./tokenizer.ts";

type BasicOperatorTokenTypes = BaseTokenType<
    "LITERAL" | "AND" | "OR" | "NOT" | "LPAREN" | "RPAREN"
>;

export const basicOperatorTokenizer = new Tokenizer<BasicOperatorTokenTypes>([
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

// The reason this exists is that in the future we could evaluate to multiple types, but in reality this usage only needs one type so we just make it a single generic
class BasicOperatorRuntimeVal<TResult> implements BaseRuntimeVal {
    readonly type: string;
    constructor(public readonly value: TResult[]) {
        this.type = typeof value;
    }
}

export class BasicOperatorExecutionContext<
    TLiteral,
    TResult,
> extends BaseExecutionContext {
    constructor(
        public readonly parseLiteral: (value: string) => TLiteral,
        public readonly lookup: (literal: TLiteral) => TResult[],
        public readonly equal: (a: TResult, b: TResult) => boolean,
        public readonly universe: () => TResult[],
        config = { maxCallDepth: 100 },
    ) {
        super(config);
    }
}

abstract class BasicParserBaseASTNode<TLiteral, TResult> extends ASTNode<
    BasicOperatorRuntimeVal<TResult>,
    BasicOperatorExecutionContext<TLiteral, TResult>
> {
    abstract override evaluateInner(
        context: BasicOperatorExecutionContext<TLiteral, TResult>,
    ): BasicOperatorRuntimeVal<TResult>;
}

class BooleanOperatorASTNode<TLiteral, TResult> extends BasicParserBaseASTNode<
    TLiteral,
    TResult
> {
    constructor(
        public readonly operator: "AND" | "OR" | "NOT",
        public readonly operands: ASTNode<
            BasicOperatorRuntimeVal<TResult>,
            BasicOperatorExecutionContext<TLiteral, TResult>
        >[],
        loc: SourceLocation,
    ) {
        super("BooleanOperator", loc);
    }

    evaluateInner(
        context: BasicOperatorExecutionContext<TLiteral, TResult>,
    ): BasicOperatorRuntimeVal<TResult> {
        const ops = this.operands;

        if (this.operator === "NOT") {
            if (ops.length !== 1) {
                throw new EvaluationError("NOT operator must have exactly one operand", this.loc);
            }
            const right = ops[0]!;
            const uni = context.universe();
            const rightValue = right.evaluate(context).value;
            const result = uni.filter(
                (u) => !rightValue.some((r: TResult) => context.equal(u, r)),
            );
            return new BasicOperatorRuntimeVal(result);
        }

        if (this.operator === "AND" || this.operator === "OR") {
            if (ops.length !== 2) {
                throw new EvaluationError("AND/OR operators must have two operands", this.loc);
            }

            const left = ops[0]!;
            const right = ops[1]!;

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
            return new BasicOperatorRuntimeVal(result);
        }

        throw new EvaluationError(`Unknown operator: ${this.operator}`, this.loc);
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

    evaluateInner(
        context: BasicOperatorExecutionContext<TLiteral, TResult>,
    ): BasicOperatorRuntimeVal<TResult> {
        return new BasicOperatorRuntimeVal(
            context.lookup(context.parseLiteral(this.value)),
        );
    }
}

const notRule: PrattRule<BasicOperatorTokenTypes> = {
    operator: "NOT",
    lbp: 3,
    rbp: 3.1,
    nud: (token, parser) => {
        if (isTokenEOX(token)) {
            throw new UnexpectedEndOfInputError();
        }
        const right = parser.parsePratt(notRule.rbp);
        return new BooleanOperatorASTNode("NOT", [right], token.loc);
    },
};

const andRule: PrattRule<BasicOperatorTokenTypes> = {
    operator: "AND",
    lbp: 2,
    rbp: 2.1,
    led: (left, token, parser) => {
        if (isTokenEOX(token)) {
            throw new UnexpectedEndOfInputError();
        }
        const right = parser.parsePratt(andRule.rbp);
        return new BooleanOperatorASTNode("AND", [left, right], token.loc);
    },
};

const orRule: PrattRule<BasicOperatorTokenTypes> = {
    operator: "OR",
    lbp: 1,
    rbp: 1.1,
    led: (left, token, parser) => {
        if (isTokenEOX(token)) {
            throw new UnexpectedEndOfInputError();
        }
        const right = parser.parsePratt(orRule.rbp);
        return new BooleanOperatorASTNode("OR", [left, right], token.loc);
    },
};

const literalRule: PrattRule<BasicOperatorTokenTypes> = {
    operator: "LITERAL",
    lbp: 0,
    rbp: 0.1,
    nud: (token) => {
        if (isTokenEOX(token)) {
            throw new UnexpectedEndOfInputError();
        }

        return new LiteralASTNode(token.value as string, token.loc);
    },
};

const lparenRule: PrattRule<BasicOperatorTokenTypes> = {
    operator: "LPAREN",
    lbp: 0,
    rbp: 0.1,
    //we want to force everything to parse until we hit rparen
    nud: (token, parser) => {
        if (isTokenEOX(token)) {
            throw new UnexpectedEndOfInputError();
        }
        const expr = parser.parsePratt(lparenRule.rbp);
        const nextToken = parser.consumeToken(); // Consume the next token
        if (!nextToken || isTokenEOX(nextToken)) {
            throw new UnexpectedTokenError(nextToken ?? (EOX as any), ["RPAREN"]);
        }
        if (nextToken.type !== "RPAREN") {
            throw new UnexpectedTokenError(nextToken, ["RPAREN"]);
        }
        return expr;
    },
};

const prattRules: PrattRule<BasicOperatorTokenTypes>[] = [
    notRule,
    andRule,
    orRule,
    literalRule,
    lparenRule,
];

const basicOperatorGrammar = new GrammarFactory({
    tokenizer: basicOperatorTokenizer,
    prattRules,
    base: (parser) => parser.parsePratt(),
});

export function parseAndEvaluate<TLiteral, TResult>(
    input: string,
    context: BasicOperatorExecutionContext<TLiteral, TResult>,
): TResult[] {
    const ast = basicOperatorGrammar.parse(input);

    return ast.evaluate(context).value;
}
