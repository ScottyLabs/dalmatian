import { ASTNode, BaseExecutionContext, Parser, PrattRule } from "./parser.ts";
import { BaseTokenType, TokenStream, Tokenizer } from "./tokenizer.ts";

export type GrammarDefinition<
    TToken extends BaseTokenType<any>,
    TContext extends BaseExecutionContext,
    TResult extends ASTNode<any, TContext>,
> = {
    tokenizer: Tokenizer<TToken>;
    prattRules: PrattRule<TToken>[];
    base: (parser: Parser<TToken>) => TResult;
};

export class GrammarFactory<
    TToken extends BaseTokenType<any>,
    TContext extends BaseExecutionContext,
    TResult extends ASTNode<any, TContext>,
> {
    constructor(private readonly definition: GrammarDefinition<TToken, TContext, TResult>) {}

    tokenize(input: string): TokenStream<TToken> {
        return this.definition.tokenizer.tokenize(input);
    }

    createParser(input: string): Parser<TToken> {
        return new Parser(
            this.tokenize(input),
            this.definition.prattRules,
            this.definition.base,
        );
    }

    parse(input: string): TResult {
        return this.createParser(input).parse() as TResult;
    }
}
