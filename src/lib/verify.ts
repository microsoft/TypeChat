import * as ts from 'typescript';

const libText = `interface Array<T> { length: number, [n: number]: T }
interface Object { valueOf(): Object }
interface Function { toString(): string, prototype: any }
interface CallableFunction extends Function {}
interface NewableFunction extends Function {}
interface String { readonly length: number }
interface Boolean { valueOf(): boolean }
interface Number { valueOf(): number }
interface RegExp { exec(string: string): unknown }`;

export function verifyJsonObject(
    json: object,
    schema: string,
    typeName: string
) {
    const options = {
        ...ts.getDefaultCompilerOptions(),
        strict: true,
        skipLibCheck: true,
        noLib: true,
        types: [],
    };
    const libFilePath = '/lib.d.ts';
    const schemaFilePath = '/schema.ts';
    const jsonFilePath = '/json.ts';
    const libSourceFile = ts.createSourceFile(
        libFilePath,
        libText,
        ts.ScriptTarget.Latest
    );
    const schemaSourceFile = ts.createSourceFile(
        schemaFilePath,
        schema,
        ts.ScriptTarget.Latest
    );
    const jsonSourceFile = ts.createSourceFile(
        jsonFilePath,
        `import { ${typeName} } from './schema';\nconst json: ${typeName} = ${JSON.stringify(
            json
        )};`,
        ts.ScriptTarget.Latest
    );
    const host: ts.CompilerHost = {
        getSourceFile: (fileName) =>
            fileName === libFilePath
                ? libSourceFile
                : fileName === schemaFilePath
                ? schemaSourceFile
                : fileName === jsonFilePath
                ? jsonSourceFile
                : undefined,
        getDefaultLibFileName: () => 'lib.d.ts',
        writeFile: () => {},
        getCurrentDirectory: () => '/',
        getCanonicalFileName: (fileName) => fileName,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\r',
        fileExists: (fileName) =>
            fileName === libFilePath ||
            fileName === schemaFilePath ||
            fileName === jsonFilePath,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        readFile: (fileName) => '',
    };
    const program = ts.createProgram(
        [libFilePath, schemaFilePath, jsonFilePath],
        options,
        host
    );
    return program
        .getSemanticDiagnostics()
        .map((d) =>
            typeof d.messageText === 'string'
                ? d.messageText
                : d.messageText.messageText
        );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function test() {
    const schema = `type OrderItem = {
        kind: "pizza" | "salad" | "beer",
        description: string
    };
    type Order = { items: OrderItem[] };`;

    const json = {
        items: [
            { kind: 'pizza', description: 'Large with anchovies' },
            { kind: 'beer' },
            { kind: 'salad', description: 'half Greek' },
        ],
    };

    const diagnostics = verifyJsonObject(json, schema, 'Order');
    for (const d of diagnostics) {
        console.log(d);
    }
}
