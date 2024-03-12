from pathlib import Path
import sys

from typing_extensions import Any, override
import pytest

from syrupy.extensions.single_file import SingleFileSnapshotExtension, WriteMode
from syrupy.location import PyTestLocation

from typechat._internal.ts_conversion import TypeScriptSchemaConversionResult

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

@pytest.fixture
def snapshot_schema(snapshot: Any):
    return snapshot.with_defaults(extension_class=TypeScriptSchemaSnapshotExtension)
