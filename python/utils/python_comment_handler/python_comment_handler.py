import tokenize
import ast
import io
import argparse

parser = argparse.ArgumentParser()
parser.add_argument("--in_path", '-i', type=str, required=True, help='Path to the schema file containing pythonic comments')
parser.add_argument("--out_path", '-o', type=str, required=True, help='Path to the output file containing the transformed schema')
parser.add_argument("--debug", '-d', action='store_true', help='Print debug information')

class PythonCommentHandler:
    def __init__(self, in_schema_path, out_schema_path, debug=False):
        self.in_schema_path = in_schema_path
        self.out_schema_path = out_schema_path
        self.debug = debug

    def _convert_pythonic_comments_to_annotated_docs(self):

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

        with open(self.in_schema_path, 'r') as f:
            schema_class_source = f.read()
            gen = tokenize.tokenize(io.BytesIO(
                schema_class_source.encode('utf-8')).readline)

        tree = ast.parse(schema_class_source)

        if self.debug:
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
                                # Remove the '#' character and any leading/trailing whitespaces
                                assgn_comment = assgn_comment.strip("#").strip()
                                break

                        if assgn_comment:
                            # If a comment is found, transform the annotation to include the comment
                            assgn_subscript = n.annotation
                            has_comments = True
                            if isinstance(assgn_subscript, ast.Subscript) and (assgn_subscript.value.id == "Required" or assgn_subscript.value.id == "NotRequired"):
                                # If the annotation is a Required or NotRequired type, add the Annotated and Doc to inner type
                                n.annotation = ast.Subscript(
                                    value=ast.Name(id=assgn_subscript.value.id, ctx=ast.Load()),
                                    slice=ast.Subscript(
                                        value=ast.Name(id="Annotated", ctx=ast.Load()),
                                        slice=ast.Tuple(
                                            elts=[
                                                assgn_subscript.slice,
                                                ast.Call(
                                                    func=ast.Name(
                                                        id="Doc", ctx=ast.Load()
                                                    ),
                                                    args=[
                                                        ast.Constant(
                                                            value=assgn_comment
                                                        )
                                                    ],
                                                    keywords=[]
                                                )
                                            ],
                                            ctx=ast.Load()
                                        ),
                                        ctx=ast.Load()
                                    ),
                                    ctx=ast.Load()
                                )
                            else:
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
                                                        value=assgn_comment
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

        if self.debug:
            print("Source code after transformation:")
            print("--"*50)
            print(transformed_schema_source)
            print("--"*50)

        with open(self.out_schema_path, 'w') as f:
            f.write(transformed_schema_source)


if __name__ == "__main__":
    args = parser.parse_args()
    handler = PythonCommentHandler(args.in_path, args.out_path, args.debug)
    handler._convert_pythonic_comments_to_annotated_docs()
    
