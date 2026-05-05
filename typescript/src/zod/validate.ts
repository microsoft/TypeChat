import { z } from "zod";
import { success, error } from '../result';
import { TypeChatJsonValidator } from '../typechat';

/**
 * Returns a JSON validator for a given Zod schema. The schema is supplied as an object where each property provides
 * a name for an associated Zod type. The `validate` method of the returned object validates a JSON object against the
 * supplied schema, the `getSchemaText` method obtains the TypeScript source text representation of the schema, and
 * the `getTypeName` method obtains the name of the given target type in the schema.
 * @param schema A schema object where each property provides a name for an associated Zod type.
 * @param targetType The name in the schema of the target type for JSON validation.
 * @returns A `TypeChatJsonValidator<z.infer<T[K]> & object>`, where T is the schema and K is the target type name.
 */
export function createZodJsonValidator<T extends Record<string, z.ZodType>, K extends keyof T & string>(schema: T, typeName: K): TypeChatJsonValidator<z.infer<T[K]> & object> {
    let schemaText: string;
    const validator: TypeChatJsonValidator<z.infer<T[K]> & object> = {
        getSchemaText: () => schemaText ??= getZodSchemaAsTypeScript(schema),
        getTypeName: () => typeName,
        validate
    };
    return validator;

    function validate(jsonObject: object) {
        const result = schema[typeName].safeParse(jsonObject);
        if (!result.success) {
            return error(result.error.issues.map(({ path, message }) => `${path.map(key => `[${JSON.stringify(key)}]`).join("")}: ${message}`).join("\""));
        }
        return success(result.data as z.infer<T[K]> & object);
    }
}

function getTypeKind(type: z.ZodType): string {
    return (type._zod.def as z.core.$ZodTypeDef).type;
}

function getTypeIdentity(type: z.ZodType): object {
    switch (getTypeKind(type)) {
        case "object":
            return (type._zod.def as z.core.$ZodObjectDef).shape;
        case "enum":
            return (type._zod.def as z.core.$ZodEnumDef).entries;
        case "union":
            return (type._zod.def as z.core.$ZodUnionDef).options;
    }
    return type;
}

const enum TypePrecedence {
    Union = 0,
    Intersection = 1,
    Object = 2
}

function getTypePrecedence(type: z.ZodType): TypePrecedence {
    switch (getTypeKind(type)) {
        case "enum":
        case "union":
            return TypePrecedence.Union;
        case "intersection":
            return TypePrecedence.Intersection;
    }
    return TypePrecedence.Object;
}

/**
 * Returns the TypeScript source code corresponding to a Zod schema. The schema is supplied as an object where each
 * property provides a name for an associated Zod type. The return value is a string containing the TypeScript source
 * code corresponding to the schema. Each property of the schema object is emitted as a named `interface` or `type`
 * declaration for the associated type and is referenced by that name in the emitted type declarations. Other types
 * referenced in the schema are emitted in their structural form.
 * @param schema A schema object where each property provides a name for an associated Zod type.
 * @returns The TypeScript source code corresponding to the schema.
 */
export function getZodSchemaAsTypeScript(schema: Record<string, z.ZodType>): string {
    let result = "";
    let startOfLine = true;
    let indent = 0;
    const entries = Array.from(Object.entries(schema));
    let namedTypes = new Map<object, string>(entries.map(([name, type]) => [getTypeIdentity(type), name]));
    for (const [name, type] of entries) {
        if (result) {
            appendNewLine();
        }
        const description = type.description;
        if (description) {
            for (const comment of description.split("\n")) {
                append(`// ${comment}`);
                appendNewLine();
            }
        }
        if (getTypeKind(type) === "object") {
            append(`interface ${name} `);
            appendObjectType(type as z.ZodObject);
        }
        else {
            append(`type ${name} = `);
            appendTypeDefinition(type);
            append(";");
        }
        appendNewLine();
    }
    return result;

    function append(s: string) {
        if (startOfLine) {
            result += "    ".repeat(indent);
            startOfLine = false;
        }
        result += s;
    }

    function appendNewLine() {
        append("\n");
        startOfLine = true;
    }

    function appendType(type: z.ZodType, minPrecedence = 0) {
        const name = namedTypes.get(getTypeIdentity(type));
        if (name) {
            append(name);
        }
        else {
            const parenthesize = getTypePrecedence(type) < minPrecedence;
            if (parenthesize) append("(");
            appendTypeDefinition(type);
            if (parenthesize) append(")");
        }
    }

    function appendTypeDefinition(type: z.ZodType) {
        switch (getTypeKind(type)) {
            case "string":
                return append("string");
            case "number":
            case "int":
                return append("number");
            case "boolean":
                return append("boolean");
            case "date":
                return append("Date");
            case "undefined":
                return append("undefined");
            case "null":
                return append("null");
            case "unknown":
                return append("unknown");
            case "array":
                return appendArrayType(type);
            case "object":
                return appendObjectType(type);
            case "union": {
                const unionDef = type._zod.def as z.core.$ZodDiscriminatedUnionDef | z.core.$ZodUnionDef;
                return appendUnionOrIntersectionTypes(unionDef.options as readonly z.ZodType[], TypePrecedence.Union);
            }
            case "intersection": {
                const intersectionDef = type._zod.def as z.core.$ZodIntersectionDef;
                return appendUnionOrIntersectionTypes([intersectionDef.left as z.ZodType, intersectionDef.right as z.ZodType], TypePrecedence.Intersection);
            }
            case "tuple":
                return appendTupleType(type);
            case "record":
                return appendRecordType(type);
            case "literal": {
                const litValues = (type._zod.def as z.core.$ZodLiteralDef<z.core.util.Literal>).values;
                return append(litValues.map(v => typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? JSON.stringify(v) : "any").join(" | "));
            }
            case "enum":
                return append(Object.values((type._zod.def as z.core.$ZodEnumDef).entries).map(value => JSON.stringify(value)).join(" | "));
            case "optional":
                return appendUnionOrIntersectionTypes([(type._zod.def as z.core.$ZodOptionalDef).innerType as z.ZodType, z.undefined()], TypePrecedence.Union);
            case "readonly":
                return appendReadonlyType(type);
        }
        append("any");
    }

    function appendArrayType(arrayType: z.ZodType) {
        appendType((arrayType._zod.def as z.core.$ZodArrayDef).element as z.ZodType, TypePrecedence.Object);
        append("[]");
    }

    function appendObjectType(objectType: z.ZodType) {
        append("{");
        appendNewLine();
        indent++;
        for (let [name, type] of Object.entries((objectType._zod.def as z.core.$ZodObjectDef).shape) as [string, z.ZodType][]) {
            const comment = type.description;
            append(name);
            if (getTypeKind(type) === "optional") {
                append("?");
                type = (type._zod.def as z.core.$ZodOptionalDef).innerType as z.ZodType;
            }
            append(": ");
            appendType(type);
            append(";");
            if (comment) append(` // ${comment}`);
            appendNewLine();
        }
        indent--;
        append("}");
    }

    function appendUnionOrIntersectionTypes(types: readonly z.ZodType[], minPrecedence: TypePrecedence) {
        let first = true;
        for (const type of types) {
            if (!first) append(minPrecedence === TypePrecedence.Intersection ? " & " : " | ");
            appendType(type, minPrecedence);
            first = false;
        }
    }

    function appendTupleType(tupleType: z.ZodType) {
        append("[");
        let first = true;
        const tupleDef = tupleType._zod.def as z.core.$ZodTupleDef;
        for (let type of tupleDef.items as z.ZodType[]) {
            if (!first) append(", ");
            if (getTypeKind(type) === "optional") {
                appendType((type._zod.def as z.core.$ZodOptionalDef).innerType as z.ZodType, TypePrecedence.Object);
                append("?");
            }
            else {
                appendType(type);
            }
            first = false;
        }
        const rest = tupleDef.rest;
        if (rest) {
            if (!first) append(", ");
            append("...");
            appendType(rest as z.ZodType, TypePrecedence.Object);
            append("[]");
        }
        append("]");
    }

    function appendRecordType(recordType: z.ZodType) {
        append("Record<");
        appendType((recordType._zod.def as z.core.$ZodRecordDef).keyType as z.ZodType);
        append(", ");
        appendType((recordType._zod.def as z.core.$ZodRecordDef).valueType as z.ZodType);
        append(">");
    }

    function appendLiteral(value: unknown) {
        append(typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? JSON.stringify(value) : "any");
    }

    function appendReadonlyType(readonlyType: z.ZodType) {
        append("Readonly<");
        appendType((readonlyType._zod.def as z.core.$ZodReadonlyDef).innerType as z.ZodType);
        append(">");
    }
}
