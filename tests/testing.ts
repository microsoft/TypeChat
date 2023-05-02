// Copyright Microsoft Corp
//
// Lightweight  test framework until we pick a real one
//

import { test } from "node:test";

export class TestFailedException extends Error {
    public constructor(testName : string) {
        super(testName);
    }
}

export class TestContext {
    public runTest(test : Test) : TestContext {
        this.startingTest(test);
        test.run(this);
        this.completedTest(test);
        return this;
    }

    public startingTest(testType : Test) : TestContext {
        console.log(`###${testType.constructor.name} Starting###`);            
        return this;
    }

    public completedTest(testType: Test) : TestContext {
        console.log(`###${testType.constructor.name} Success###`);            
        return this;        
    }
    public failedTest(testType : Test) : TestContext {
        console.log(`###${testType.constructor.name} Failed###`);
        return this;
    }
    public log(obj : any) : TestContext {
        console.log(obj.toString());
        return this;
    }
    public logError(e : Error) : TestContext {
        console.log(e);
        return this;
    }
}

// Inherit your test from this
export class Test {
    public get name() {
        return this.constructor.name;
    }
    public run(context : TestContext) : void {}
    public assertTrue(result : boolean) : void {
        if (!result) {
            throw new TestFailedException(this.name);
        }
    }
    public static runTests(tests : Test[], stopOnError : boolean) : void {
        let context : TestContext = new TestContext();
        for (let i = 0; i < tests.length; ++i) {
            let test : Test = tests[i];
            try {
                context.runTest(test);  
            }
            catch(e : any) {
                context.logError(e);
                context.failedTest(test);
                if (stopOnError) {
                    return;
                }
            }
        }
    }    
}

