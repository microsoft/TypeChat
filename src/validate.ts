import * as ts from 'typescript';
import { Result, success, error } from './result';

const libText = `interface Array<T> {
    length: number;
    [n: number]: T;
    concat(...items: T[]): T[];
    join(separator?: string): string;
    slice(start?: number, end?: number): T[];
    indexOf(searchElement: T, fromIndex?: number): number;
    lastIndexOf(searchElement: T, fromIndex?: number): number;
    every(predicate: (value: T, index: number) => unknown): boolean;
    some(predicate: (value: T, index: number) => unknown): boolean;
    forEach(cb: (value: T, index: number) => void): void;
    map<U>(cb: (value: T, index: number) => U): U[];
    filter(predicate: (value: T, index: number) => unknown): T[];
}
interface String {
    readonly length: number;
    indexOf(searchString: string, position?: number): number;
    lastIndexOf(searchString: string, position?: number): number;
    search(regexp: string | RegExp): number;
    slice(start?: number, end?: number): string;
    split(separator: string | RegExp, limit?: number): string[];
    substring(start: number, end?: number): string;
    substr(from: number, length?: number): string;
    toLowerCase(): string;
    toUpperCase(): string;
    trim(): string;
    startsWith(searchString: string, position?: number): boolean;
    endsWith(searchString: string, endPosition?: number): boolean;
    includes(searchString: string, position?: number): boolean;
    repeat(count: number): string;
}
interface Object { valueOf(): Object }
interface Function { toString(): string, prototype: any }
interface CallableFunction extends Function {}
interface NewableFunction extends Function {}
interface Boolean { valueOf(): boolean }
interface Number { valueOf(): number }
interface RegExp { exec(string: string): unknown }`;

/**
 * Represents an object that can validate JSON strings according to a given TypeScript schema.
 */
export interface TypeChatJsonValidator<T extends object> {
    /**
     * A string containing TypeScript source code for the validation schema.
     */
    schema: string;
    /**
     * A string containing the JSON object target type name in the schema.
     */
    typeName: string;
    /**
     * A boolean indicating whether to delete properties with null values from JSON objects. Some language
     * models (e.g. gpt-3.5-turbo) have a tendency to assign null values to optional properties instead of omitting
     * them. The default for this property is `false`, but an application can set the property to `true` for schemas
     * that don't permit null values.
     */
    stripNulls:  boolean;
    /**
     * Parses and validates the given JSON string according to the associated TypeScript schema. Returns a
     * `Success<T>` object containing the parsed JSON object if valudation was successful. Otherwise, returns
     * an `Error` object with a `message` property that contains the TypeScript compiler diagnostics.
     * @param jsonText The JSON string to validate.
     * @returns The parsed JSON object or the TypeScript compiler diagnostic messages.
     */
    validate(jsonText: string): Result<T>;
}

/**
 * Returns a JSON validator for a given TypeScript schema. Validation is performed by an in-memory instance of
 * the TypeScript compiler. The specified type argument `T` must be the same type as `typeName` in the given `schema`.
 * @param schema A string containing the TypeScript source code for the JSON schema.
 * @param typeName The name of the JSON target type in the schema.
 * @returns A `TypeChatJsonValidator<T>` instance.
 */
export function createJsonValidator<T extends object = object>(schema: string, typeName: string): TypeChatJsonValidator<T> {
    const options = {
        ...ts.getDefaultCompilerOptions(),
        strict: true,
        skipLibCheck: true,
        noLib: true,
        types: []
    };
    const rootProgram = createProgramFromJsonText("{}");
    const validator: TypeChatJsonValidator<T> = {
        schema,
        typeName,
        stripNulls: false,
        validate
    };
    return validator;

    function validate(jsonText: string) {
        let jsonObject;
        try {
            jsonObject = JSON.parse(jsonText);
        }
        catch (e) {
            return error(e instanceof SyntaxError ? e.message : "JSON parse error");
        }
        if (validator.stripNulls) {
            stripNulls(jsonObject);
            jsonText = JSON.stringify(jsonObject, undefined, 2);
        }
        const program = createProgramFromJsonText(jsonText, rootProgram);
        const syntacticDiagnostics = program.getSyntacticDiagnostics();
        const programDiagnostics = syntacticDiagnostics.length ? syntacticDiagnostics : program.getSemanticDiagnostics();
        if (programDiagnostics.length) {
            const diagnostics = programDiagnostics.map(d => typeof d.messageText === "string" ? d.messageText : d.messageText.messageText).join("\n");
            return error(diagnostics);
        }
        return success(jsonObject as T);
    }

    function createProgramFromJsonText(jsonText: string, oldProgram?: ts.Program) {
        const fileMap = new Map([
            createFileMapEntry("/lib.d.ts", libText),
            createFileMapEntry("/schema.ts", schema),
            createFileMapEntry("/json.ts", `import { ${typeName} } from './schema';\nconst json: ${typeName} = ${jsonText};\n`)
        ]);
        const host: ts.CompilerHost = {
            getSourceFile: fileName => fileMap.get(fileName),
            getDefaultLibFileName: () => "lib.d.ts",
            writeFile: () => {},
            getCurrentDirectory: () => "/",
            getCanonicalFileName: fileName => fileName,
            useCaseSensitiveFileNames: () => true,
            getNewLine: () => "\n",
            fileExists: fileName => fileMap.has(fileName),
            readFile: fileName => "",
        };
        return ts.createProgram(Array.from(fileMap.keys()), options, host, oldProgram);
    }

    function createFileMapEntry(filePath: string, fileText: string): [string, ts.SourceFile] {
        return [filePath, ts.createSourceFile(filePath, fileText, ts.ScriptTarget.Latest)];
    }
}

/**
 * Represents an object that can validate and execute a simple subset of JavaScript programs. Validation is
 * performed by an in-memory instance of the TypeScript compiler. The specified type argument `T` must be the
 * same type as `typeName` in the given `schema`.
 */
export interface TypeChatFunctionValidator<T extends Function> {
    /**
     * A string containing TypeScript source code for the validation schema.
     */
    schema: string;
    /**
     * The name of the target function type in the schema.
     */
    typeName: string;
    /**
     * An array of strings containing the names of the function's parameters.
     */
    parameterNames: string[];
    /**
     * Parses and validates the given JavaScript function body according to the associated TypeScript schema. Returns a
     * `Success<TypeChatProgram>` object containing a runnable program if validation was successful. Otherwise, returns
     * an `Error` object with a `message` property that contains the TypeScript compiler diagnostics.
     * @param programText The text of the JavaScript program to validate.
     * @returns A runnable program or the TypeScript compiler diagnostic messages.
     */
    validate(functionBodyText: string): Result<TypeChatFunction<T>>;
}

/**
 * Represents a validated subset JavaScript program that can be executed using the `run` method.
 */
export interface TypeChatFunction<T extends Function> {
    /**
     * The function body.
     */
    functionBodyText: string;
    /**
     * The parsed and validated statements of the function body.
     */
    statements: readonly ts.Statement[];
    /**
     * Returns a callable function created from the validated function body.
     */
    getFunction(): T;
}

/**
 * Returns a JavaScript subset program validator for a given TypeScript schema. Validation is performed by an in-memory
 * instance of the TypeScript compiler.
 * @param schema A string containing the JavaScript source code for the schema.
 * @param typeName The names of top-level exported objects in the schema.
 * @returns A `TypeChatProgramValidator` instance.
 */
export function createFunctionValidator<T extends Function>(schema: string, typeName: string, parameterNames: string[]): TypeChatFunctionValidator<T> {
    const options = {
        ...ts.getDefaultCompilerOptions(),
        strict: true,
        skipLibCheck: true,
        noLib: true,
        types: []
    };
    const rootProgram = createProgramFromText("");
    const validator: TypeChatFunctionValidator<T> = {
        schema,
        typeName,
        parameterNames,
        validate
    };
    return validator;

    function validate(functionBodyText: string) {
        const program = createProgramFromText(functionBodyText, rootProgram);
        const arrowFunction = (program.getSourceFile("/program.ts")!.statements[1] as ts.VariableStatement).declarationList.declarations[0].initializer as ts.ArrowFunction;
        const statements = (arrowFunction.body as ts.Block).statements;
        const validationResult = validateStatements(statements);
        if (!validationResult.success) {
            return validationResult;
        }
        const syntacticDiagnostics = program.getSyntacticDiagnostics();
        const programDiagnostics = syntacticDiagnostics.length ? syntacticDiagnostics : program.getSemanticDiagnostics();
        if (programDiagnostics.length) {
            const diagnostics = programDiagnostics.map(d => typeof d.messageText === "string" ? d.messageText : d.messageText.messageText).join("\n");
            return error(diagnostics);
        }
        const typeChatProgram: TypeChatFunction<T> = {
            functionBodyText,
            statements,
            getFunction() {
                return Function(...parameterNames, functionBodyText) as T;
            }
        }
        return success(typeChatProgram);
    }

    function createProgramFromText(functionBodyText: string, oldProgram?: ts.Program) {
        const fileMap = new Map([
            createFileMapEntry("/lib.d.ts", libText),
            createFileMapEntry("/schema.ts", schema),
            createFileMapEntry("/program.ts", `import { ${typeName} } from './schema';\nconst func: ${typeName} = (${parameterNames.join(", ")}) => {\n${functionBodyText}\n};`)
        ]);
        const host: ts.CompilerHost = {
            getSourceFile: fileName => fileMap.get(fileName),
            getDefaultLibFileName: () => "lib.d.ts",
            writeFile: () => {},
            getCurrentDirectory: () => "/",
            getCanonicalFileName: fileName => fileName,
            useCaseSensitiveFileNames: () => true,
            getNewLine: () => "\n",
            fileExists: fileName => fileMap.has(fileName),
            readFile: fileName => "",
        };
        return ts.createProgram(Array.from(fileMap.keys()), options, host, oldProgram);
    }

    function createFileMapEntry(filePath: string, fileText: string): [string, ts.SourceFile] {
        return [filePath, ts.createSourceFile(filePath, fileText, ts.ScriptTarget.Latest)];
    }
}

function validateStatements(statements: readonly ts.Statement[]): Result<true> {
    let errorMessage: string | undefined;
    return statements.every(isPermittedStatement) ?
        success(true) :
        error(errorMessage ?? "Function contains an unsupported statement or declaration");

    function invalid(message: string) {
        errorMessage = message;
        return false;
    }

    function isPermittedStatement(node: ts.Node): boolean {
        switch (node.kind) {
            case ts.SyntaxKind.ExpressionStatement:
                return isPermittedExpression((node as ts.ExpressionStatement).expression);
            case ts.SyntaxKind.VariableStatement:
                return isPermittedVariableStatement(node as ts.VariableStatement);
            case ts.SyntaxKind.IfStatement:
                return isPermittedIfStatement(node as ts.IfStatement);
            case ts.SyntaxKind.Block:
                return isPermittedBlock(node as ts.Block);
            case ts.SyntaxKind.ReturnStatement:
                return isPermittedReturnStatement(node as ts.ReturnStatement);
            case ts.SyntaxKind.EmptyStatement:
                return true;
            case ts.SyntaxKind.ForStatement:
            case ts.SyntaxKind.ForInStatement:
            case ts.SyntaxKind.ForOfStatement:
            case ts.SyntaxKind.WhileStatement:
            case ts.SyntaxKind.DoStatement:
                return invalid("'for', 'while' and 'do' statements are not permitted");
            case ts.SyntaxKind.SwitchStatement:
                return invalid("'switch' statements are not permitted");
            case ts.SyntaxKind.TryStatement:
            case ts.SyntaxKind.ThrowStatement:
                return invalid("'try' and 'throw' statements are not permitted");
            case ts.SyntaxKind.FunctionDeclaration:
            case ts.SyntaxKind.ClassDeclaration:
                return invalid("'function' and 'class' declarations are not permitted");
        }
        return false;
    }

    function isPermittedBlock(node: ts.Block) {
        return node.statements.every(isPermittedStatement);
    }

    function isPermittedVariableStatement(node: ts.VariableStatement) {
        if (!(node.declarationList.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const))) {
            return invalid("'var' statements are not permitted")
        }
        if (node.modifiers) {
            return invalid("Modifiers are not permitted on variable declarations");
        }
        return node.declarationList.declarations.every(isPermittedVariableDeclaration);
    }

    function isPermittedVariableDeclaration(node: ts.VariableDeclaration) {
        if (node.exclamationToken || node.type) {
            return invalid("Type annotations are not permitted");
        }
        if (node.name.kind !== ts.SyntaxKind.Identifier) {
            return invalid("Binding patterns are not permitted");
        }
        return !node.initializer || isPermittedExpression(node.initializer);
    }

    function isPermittedIfStatement(node: ts.IfStatement) {
        return isPermittedStatement(node.thenStatement) && (!node.elseStatement || isPermittedStatement(node.elseStatement));
    }

    function isPermittedReturnStatement(node: ts.ReturnStatement) {
        return !node.expression || isPermittedExpression(node.expression);
    }

    function isPermittedExpression(node: ts.Node): boolean {
        switch (node.kind) {
            case ts.SyntaxKind.ConditionalExpression:
                return isPermittedExpression((node as ts.ConditionalExpression).condition) &&
                    isPermittedExpression((node as ts.ConditionalExpression).whenTrue) &&
                    isPermittedExpression((node as ts.ConditionalExpression).whenFalse);
            case ts.SyntaxKind.BinaryExpression:
                return isPermittedExpression((node as ts.BinaryExpression).left) &&
                    isPermittedExpression((node as ts.BinaryExpression).right);
            case ts.SyntaxKind.PrefixUnaryExpression:
                return isPermittedExpression((node as ts.PrefixUnaryExpression).operand);
            case ts.SyntaxKind.PostfixUnaryExpression:
                return isPermittedExpression((node as ts.PostfixUnaryExpression).operand);
            case ts.SyntaxKind.TemplateExpression:
                return (node as ts.TemplateExpression).templateSpans.every(span => isPermittedExpression(span.expression));
            case ts.SyntaxKind.PropertyAccessExpression:
                return isPermittedExpression((node as ts.PropertyAccessExpression).expression);
            case ts.SyntaxKind.ElementAccessExpression:
                return isPermittedExpression((node as ts.ElementAccessExpression).expression) &&
                    isPermittedExpression((node as ts.ElementAccessExpression).argumentExpression);
            case ts.SyntaxKind.CallExpression:
                return isPermittedCallExpression(node as ts.CallExpression);
            case ts.SyntaxKind.ArrayLiteralExpression:
                return (node as ts.ArrayLiteralExpression).elements.every(isPermittedExpression);
            case ts.SyntaxKind.ParenthesizedExpression:
                return isPermittedExpression((node as ts.ParenthesizedExpression).expression);
            case ts.SyntaxKind.ObjectLiteralExpression:
                return (node as ts.ObjectLiteralExpression).properties.every(isPermittedProperty);
            case ts.SyntaxKind.Identifier:
            case ts.SyntaxKind.RegularExpressionLiteral:
            case ts.SyntaxKind.NumericLiteral:
            case ts.SyntaxKind.BigIntLiteral:
            case ts.SyntaxKind.StringLiteral:
            case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
            case ts.SyntaxKind.FalseKeyword:
            case ts.SyntaxKind.NullKeyword:
            case ts.SyntaxKind.TrueKeyword:
            case ts.SyntaxKind.OmittedExpression:
                return true;
            case ts.SyntaxKind.ArrowFunction:
                return invalid("Arrow functions are only permitted as call arguments");
            case ts.SyntaxKind.FunctionExpression:
            case ts.SyntaxKind.ClassExpression:
                return invalid("'function' and 'class' expressions are not permitted");
            case ts.SyntaxKind.NewExpression:
                return invalid("'new' operator is not permitted");
            case ts.SyntaxKind.AwaitExpression:
                return invalid("'await' operator is not permitted");
        }
        return false;
    }

    function isPermittedCallExpression(node: ts.CallExpression) {
        if (node.expression.kind !== ts.SyntaxKind.PropertyAccessExpression) {
            return invalid("Only calls to methods of objects are permitted");
        }
        if (node.typeArguments) {
            return invalid("Type arguments are not permitted");
        }
        return isPermittedExpression((node.expression as ts.PropertyAccessExpression).expression) && node.arguments.every(isPermittedArgument);
    }

    function isPermittedArgument(node: ts.Expression) {
        return node.kind === ts.SyntaxKind.ArrowFunction && isPermittedArrowFunction(node as ts.ArrowFunction) || isPermittedExpression(node);
    }

    function isPermittedArrowFunction(node: ts.ArrowFunction) {
        if (node.modifiers || node.asteriskToken || node.questionToken) {
            return invalid("Arrow function modifiers are not permitted");
        }
        return node.body && (node.body.kind === ts.SyntaxKind.Block && isPermittedBlock(node.body as ts.Block) || isPermittedExpression(node.body));
    }

    function isPermittedProperty(node: ts.ObjectLiteralElementLike) {
        switch (node.kind) {
            case ts.SyntaxKind.PropertyAssignment:
                return isPermittedExpression(node.initializer);
            case ts.SyntaxKind.ShorthandPropertyAssignment:
                return isPermittedExpression(node.name);
            case ts.SyntaxKind.SpreadAssignment:
                return isPermittedExpression(node.expression);
        }
        return invalid("Method and property accessor declarations are not permitted");
    }
}

/**
 * Recursively delete properties with null values from the given object. This function assumes there are no
 * circular references in the object.
 * @param obj The object in which to strip null valued properties.
 */
function stripNulls(obj: any) {
    let keysToDelete: string[] | undefined;
    for (const k in obj) {
        const value = obj[k];
        if (value === null) {
            (keysToDelete ??= []).push(k);
        }
        else {
            if (Array.isArray(value)) {
                if (value.some(x => x === null)) {
                    obj[k] = value.filter(x => x !== null);
                }
            }
            if (typeof value === "object") {
                stripNulls(value);
            }
        }
    }
    if (keysToDelete) {
        for (const k of keysToDelete) {
            delete obj[k];
        }
    }
}
