from pathlib import Path
import sys
import types

from typing_extensions import Any, override
import pytest

from syrupy.extensions.single_file import SingleFileSnapshotExtension, WriteMode
from syrupy.location import PyTestLocation

from typechat._internal.ts_conversion import TypeScriptSchemaConversionResult, python_type_to_typescript_schema

class TypeScriptSchemaSnapshotExtension(SingleFileSnapshotExtension):
    _write_mode = WriteMode.TEXT
    _file_extension = "schema.d.ts"

    @override
    def serialize(self, data: TypeScriptSchemaConversionResult, *,
        exclude: Any = None,
        include: Any = None,
        matcher: Any = None,
    ) -> str:
        result_str = f"// Entry point is: '{data.typescript_type_reference}'\n\n"
        if data.errors:
            result_str += "// ERRORS:\n"
            for err in data.errors:
                result_str += f"// !!! {err}\n"
            result_str += "\n"

        result_str += data.typescript_schema_str
        return result_str

class PyVersionedTypeScriptSchemaSnapshotExtension(TypeScriptSchemaSnapshotExtension):
    py_ver_dir: str = f"__py{sys.version_info.major}.{sys.version_info.minor}_snapshots__"

    @override
    @classmethod
    def dirname(cls, *, test_location: PyTestLocation) -> str:
        result = Path(test_location.filepath).parent.joinpath(
            f"{cls.py_ver_dir}",
            test_location.basename,
        )
        return str(result)

class PyVersioned3_12_PlusSnapshotExtension(PyVersionedTypeScriptSchemaSnapshotExtension):
    py_ver_dir: str = f"__py3.12+_snapshots__"

def check_snapshot_for_module_string_if_3_12_plus(snapshot: Any, input_type_str: str, module_str: str):
    if sys.version_info < (3, 12):
        pytest.skip("requires python 3.12 or higher")

    module = types.ModuleType("test_module")
    exec(module_str, module.__dict__)
    type_obj = eval(input_type_str, globals(), module.__dict__)

    assert(python_type_to_typescript_schema(type_obj) == snapshot(extension_class=PyVersioned3_12_PlusSnapshotExtension))

@pytest.fixture
def snapshot_schema(snapshot: Any):
    return snapshot.with_defaults(extension_class=TypeScriptSchemaSnapshotExtension)
