import {Test, TestContext} from "./testing";
import {VectorTests} from "./vectormath_test"

// Add your unit test to run here...
let tests : Test[] = [
    new VectorTests()
];
Test.runTests(tests, true);
