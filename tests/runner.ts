import { TestContext, TestFunction, runTests} from "./testing";
import * as vectormath_test from "./vectormath_test";
import * as openai_tests from "./openai_test";

// Add your unit test to run here...
let tests : TestFunction[] = [
    vectormath_test.runTests,
    openai_tests.runTests
];

runTests(tests, true);

