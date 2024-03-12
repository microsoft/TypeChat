// Entry point is: 'Derived'

// ERRORS:
// !!! Cannot create a schema using two types with the same name. C conflicts between <class 'tests.test_conflicting_names_1.a.<locals>.C'> and <class 'tests.test_conflicting_names_1.b.<locals>.C'>

interface Derived extends C, C {
}

interface C {
    "my_attr_2": number;
}

interface C {
    "my_attr_1": string;
}
