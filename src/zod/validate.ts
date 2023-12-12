import { z } from "zod";
import { success, error } from '../result';
import { TypeChatJsonValidator } from '../typechat';

/**
 * Returns a JSON validator for a given Zod schema. The schema is supplied as an object where each property provides
 * a name for an associated Zod type. The type argument `T` represents the target Zod type in the schema. The `validate`
 * method of the returned object validates a JSON object against the supplied schema, the `getSchemaText` method obtains
 * the TypeScript source text representation of the schema, and the `getTypeName` method obtains the name of the given
 * target type in the schema.
 * @param schema A schema object where each property provides a name for an associated Zod type.
 * @param targetType The target type for the JSON validation. This must be one of the Zod types in the schema.
 * @returns A `TypeChatJsonValidator<z.TypeOf<T>>, where T is the type of `targetType`.
 */
export function createZodJsonValidator<T extends z.ZodType>(schema: Record<string, z.ZodType>, targetType: T): TypeChatJsonValidator<z.TypeOf<T>> {
    let schemaText: string;
    let typeName: string;
    const validator: TypeChatJsonValidator<z.TypeOf<T>> = {
        getSchemaText: () => schemaText ??= getZodSchemaAsTypeScript(schema),
        getTypeName: () => typeName ??= getTypeName(schema, targetType) ?? "???",
        validate
    };
    return validator;

    function validate(jsonObject: object) {
        const result = targetType.safeParse(jsonObject);
        if (!result.success) {
            return error(result.error.issues.map(({ path, message }) => `${path.map(key => `[${JSON.stringify(key)}]`).join("")}: ${message}`).join("\""));
        }
        return success(result.data as z.TypeOf<T>);
    }
}

function getTypeKind(type: z.ZodType) {
    return (type._def as z.ZodTypeDef & { typeName: z.ZodFirstPartyTypeKind }).typeName;
}

function getTypeIdentity(type: z.ZodType): object {
    switch (getTypeKind(type)) {
        case z.ZodFirstPartyTypeKind.ZodObject:
            return (type._def as z.ZodObjectDef).shape();
        case z.ZodFirstPartyTypeKind.ZodEnum:
            return (type._def as z.ZodEnumDef).values;
        case z.ZodFirstPartyTypeKind.ZodUnion:
            return (type._def as z.ZodUnionDef).options;
    }
    return type;
}

const enum TypePrecedence {
    Union = 0,
    Intersection = 1,
    Object = 2
}

function getTypePrecendece(type: z.ZodType): TypePrecedence {
    switch (getTypeKind(type)) {
        case z.ZodFirstPartyTypeKind.ZodEnum:
        case z.ZodFirstPartyTypeKind.ZodUnion:
        case z.ZodFirstPartyTypeKind.ZodDiscriminatedUnion:
            return TypePrecedence.Union;
        case z.ZodFirstPartyTypeKind.ZodIntersection:
            return TypePrecedence.Intersection;
    }
    return TypePrecedence.Object;
}

function getTypeName(types: Record<string, z.ZodType>, type: z.ZodType): string | undefined {
    const id = getTypeIdentity(type);
    for (const [name, type] of Object.entries(types)) {
        if (getTypeIdentity(type) === id) {
            return name;
        }
    }
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
        const description = type._def.description;
        if (description) {
            for (const comment of description.split("\n")) {
                append(`// ${comment}`);
                appendNewLine();
            }
        }
        if (getTypeKind(type) === z.ZodFirstPartyTypeKind.ZodObject) {
            append(`interface ${name} `);
            appendObjectType(type as z.ZodObject<z.ZodRawShape>);
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
            const parenthesize = getTypePrecendece(type) < minPrecedence;
            if (parenthesize) append("(");
            appendTypeDefinition(type);
            if (parenthesize) append(")");
        }
    }

    function appendTypeDefinition(type: z.ZodType) {
        switch (getTypeKind(type)) {
            case z.ZodFirstPartyTypeKind.ZodString:
                return append("string");
            case z.ZodFirstPartyTypeKind.ZodNumber:
                return append("number");
            case z.ZodFirstPartyTypeKind.ZodBoolean:
                return append("boolean");
            case z.ZodFirstPartyTypeKind.ZodDate:
                return append("Date");
            case z.ZodFirstPartyTypeKind.ZodUndefined:
                return append("undefined");
            case z.ZodFirstPartyTypeKind.ZodNull:
                return append("null");
            case z.ZodFirstPartyTypeKind.ZodUnknown:
                return append("unknown");
            case z.ZodFirstPartyTypeKind.ZodArray:
                return appendArrayType(type);
            case z.ZodFirstPartyTypeKind.ZodObject:
                return appendObjectType(type);
            case z.ZodFirstPartyTypeKind.ZodUnion:
                return appendUnionOrIntersectionTypes((type._def as z.ZodUnionDef).options, TypePrecedence.Union);
            case z.ZodFirstPartyTypeKind.ZodDiscriminatedUnion:
                return appendUnionOrIntersectionTypes([...(type._def as z.ZodDiscriminatedUnionDef<string>).options.values()], TypePrecedence.Union);
            case z.ZodFirstPartyTypeKind.ZodIntersection:
                return appendUnionOrIntersectionTypes((type._def as z.ZodUnionDef).options, TypePrecedence.Intersection);
            case z.ZodFirstPartyTypeKind.ZodTuple:
                return appendTupleType(type);
            case z.ZodFirstPartyTypeKind.ZodRecord:
                return appendRecordType(type);
            case z.ZodFirstPartyTypeKind.ZodLiteral:
                return appendLiteral((type._def as z.ZodLiteralDef).value);
            case z.ZodFirstPartyTypeKind.ZodEnum:
                return append((type._def as z.ZodEnumDef).values.map(value => JSON.stringify(value)).join(" | "));
            case z.ZodFirstPartyTypeKind.ZodOptional:
                return appendUnionOrIntersectionTypes([(type._def as z.ZodOptionalDef).innerType, z.undefined()], TypePrecedence.Union);
            case z.ZodFirstPartyTypeKind.ZodReadonly:
                return appendReadonlyType(type);
        }
        append("any");
    }

    function appendArrayType(arrayType: z.ZodType) {
        appendType((arrayType._def as z.ZodArrayDef).type, TypePrecedence.Object);
        append("[]");
    }

    function appendObjectType(objectType: z.ZodType) {
        append("{");
        appendNewLine();
        indent++;
        for (let [name, type] of Object.entries((objectType._def as z.ZodObjectDef).shape())) {
            const comment = type.description;
            append(name);
            if (getTypeKind(type) === z.ZodFirstPartyTypeKind.ZodOptional) {
                append("?");
                type = (type._def as z.ZodOptionalDef).innerType;
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
        for (let type of (tupleType._def as z.ZodTupleDef<z.ZodTupleItems, z.ZodType>).items) {
            if (!first) append(", ");
            if (getTypeKind(type) === z.ZodFirstPartyTypeKind.ZodOptional) {
                appendType((type._def as z.ZodOptionalDef).innerType, TypePrecedence.Object);
                append("?");
            }
            else {
                appendType(type);
            }
            first = false;
        }
        const rest = (tupleType._def as z.ZodTupleDef<z.ZodTupleItems, z.ZodType>).rest;
        if (rest) {
            if (!first) append(", ");
            append("...");
            appendType(rest, TypePrecedence.Object);
            append("[]");
        }
        append("]");
    }

    function appendRecordType(recordType: z.ZodType) {
        append("Record<");
        appendType((recordType._def as z.ZodRecordDef).keyType);
        append(", ");
        appendType((recordType._def as z.ZodRecordDef).valueType);
        append(">");
    }

    function appendLiteral(value: unknown) {
        append(typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? JSON.stringify(value) : "any");
    }

    function appendReadonlyType(readonlyType: z.ZodType) {
        append("Readonly<");
        appendType((readonlyType._def as z.ZodReadonlyDef).innerType);
        append(">");
    }
}
