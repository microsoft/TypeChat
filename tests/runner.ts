// Copyright Microsoft Corp

// Run all registered tests

import { TestContext, TestFunction, runTests} from "./testing";
import * as vectormath_test from "./vectormath_test";
import * as embedding_tests from "./embedding_test";
import * as config_tests from "./config_test";
import * as openai_tests from "./openai_test";

// Add your unit test to run here...
let tests : TestFunction[] = [
    config_tests.runTests,
    vectormath_test.runTests,
    embedding_tests.runTests,
    openai_tests.runTests
];

runTests(tests, true);

