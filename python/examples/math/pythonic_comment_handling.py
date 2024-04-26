import re
import inspect
from schema_with_comments import MathAPI


def _convert_pythonic_comments_to_annotated_docs(schema_class, debug=True):

    schema_path = inspect.getfile(schema_class)

    with open(schema_path, 'r') as file:
        schema_class_source = file.read()

    if debug:
        print("File contents before modification:")
        print("--"*50)
        print(schema_class_source)
        print("--"*50)

    pattern = r"(\w+\s*:\s*.*?)(?=\s*#\s*(.+?)(?:\n|\Z))"
    commented_fields = re.findall(pattern, schema_class_source)
    annotated_fields = []

    for field, comment in commented_fields:
        field_separator = field.split(":")
        field_name = field_separator[0].strip()
        field_type = field_separator[1].strip()

        annotated_fields.append(
            f"{field_name}: Annotated[{field_type}, Doc(\"{comment}\")]")

    for field, annotation in zip(commented_fields, annotated_fields):
        schema_class_source = schema_class_source.replace(field[0], annotation)

    if debug:
        print("File contents after modification:")
        print("--"*50)
        print(schema_class_source)
        print("--"*50)

    namespace = {}
    exec(schema_class_source, namespace)
    return namespace[schema_class.__name__]


if __name__ == "__main__":
    print(_convert_pythonic_comments_to_annotated_docs(MathAPI))