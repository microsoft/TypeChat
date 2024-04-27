import tokenize
import ast
import io
import inspect
from schema_with_comments import MathAPI


def _convert_pythonic_comments_to_annotated_docs(schema_class, debug=True):

    def _extract_tokens_between_line_numbers(gen, start_lineno, end_lineno):
        # Extract tokens between start_lineno and end_lineno obtained from the tokenize generator
        tokens = []
        for tok in gen:
            if tok.start[0] < start_lineno:  # Skip tokens before start_lineno
                continue
            if tok.start[0] >= start_lineno and tok.end[0] <= end_lineno:
                # Add token if it is within the range
                tokens.append((tok.type, tok.string))
            elif tok.start[0] > end_lineno:  # Stop if token is beyond end_lineno
                break

        return tokens

    schema_path = inspect.getfile(schema_class)

    with open(schema_path, 'r') as f:
        schema_class_source = f.read()
        gen = tokenize.tokenize(io.BytesIO(
            schema_class_source.encode('utf-8')).readline)

    tree = ast.parse(schema_class_source)

    if debug:
        print("Source code before transformation:")
        print("--"*50)
        print(schema_class_source)
        print("--"*50)

    has_comments = False  # Flag later used to perform imports of Annotated and Doc if needed

    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            for n in node.body:
                if isinstance(n, ast.AnnAssign):  # Check if the node is an annotated assignment
                    assgn_comment = None
                    tokens = _extract_tokens_between_line_numbers(
                        # Extract tokens between the line numbers of the annotated assignment
                        gen, n.lineno, n.end_lineno
                    )
                    for toknum, tokval in tokens:
                        if toknum == tokenize.COMMENT:
                            # Extract the comment
                            assgn_comment = tokval
                            break

                    if assgn_comment:
                        # If a comment is found, transform the annotation to include the comment
                        assgn_subscript = n.annotation
                        has_comments = True
                        n.annotation = ast.Subscript(
                            value=ast.Name(id="Annotated", ctx=ast.Load()),
                            slice=ast.Tuple(
                                elts=[
                                    assgn_subscript,
                                    ast.Call(
                                        func=ast.Name(
                                            id="Doc", ctx=ast.Load()
                                        ),
                                        args=[
                                            ast.Constant(
                                                value=assgn_comment.strip("#").strip()
                                            )
                                        ],
                                        keywords=[]
                                    )
                                ],
                                ctx=ast.Load()
                            ),
                            ctx=ast.Load()
                        )

    if has_comments:
        for node in tree.body:
            if isinstance(node, ast.ImportFrom):
                if node.module == "typing_extensions":
                    if ast.alias(name="Annotated") not in node.names:
                        node.names.append(ast.alias(name="Annotated"))
                    if ast.alias(name="Doc") not in node.names:
                        node.names.append(ast.alias(name="Doc"))

    transformed_schema_source = ast.unparse(tree)

    if debug:
        print("Source code after transformation:")
        print("--"*50)
        print(transformed_schema_source)
        print("--"*50)

    namespace = {}
    exec(transformed_schema_source, namespace)
    return namespace[schema_class.__name__]


if __name__ == "__main__":
    print(_convert_pythonic_comments_to_annotated_docs(MathAPI))
