// Copyright Microsoft Corp

// Run all registered tests

import * as testFx from './testing';
import * as vectormath_test from './vectormath_test';
import * as config_tests from './config_test';

// Add your unit test to run here...
const syncTests: testFx.TestFunction[] = [
    config_tests.runTests,
    vectormath_test.runTests,
];

console.log('Sync tests Starting');
testFx.runTests(syncTests, true);
console.log('Sync tests Finished');
