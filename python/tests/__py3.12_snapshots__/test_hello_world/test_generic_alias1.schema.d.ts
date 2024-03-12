// Entry point is: 'D_or_E'

type D_or_E = D | E

// This is the definition of the class E.
interface E extends C<string> {
    tag: "E";
    next: this | null;
}

// This is a generic class named C.
interface C<T> {
    x?: T;
    c: C<number | null>;
}

// This is the definition of the class D.
interface D extends C<string> {
    tag?: "D";
    // This comes from string metadata
    // within an Annotated hint.
    y: boolean | null;
    z?: number[] | null;
    other?: IndirectC;
    "non_class"?: NonClass;
    // This comes from later metadata.
    "multiple_metadata"?: string;
}

interface NonClass {
    a: number;
    "my-dict": Record<string, number>;
}

type IndirectC = C<number>
