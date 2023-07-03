import * as ts from 'typescript';
import { Result, success, error } from './result';

const libText = `interface Array<T> { length: number, [n: number]: T }
interface Object { valueOf(): Object }
interface Function { toString(): string, prototype: any }
interface CallableFunction extends Function {}
interface NewableFunction extends Function {}
interface String { readonly length: number }
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
            getNewLine: () => "\r",
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
 * Represents an object that can validate and execute a simple subset of JavaScript programs.
 */
export interface TypeChatProgramValidator {
    /**
     * A string containing TypeScript source code for the validation schema.
     */
    schema: string;
    /**
     * An array of strings containing the names of the exported top-level objects in the schema.
     */
    globalNames: string[];
    /**
     * Parses and validates the given JavaScript program according to the associated TypeScript schema. Returns a
     * `Success<TypeChatProgram>` object containing a runnable program if validation was successful. Otherwise, returns
     * an `Error` object with a `message` property that contains the TypeScript compiler diagnostics.
     * @param programText The text of the JavaScript program to validate.
     * @returns A runnable program or the TypeScript compiler diagnostic messages.
     */
    validate(programText: string): Result<TypeChatProgram>;
}

/**
 * Represents a validated subset JavaScript program that can be executed using the `run` method.
 */
export interface TypeChatProgram {
    /**
     * The parsed and validated JavaScript program.
     */
    tsProgram: ts.Program;
    /**
     * Runs the program with a given set of global variables and a given handler for method calls made by
     * code in the program. The program is run using a simple interpreter that walks the syntax trees in
     * the `tsProgram` object.
     * @param globals An object with properties representing the accessible global variables of the program.
     * @param onCall A callback for handling methods calls performed by the program.
     */
    run(globals: Record<string, any>, onCall: CallHandler): void;
}

export type CallHandler = (object: any, methodName: string, args: any[]) => any;

/**
 * Returns a JavaScript subset program validator for a given TypeScript schema. Validation is performed by an in-memory
 * instance of the TypeScript compiler.
 * @param schema A string containing the JavaScript source code for the schema.
 * @param typeName The names of top-level exported objects in the schema.
 * @returns A `TypeChatProgramValidator` instance.
 */
export function createProgramValidator(schema: string, globalNames: string[]): TypeChatProgramValidator {
    const options = {
        ...ts.getDefaultCompilerOptions(),
        strict: true,
        skipLibCheck: true,
        noLib: true,
        types: []
    };
    const rootProgram = createProgramFromText("");
    const validator: TypeChatProgramValidator = {
        schema,
        globalNames,
        validate
    };
    return validator;

    function validate(programText: string) {
        const program = createProgramFromText(programText, rootProgram);
        const statements = program.getSourceFile("/program.ts")?.statements.slice(1) ?? [];
        if (!isPermittedProgram(statements, globalNames)) {
            return error("Program cannot be successfully verified");
        }
        const syntacticDiagnostics = program.getSyntacticDiagnostics();
        const programDiagnostics = syntacticDiagnostics.length ? syntacticDiagnostics : program.getSemanticDiagnostics();
        if (programDiagnostics.length) {
            const diagnostics = programDiagnostics.map(d => typeof d.messageText === "string" ? d.messageText : d.messageText.messageText).join("\n");
            return error(diagnostics);
        }
        const typeChatProgram: TypeChatProgram = {
            tsProgram: program,
            run(globals, onCall) {
                evaluateProgram(statements, globals, onCall);
            }
        }
        return success(typeChatProgram);
    }

    function createProgramFromText(programText: string, oldProgram?: ts.Program) {
        const fileMap = new Map([
            createFileMapEntry("/lib.d.ts", libText),
            createFileMapEntry("/schema.ts", schema),
            createFileMapEntry("/program.ts", `import { ${globalNames.join(", ")} } from './schema';\n${programText}`)
        ]);
        const host: ts.CompilerHost = {
            getSourceFile: fileName => fileMap.get(fileName),
            getDefaultLibFileName: () => "lib.d.ts",
            writeFile: () => {},
            getCurrentDirectory: () => "/",
            getCanonicalFileName: fileName => fileName,
            useCaseSensitiveFileNames: () => true,
            getNewLine: () => "\r",
            fileExists: fileName => fileMap.has(fileName),
            readFile: fileName => "",
        };
        return ts.createProgram(Array.from(fileMap.keys()), options, host, oldProgram);
    }

    function createFileMapEntry(filePath: string, fileText: string): [string, ts.SourceFile] {
        return [filePath, ts.createSourceFile(filePath, fileText, ts.ScriptTarget.Latest)];
    }
}

function isPermittedProgram(statements: ts.Statement[], globalNames: string[]) {
    return statements.every(isPermittedStatement);

    function isPermittedStatement(node: ts.Node): boolean {
        switch (node.kind) {
            case ts.SyntaxKind.ExpressionStatement:
                return isPermittedExpression((node as ts.ExpressionStatement).expression);
            case ts.SyntaxKind.VariableStatement:
                return isPermittedVariableStatement(node as ts.VariableStatement);
            case ts.SyntaxKind.IfStatement:
                return isPermittedIfStatement(node as ts.IfStatement);
            case ts.SyntaxKind.Block:
                return (node as ts.Block).statements.every(isPermittedStatement);
            case ts.SyntaxKind.EmptyStatement:
                return true;
        }
        return false;
    }

    function isPermittedVariableStatement(node: ts.VariableStatement) {
        return !node.modifiers && !!(node.declarationList.flags & ts.NodeFlags.Const) &&
            node.declarationList.declarations.every(isPermittedVariableDeclaration);
    }

    function isPermittedVariableDeclaration(node: ts.VariableDeclaration) {
        return node.name.kind === ts.SyntaxKind.Identifier && globalNames.indexOf(getIdentifierText(node.name as ts.Identifier)) < 0 &&
            !node.exclamationToken && !node.type && node.initializer && isPermittedExpression(node.initializer);
    }

    function isPermittedIfStatement(node: ts.IfStatement) {
        return isPermittedStatement(node.thenStatement) && (!node.elseStatement || isPermittedStatement(node.elseStatement));
    }

    function isPermittedExpression(node: ts.Node): boolean {
        switch (node.kind) {
            case ts.SyntaxKind.ConditionalExpression:
                return isPermittedExpression((node as ts.ConditionalExpression).condition) &&
                    isPermittedExpression((node as ts.ConditionalExpression).whenTrue) &&
                    isPermittedExpression((node as ts.ConditionalExpression).whenFalse);
            case ts.SyntaxKind.BinaryExpression:
                return isPermittedBinaryOperator((node as ts.BinaryExpression).operatorToken.kind) &&
                    isPermittedExpression((node as ts.BinaryExpression).left) &&
                    isPermittedExpression((node as ts.BinaryExpression).right);
            case ts.SyntaxKind.PrefixUnaryExpression:
                return isPermittedUnaryOperator((node as ts.PrefixUnaryExpression).operator) &&
                    isPermittedExpression((node as ts.PrefixUnaryExpression).operand);
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
        }
        return false;
    }

    function isPermittedCallExpression(node: ts.CallExpression) {
        return node.expression.kind === ts.SyntaxKind.PropertyAccessExpression &&
            isPermittedExpression((node.expression as ts.PropertyAccessExpression).expression) &&
            !node.typeArguments && node.arguments.every(isPermittedExpression);
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
        return false;
    }

    function isPermittedBinaryOperator(operator: ts.SyntaxKind) {
        switch (operator) {
            case ts.SyntaxKind.QuestionQuestionToken:
            case ts.SyntaxKind.AmpersandAmpersandToken:
            case ts.SyntaxKind.BarBarToken:
            case ts.SyntaxKind.AmpersandToken:
            case ts.SyntaxKind.BarToken:
            case ts.SyntaxKind.CaretToken:
            case ts.SyntaxKind.EqualsEqualsToken:
            case ts.SyntaxKind.EqualsEqualsEqualsToken:
            case ts.SyntaxKind.ExclamationEqualsEqualsToken:
            case ts.SyntaxKind.ExclamationEqualsToken:
            case ts.SyntaxKind.LessThanToken:
            case ts.SyntaxKind.LessThanEqualsToken:
            case ts.SyntaxKind.GreaterThanToken:
            case ts.SyntaxKind.GreaterThanEqualsToken:
            case ts.SyntaxKind.LessThanLessThanToken:
            case ts.SyntaxKind.GreaterThanGreaterThanToken:
            case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken:
            case ts.SyntaxKind.PlusToken:
            case ts.SyntaxKind.MinusToken:
            case ts.SyntaxKind.AsteriskToken:
            case ts.SyntaxKind.SlashToken:
            case ts.SyntaxKind.PercentToken:
            case ts.SyntaxKind.AsteriskAsteriskToken:
                return true;
        }
        return false;
    }

    function isPermittedUnaryOperator(operator: ts.SyntaxKind) {
        switch (operator) {
            case ts.SyntaxKind.PlusToken:
            case ts.SyntaxKind.MinusToken:
            case ts.SyntaxKind.TildeToken:
            case ts.SyntaxKind.ExclamationToken:
                return true;
        }
        return false;
    }
}

function evaluateProgram(statements: ts.Statement[], globals: Record<string, any>, onCall: CallHandler) {
    type Scope = {
        locals: Record<string, any> | undefined;
        next: Scope | undefined;
    };
    let stack: Scope = { locals: globals, next: undefined };
    statements.forEach(evalStatement);

    function evalStatement(node: ts.Statement): void {
        switch (node.kind) {
            case ts.SyntaxKind.ExpressionStatement:
                evalExpression((node as ts.ExpressionStatement).expression);
                return;
            case ts.SyntaxKind.VariableStatement:
                evalVariableStatement(node as ts.VariableStatement);
                return;
            case ts.SyntaxKind.IfStatement:
                evalIfStatement(node as ts.IfStatement);
                return;
            case ts.SyntaxKind.Block:
                evalBlock(node as ts.Block);
                return;
        }
        evalError();
    }

    function evalVariableStatement(node: ts.VariableStatement) {
        node.declarationList.declarations.forEach(evalVariableDeclaration);
    }

    function evalVariableDeclaration(node: ts.VariableDeclaration) {
        if (node.name.kind !== ts.SyntaxKind.Identifier || !node.initializer) {
            evalError();
        }
        const name = getIdentifierText(node.name);
        const value = evalExpression(node.initializer);
        const locals = stack.locals ??= {};
        locals[name] = value;
    }

    function evalIfStatement(node: ts.IfStatement) {
        if (evalExpression(node.expression)) {
            evalStatement(node.thenStatement);
        }
        else if (node.elseStatement) {
            evalStatement(node.elseStatement);
        }
    }

    function evalBlock(node: ts.Block) {
        const oldStack = stack;
        stack = { locals: undefined, next: oldStack };
        node.statements.forEach(evalStatement);
        stack = oldStack;
    }

    function evalExpression(node: ts.Expression): any {
        switch (node.kind) {
            case ts.SyntaxKind.ConditionalExpression:
                return evalExpression((node as ts.ConditionalExpression).condition) ?
                    evalExpression((node as ts.ConditionalExpression).whenTrue) :
                    evalExpression((node as ts.ConditionalExpression).whenFalse);
            case ts.SyntaxKind.BinaryExpression:
                return evalBinaryExpression(node as ts.BinaryExpression);
            case ts.SyntaxKind.PrefixUnaryExpression:
                return evalPrefixUnaryExpression(node as ts.PrefixUnaryExpression);
            case ts.SyntaxKind.TemplateExpression:
                return evalTemplateExpression(node as ts.TemplateExpression);
            case ts.SyntaxKind.PropertyAccessExpression:
                return evalPropertyAccessExpression(node as ts.PropertyAccessExpression);
            case ts.SyntaxKind.ElementAccessExpression:
                return evalElementAccessExpression(node as ts.ElementAccessExpression);
            case ts.SyntaxKind.CallExpression:
                return evalCallExpression(node as ts.CallExpression);
            case ts.SyntaxKind.ArrayLiteralExpression:
                return (node as ts.ArrayLiteralExpression).elements.map(evalExpression);
            case ts.SyntaxKind.ParenthesizedExpression:
                return evalExpression((node as ts.ParenthesizedExpression).expression);
            case ts.SyntaxKind.ObjectLiteralExpression:
                return evalObjectLiteralExpression(node as ts.ObjectLiteralExpression);
            case ts.SyntaxKind.Identifier:
                return evalIdentifier(node as ts.Identifier);
            case ts.SyntaxKind.RegularExpressionLiteral:
                return RegExp((node as ts.RegularExpressionLiteral).text);
            case ts.SyntaxKind.NumericLiteral:
                return +(node as ts.NumericLiteral).text;
            case ts.SyntaxKind.StringLiteral:
                return (node as ts.StringLiteral).text;
            case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
                return (node as ts.NoSubstitutionTemplateLiteral).text;
            case ts.SyntaxKind.FalseKeyword:
                return false;
            case ts.SyntaxKind.NullKeyword:
                return null;
            case ts.SyntaxKind.TrueKeyword:
                return true;
            case ts.SyntaxKind.OmittedExpression:
                return undefined;
        }
        evalError();
    }

    function evalIdentifier(node: ts.Identifier) {
        const name = getIdentifierText(node);
        for (let scope: Scope | undefined = stack; scope; scope = scope.next) {
            if (scope.locals && scope.locals.hasOwnProperty(name)) {
                return scope.locals[name];
            }
        }
        evalError();
    }

    function evalBinaryExpression(node: ts.BinaryExpression) {
        const left = evalExpression(node.left);
        const operator = node.operatorToken.kind;
        if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
            return left && evalExpression(node.right);
        }
        if (operator === ts.SyntaxKind.BarBarToken) {
            return left || evalExpression(node.right);
        }
        if (operator === ts.SyntaxKind.QuestionQuestionToken) {
            return left ?? evalExpression(node.right);
        }
        const right = evalExpression(node.right);
        switch (operator) {
            case ts.SyntaxKind.AmpersandToken:
                return left & right;
            case ts.SyntaxKind.BarToken:
                return left | right;
            case ts.SyntaxKind.CaretToken:
                return left ^ right;
            case ts.SyntaxKind.EqualsEqualsToken:
                return left == right;
            case ts.SyntaxKind.EqualsEqualsEqualsToken:
                return left === right;
            case ts.SyntaxKind.ExclamationEqualsEqualsToken:
                return left !== right;
            case ts.SyntaxKind.ExclamationEqualsToken:
                return left != right;
            case ts.SyntaxKind.LessThanToken:
                return left < right;
            case ts.SyntaxKind.LessThanEqualsToken:
                return left <= right;
            case ts.SyntaxKind.GreaterThanToken:
                return left > right;
            case ts.SyntaxKind.GreaterThanEqualsToken:
                return left >= right;
            case ts.SyntaxKind.LessThanLessThanToken:
                return left << right;
            case ts.SyntaxKind.GreaterThanGreaterThanToken:
                return left >> right;
            case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken:
                return left >>> right;
            case ts.SyntaxKind.PlusToken:
                return left + right;
            case ts.SyntaxKind.MinusToken:
                return left - right;
            case ts.SyntaxKind.AsteriskToken:
                return left * right;
            case ts.SyntaxKind.SlashToken:
                return left / right;
            case ts.SyntaxKind.PercentToken:
                return left % right;
            case ts.SyntaxKind.AsteriskAsteriskToken:
                return left ** right;
        }
        evalError();
    }

    function evalPrefixUnaryExpression(node: ts.PrefixUnaryExpression) {
        const operand = evalExpression(node.operand);
        switch (node.operator) {
            case ts.SyntaxKind.PlusToken:
                return +operand;
            case ts.SyntaxKind.MinusToken:
                return -operand;
            case ts.SyntaxKind.TildeToken:
                return ~operand;
            case ts.SyntaxKind.ExclamationToken:
                return !operand;
        }
        evalError();
    }

    function evalTemplateExpression(node: ts.TemplateExpression) {
        return node.head.text + node.templateSpans.map(span => evalExpression(span.expression) + span.literal.text).join("");
    }

    function evalPropertyAccessExpression(node: ts.PropertyAccessExpression) {
        if (node.name.kind !== ts.SyntaxKind.Identifier) {
            evalError();
        }
        const object = evalExpression(node.expression);
        const name = getIdentifierText(node.name);
        return object[name];
    }

    function evalElementAccessExpression(node: ts.ElementAccessExpression) {
        const object = evalExpression(node.expression);
        const name = evalExpression(node.argumentExpression);
        return object[name];
    }

    function evalCallExpression(node: ts.CallExpression) {
        if (node.expression.kind !== ts.SyntaxKind.PropertyAccessExpression || !ts.isIdentifier((node.expression as ts.PropertyAccessExpression).name)) {
            evalError();
        }
        const object = evalExpression((node.expression as ts.PropertyAccessExpression).expression);
        const methodName = getIdentifierText((node.expression as ts.PropertyAccessExpression).name as ts.Identifier);
        const args = node.arguments.map(evalExpression);
        return onCall(object, methodName, args);
    }

    function evalObjectLiteralExpression(node: ts.ObjectLiteralExpression) {
        const result = {} as any;
        for (const prop of node.properties) {
            switch (prop.kind) {
                case ts.SyntaxKind.PropertyAssignment:
                    result[getPropertyNameString(prop.name)] = evalExpression(prop.initializer);
                    break;
                case ts.SyntaxKind.ShorthandPropertyAssignment:
                    result[getPropertyNameString(prop.name)] = evalExpression(prop.name);
                    break;
                default:
                    evalError();
            }
        }
        return result;
    }

    function getPropertyNameString(name: ts.PropertyName) {
        switch (name.kind) {
            case ts.SyntaxKind.Identifier:
                return getIdentifierText(name);
            case ts.SyntaxKind.StringLiteral:
                return name.text;
            case ts.SyntaxKind.NumericLiteral:
                return +name.text;
        }
        evalError();
    }

    function evalError(): never {
        throw new Error("Program uses unsupported features");
    }
}

function getIdentifierText(node: ts.Identifier) {
    return ts.unescapeLeadingUnderscores(node.escapedText);
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
