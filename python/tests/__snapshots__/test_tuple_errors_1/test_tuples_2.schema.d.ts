// Entry point is: 'TupleContainer'

// ERRORS:
// !!! '()' cannot be used as a type annotation.
// !!! '()' cannot be used as a type annotation.
// !!! '()' cannot be used as a type annotation.
// !!! The tuple type 'tuple[...]' is ill-formed. Tuples with an ellipsis can only take the form 'tuple[SomeType, ...]'.
// !!! The tuple type 'tuple[int, int, ...]' is ill-formed. Tuples with an ellipsis can only take the form 'tuple[SomeType, ...]'.
// !!! The tuple type 'tuple[..., int]' is ill-formed because the ellipsis (...) cannot be the first element.
// !!! The tuple type 'tuple[..., ...]' is ill-formed because the ellipsis (...) cannot be the first element.
// !!! The tuple type 'tuple[int, ..., int]' is ill-formed. Tuples with an ellipsis can only take the form 'tuple[SomeType, ...]'.
// !!! The tuple type 'tuple[int, ..., int, ...]' is ill-formed. Tuples with an ellipsis can only take the form 'tuple[SomeType, ...]'.

interface TupleContainer {
    "empty_tuples_args_1": [any, any];
    "empty_tuples_args_2": any[];
    "arbitrary_length_1": any[];
    "arbitrary_length_2": any[];
    "arbitrary_length_3": any[];
    "arbitrary_length_4": any[];
    "arbitrary_length_5": any[];
    "arbitrary_length_6": any[];
}
