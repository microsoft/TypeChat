from dataclasses import dataclass

from typechat._internal.ts_conversion.python_type_to_ts_nodes import python_type_to_typescript_nodes
from typechat._internal.ts_conversion.ts_node_to_string import ts_declaration_to_str

__all__ = [
    "python_type_to_typescript_schema",
    "TypeScriptSchemaConversionResult",
]

@dataclass
class TypeScriptSchemaConversionResult:
    typescript_schema_str: str
    """The TypeScript declarations generated from the Python declarations."""

    typescript_type_reference: str
    """The TypeScript string representation of a given Python type."""

    errors: list[str]
    """Any errors that occurred during conversion."""

def python_type_to_typescript_schema(py_type: object) -> TypeScriptSchemaConversionResult:
    """Converts a Python type to a TypeScript schema."""

    node_conversion_result = python_type_to_typescript_nodes(py_type)

    decl_strs = map(ts_declaration_to_str, node_conversion_result.type_declarations)
    schema_str = "\n".join(decl_strs)

    return TypeScriptSchemaConversionResult(
        typescript_schema_str=schema_str,
        typescript_type_reference=py_type.__name__,
        errors=node_conversion_result.errors,
    )
