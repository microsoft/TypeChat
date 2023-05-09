// Copyright Microsoft Corp

// Run all registered tests

import * as testFx from './testing';
import * as vectormath_test from './vectormath_test';
import * as config_tests from './config_test';
import * as openai_tests from './openai_test';

// Add your unit test to run here...
const syncTests: testFx.TestFunction[] = [
    config_tests.runTests,
    vectormath_test.runTests,
];

console.log('Sync tests Starting');
testFx.runTests(syncTests, true);
console.log('Sync tests Finished');

const asyncTests: testFx.TestFunctionAsync[] = [openai_tests.runTestsAsync];

console.log('Async tests Starting');
(async () => {
    await testFx.runTestsAsync(asyncTests, true);
    // This code will be executed after the asynchronous operation is complete
    console.log('Async tests Finished');
})();
