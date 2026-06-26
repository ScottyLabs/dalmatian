import {
    UnexpectedTokenError,
    UnexpectedEndOfInputError,
    MaxCallDepthExceededError,
} from "./errors.ts";
import {
    BaseTokenType,
    EOX,
    getTokenLocation,
    isTokenEOX,
    SourceLocation,
    Token,
    TokenStream,
} from "./tokenizer.ts";

export abstract class BaseExecutionContext {
    readonly config: {
        maxCallDepth: number;
    };

    currentCallDepth: number; // Used to track recursion depth

    constructor(config = { maxCallDepth: 100 }) {
        this.config = config;
        this.currentCallDepth = 0;
    }

    call<R>(fn: () => R): R {
        if (this.currentCallDepth >= this.config.maxCallDepth) {
            throw new MaxCallDepthExceededError(this.config.maxCallDepth);
        }
        this.currentCallDepth++;
        try {
            return fn();
        } finally {
            this.currentCallDepth--;
        }
    }
}

export interface BaseRuntimeVal {
    readonly type: string;
    readonly value: unknown;
}

export abstract class ASTNode<R extends BaseRuntimeVal, C extends BaseExecutionContext> {
    readonly kind: string;
    readonly loc: SourceLocation;

    constructor(kind: string, loc: SourceLocation) {
        this.kind = kind;
        this.loc = loc;
    }

    evaluate(context: C): R {
        return context.call(() => this.evaluateInner(context));
    }

    protected abstract evaluateInner(context: C): R;
}

export type PrattRule<T extends BaseTokenType<string>> = {
    operator: T;
    lbp: number; // left binding power
    rbp: number; // right binding power
    nud?: (token: Token<T>, parser: Parser<T>) => ASTNode<BaseRuntimeVal, BaseExecutionContext>; // prefix operators
    led?: (
        left: ASTNode<BaseRuntimeVal, BaseExecutionContext>,
        token: Token<T>,
        parser: Parser<T>,
    ) => ASTNode<BaseRuntimeVal, BaseExecutionContext>; // infix/postfix operators
};

type BaseFunction<T extends BaseTokenType<string>> = (
    parser: Parser<T>,
) => ASTNode<BaseRuntimeVal, BaseExecutionContext>;

export class Parser<T extends BaseTokenType<string>> {
    private readonly config: {
        maxParseDepth: number;
    };

    private currentParseDepth: number;

    constructor(
        public readonly tokenStream: TokenStream<T>,
        private prattRules: PrattRule<T>[],
        private base: BaseFunction<T>,
        config = { maxParseDepth: 100 },
    ) {
        this.config = config;
        this.currentParseDepth = 0;
    }

    private callParse<R>(fn: () => R): R {
        if (this.currentParseDepth >= this.config.maxParseDepth) {
            const token = this.peekToken();
            throw new MaxCallDepthExceededError(
                this.config.maxParseDepth,
                token ? getTokenLocation(token) : { index: -1 },
            );
        }
        this.currentParseDepth++;
        try {
            return fn();
        } finally {
            this.currentParseDepth--;
        }
    }

    peekToken(): Token<T> | undefined {
        return this.tokenStream.peek();
    }

    expectToken(expectedType: T): Token<T> {
        const token = this.consumeToken();
        if (!token || isTokenEOX(token) || token.type !== expectedType) {
            throw new UnexpectedTokenError(token ?? EOX, [expectedType as string]);
        }
        return token;
    }

    consumeToken(): Token<T> | undefined {
        return this.tokenStream.consume();
    }

    parsePratt(precedence = 0): ASTNode<BaseRuntimeVal, BaseExecutionContext> {
        return this.callParse(() => {
            const token = this.consumeToken();

            if (!token || token === EOX) {
                throw new UnexpectedEndOfInputError();
            }

            const rule = this.prattRules.find((r) => r.operator === token.type);
            if (!rule || !rule.nud) {
                throw new UnexpectedTokenError(token, []);
            }

            let left = rule.nud(token, this);

            while (true) {
                const nextToken = this.peekToken(); // Look at the next token without consuming it
                if (!nextToken || isTokenEOX(nextToken)) {
                    break;
                }

                const nextRule = this.prattRules.find((r) => r.operator === nextToken.type);
                if (!nextRule || !nextRule.led || nextRule.lbp <= precedence) {
                    // If the next token is not an operator or has lower binding power, stop parsing.
                    break;
                }

                // If valid, consume
                this.consumeToken();

                left = nextRule.led(left, nextToken, this);
            }

            return left;
        });
    }

    parse(): ASTNode<BaseRuntimeVal, BaseExecutionContext> {
        const node = this.base(this);

        if (!this.tokenStream.isEOX(this.peekToken())) {
            const nextToken = this.peekToken();
            throw new UnexpectedTokenError(nextToken ?? EOX);
        }

        return node;
    }
}
