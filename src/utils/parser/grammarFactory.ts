import { ASTNode, BaseExecutionContext, BaseRuntimeVal, Parser, PrattRule } from "./parser.ts";
import { BaseTokenType, TokenRule, tokenize } from "./tokenizer.ts";

export type GrammarDefinition<
    TToken extends BaseTokenType<string>,
    TContext extends BaseExecutionContext,
    TResult extends ASTNode<BaseRuntimeVal, TContext>,
> = {
    tokenizer: TokenRule<TToken>[];
    prattRules: PrattRule<TToken>[];
    base: (parser: Parser<TToken>) => TResult;
};

export type GrammarFactory<
    _TToken extends BaseTokenType<string>,
    TContext extends BaseExecutionContext,
    TResult extends ASTNode<BaseRuntimeVal, TContext>,
> = {
    parse: (input: string) => TResult;
};

export function createGrammarFactory<
    TToken extends BaseTokenType<string>,
    TContext extends BaseExecutionContext,
    TResult extends ASTNode<BaseRuntimeVal, TContext>,
>(
    definition: GrammarDefinition<TToken, TContext, TResult>,
): GrammarFactory<TToken, TContext, TResult> {
    return {
        parse: (input: string): TResult => {
            const tokens = tokenize(definition.tokenizer, input);
            const parser = new Parser(tokens, definition.prattRules, definition.base);
            return parser.parse() as TResult;
        },
    };
}
