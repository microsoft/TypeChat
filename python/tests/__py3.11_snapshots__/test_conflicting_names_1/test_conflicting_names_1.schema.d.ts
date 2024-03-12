// Entry point is: 'Derived'

// ERRORS:
// !!! dict was not a TypedDict, dataclass, or type alias, and cannot be translated.

interface Derived extends dict {
    "my_attr_1": string;
    "my_attr_2": number;
}

interface dict {
}
