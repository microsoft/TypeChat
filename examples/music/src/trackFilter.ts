export enum FilterTokenType {
    Genre,
    Artist,
    Year,
    Description,
    Colon,
    AND,
    OR,
    LParen,
    RParen,
    Value,
}

// split a string into an array of non-whitespace strings
function splitNonWhitespace(str: string): string[] {
    const nested = str.split(/\s+/).map((w) => w.split(/\b/));
    return nested.flat().filter((w) => w.length > 0);
}

interface FilterToken {
    type: FilterTokenType;
    rawValue?: string;
}

function tokenize(filter: string) {
    const nonws = splitNonWhitespace(filter);
    const tokens: FilterToken[] = [];
    for (const rawtok of nonws) {
        const tok = rawtok.toLowerCase();
        if (tok === 'and') {
            tokens.push({ type: FilterTokenType.AND });
        } else if (tok === 'or') {
            tokens.push({ type: FilterTokenType.OR });
        } else if (tok === '(') {
            tokens.push({ type: FilterTokenType.LParen });
        } else if (tok === ')') {
            tokens.push({ type: FilterTokenType.RParen });
        } else if (tok === ':') {
            tokens.push({ type: FilterTokenType.Colon });
        } else if (tok === 'genre') {
            tokens.push({ type: FilterTokenType.Genre });
        } else if (tok === 'artist') {
            tokens.push({ type: FilterTokenType.Artist });
        } else if (tok === 'year') {
            tokens.push({ type: FilterTokenType.Year });
        } else if (tok === 'description') {
            tokens.push({ type: FilterTokenType.Description });
        } else {
            tokens.push({ type: FilterTokenType.Value, rawValue: rawtok });
        }
    }
    return tokens;
}

export enum FilterConstraintType {
    Genre = 'genre',
    Artist = 'artist',
    Year = 'year',
    Description = 'description',
}

export enum FilterCombinerType {
    AND = 'AND',
    OR = 'OR',
}

export interface FilterCombiner {
    type: 'combiner';
    combinerType: FilterCombinerType;
    operands: FilterNode[];
}

export interface FilterConstraint {
    type: 'constraint';
    constraintType: FilterConstraintType;
    constraintValue: string;
}

export type FilterNode = FilterConstraint | FilterCombiner;

export interface IFilterResult {
    diagnostics?: string[];
    ast?: FilterNode;
}

function makeFilterCombiner(combinerType = FilterCombinerType.AND) {
    return { type: 'combiner', combinerType, operands: [] } as FilterCombiner;
}

// map filter token type to filter constraint type
const filterConstraintTypeMap = new Map<FilterTokenType, FilterConstraintType>([
    [FilterTokenType.Genre, FilterConstraintType.Genre],
    [FilterTokenType.Artist, FilterConstraintType.Artist],
    [FilterTokenType.Year, FilterConstraintType.Year],
    [FilterTokenType.Description, FilterConstraintType.Description],
]);

function makeFilterConstraint(
    constraintType: FilterConstraintType,
    constraintValue?: string
) {
    return {
        type: 'constraint',
        constraintType,
        constraintValue,
    } as FilterConstraint;
}

function isValueBoundary(tokenType: FilterTokenType) {
    return (
        tokenType !== FilterTokenType.Colon &&
        tokenType !== FilterTokenType.Value
    );
}

export function filterNodeToString(node: FilterNode, depth = 0): string {
    if (node.type === 'combiner') {
        return (
            '(' +
            node.combinerType +
            ' ' +
            node.operands
                .map((op) => filterNodeToString(op, depth + 1))
                .join(' ') +
            ')'
        );
    } else {
        return node.constraintType + ':' + node.constraintValue;
    }
}

function simplifyFilterNode(ast: FilterNode): FilterNode {
    if (ast.type === 'combiner') {
        if (ast.operands.length === 1) {
            return simplifyFilterNode(ast.operands[0]);
        } else {
            for (let i = 0; i < ast.operands.length; i++) {
                ast.operands[i] = simplifyFilterNode(ast.operands[i]);
            }
            return ast;
        }
    } else {
        return ast;
    }
}

interface FilterStackFrame {
    pendingOr?: FilterCombiner;
    andExpr: FilterCombiner;
}

export function parseFilter(filter: string): IFilterResult {
    const tokens = tokenize(filter);
    let pendingConstraint: FilterConstraint | undefined = undefined;
    const stack: FilterStackFrame[] = [{ andExpr: makeFilterCombiner() }];
    for (const token of tokens) {
        if (isValueBoundary(token.type)) {
            if (pendingConstraint) {
                stack[stack.length - 1].andExpr.operands.push(
                    pendingConstraint
                );
                pendingConstraint = undefined;
            }
        }
        if (
            token.type === FilterTokenType.Genre ||
            token.type === FilterTokenType.Artist ||
            token.type === FilterTokenType.Year ||
            token.type === FilterTokenType.Description
        ) {
            if (pendingConstraint !== undefined) {
                return { diagnostics: ['Nested constraint prefix'] };
            } else {
                pendingConstraint = makeFilterConstraint(
                    filterConstraintTypeMap.get(token.type)!,
                    ''
                );
            }
        } else if (token.type === FilterTokenType.Colon) {
            if (!pendingConstraint) {
                return { diagnostics: ["Expected constraint type before ':'"] };
            }
        } else if (token.type === FilterTokenType.AND) {
            // do nothing; always in an AND
        } else if (token.type === FilterTokenType.OR) {
            const orNode = makeFilterCombiner(FilterCombinerType.OR);
            const top = stack[stack.length - 1];
            if (top.pendingOr) {
                top.pendingOr.operands.push(top.andExpr);
                orNode.operands.push(top.pendingOr);
            } else {
                orNode.operands.push(top.andExpr);
            }
            top.pendingOr = orNode;
            top.andExpr = makeFilterCombiner();
        } else if (token.type === FilterTokenType.LParen) {
            stack.push({ andExpr: makeFilterCombiner() });
        } else if (token.type === FilterTokenType.RParen) {
            if (stack.length === 1) {
                return { diagnostics: ['Mismatched )'] };
            }
            const prevTop = stack.pop()!;
            if (prevTop.pendingOr) {
                prevTop.pendingOr.operands.push(prevTop.andExpr);
                stack[stack.length - 1].andExpr.operands.push(
                    prevTop.pendingOr
                );
            } else {
                stack[stack.length - 1].andExpr.operands.push(prevTop.andExpr);
            }
        } else if (token.type === FilterTokenType.Value) {
            if (!pendingConstraint) {
                console.log(token.rawValue);
                return {
                    diagnostics: [
                        'Unexpected: value without constraint prefix',
                    ],
                };
            } else {
                if (pendingConstraint.constraintValue.length > 0) {
                    pendingConstraint.constraintValue += ' ';
                }
                pendingConstraint.constraintValue += token.rawValue!;
            }
        }
    }
    if (pendingConstraint) {
        stack[stack.length - 1].andExpr.operands.push(pendingConstraint);
    }
    if (stack.length !== 1) {
        return { diagnostics: ['Mismatched ('] };
    }
    const top = stack[0];
    if (top.pendingOr) {
        top.pendingOr.operands.push(top.andExpr);
        return { ast: simplifyFilterNode(top.pendingOr) };
    } else {
        return { ast: simplifyFilterNode(top.andExpr) };
    }
}

const testFilters = [
    'artist:elton john OR artist: bach',
    'genre:baroque AND description:animals',
    'genre:baroque OR description:animals',
    'genre:baroque OR description:animals OR artist:bach',
    'genre:baroque OR (description:animals OR artist:bach)',
    'genre:baroque (description :   animals OR artist: bach)',
    'genre:baroque artist:toscanini (description:animals OR artist:bach AND artist:swift)',
    'genre:baroque artist:toscanini year: 1941 (description:animals OR artist:bach AND artist:swift)',
    'genre:grunge artist:cobain year: 1992-1997 OR (description:animals AND artist:swift)',
    'genre:grunge artist:cobain year: 1992-1997 OR (description:animals AND artist:swift) OR (genre:baroque AND artist:bach)',
];

// if this is the main module, run some tests
if (require.main === module) {
    for (const filter of testFilters) {
        const result = parseFilter(filter);
        console.log(filter);
        if (result.diagnostics) {
            console.log(result.diagnostics);
        } else if (result.ast) {
            console.log(filterNodeToString(result.ast));
        }
    }
}
